import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import {
  AiMode,
  BotStatus, // >>> ANGGA: untuk gerbang status bot <<<
  SentinelDecision,
  MessageStatus,
  MessageType,
  SenderType,
  TakeoverStatus,
} from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { MessageIngestService } from './message-ingest.service';
import { AiService } from '../ai/ai.service';
import { SentinelService } from '../sentinel/sentinel.service';
import { WaGatewayService } from './wa-gateway.service';
import { isGroupJid, isDirectChatJid, isSupportedChatJid, phoneToJid } from './wa.util';
import { isWithinBusinessHours } from '../../common/business-hours.util';
import type { AssetsService } from '../assets/assets.service';
import { WaMessageShape } from './wa.types';
import { OrderContextService } from '../shipping/order-context.service'; // >>> ANGGA — Order Context Log <<<

/**
 * Processes inbound WhatsApp messages: ingests, triggers auto-away replies,
 * and runs the AI/Sentinel auto-reply pipeline (ai_on / ai_draft / ai_supervised).
 */
@Injectable()
export class WaInboundService {
  private readonly logger = new Logger(WaInboundService.name);
  private readonly awayCooldownMs: number;

  // ponytail: in-memory per-conversation debounce — if the API restarts mid-
  // window the timer is lost (message is still saved; that one burst just
  // doesn't get an auto-reply). Move to a BullMQ delayed job if that matters.
  // Each entry: the live timer, when the burst started (for the max-wait cap),
  // and the chat jid (so a "typing" presence can find & extend this timer).
  private readonly pendingReplies = new Map<string, { timer: NodeJS.Timeout; startedAt: number; jidKey: string | null }>();
  // jid → conversationId, so the presence handler (which only knows the jid)
  // can locate the pending timer to extend while the customer keeps typing.
  private readonly jidToConversation = new Map<string, string>();
  /** Quiet window: fire this long after the last message/typing signal. */
  private static readonly AUTO_REPLY_DEBOUNCE_MS = 8_000;
  /** Hard ceiling from the first message of a burst, so a customer who keeps
   *  typing (or a stuck "composing") can't delay the reply forever. */
  private static readonly AUTO_REPLY_MAX_WAIT_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly ingest: MessageIngestService,
    private readonly ai: AiService,
    private readonly sentinel: SentinelService,
    private readonly notifications: NotificationsService,
    private readonly gateway: WaGatewayService,
    private readonly moduleRef: ModuleRef,
    config: ConfigService,
    // >>> ANGGA — Order Context Log: deteksi "selesai order" saat pesan
    // closing (berisi substitusi {{catatan_sk}}) BENAR-BENAR terkirim.
    // Optional supaya spec lama yang membangun service ini tanpa argumen
    // tambahan tetap jalan.
    @Optional() private readonly orderLog?: OrderContextService,
    // <<< ANGGA
  ) {
    const cooldown = Number(config.get('AUTO_AWAY_COOLDOWN_MS'));
    this.awayCooldownMs = Number.isFinite(cooldown) && cooldown > 0 ? cooldown : 12 * 60 * 60 * 1000;
  }

  async handleIncoming(
    accountId: string,
    m: WaMessageShape,
    opts: { suppressAutomation?: boolean } = {},
  ): Promise<void> {
    const remoteJid = m.key.remoteJid;
    if (!remoteJid) return;
    if (!isSupportedChatJid(remoteJid)) return;

    const groupChat = isGroupJid(remoteJid);
    const fromMe = m.key.fromMe === true;

    const type = this.wahaTypeToMessageType(m.wahaType);
    const text = m.body ?? '';
    if (!text && type === MessageType.text) return;

    // Media is already downloaded to storage and resolved to a URL by the
    // connection layer (WaService.ingestBaileysMessage) before we get here.
    const mediaUrl: string | undefined = m.mediaUrl ?? undefined;

    const result = await this.ingest.ingest({
      accountId,
      remoteJid,
      senderPn: m.key.senderPn ?? undefined,
      externalId: m.key.id ?? '',
      pushName: m.pushName ?? undefined,
      text,
      type,
      mediaUrl,
      quotedExternalId: m.quotedId ?? undefined,
      fromMe,
      occurredAt: m.messageTimestamp
        ? new Date(m.messageTimestamp * 1000)
        : new Date(),
      suppressAutomation: opts.suppressAutomation || groupChat,
    });

    if (result && !groupChat && !result.fromMe) {
      // Profile picture lookup works off the raw JID (lid or real number) and
      // has no side effects, so it's safe to run during history backfill too
      // — unlike the AI/Sentinel pipeline below, which stays gated.
      if (result.customer && !result.customer.avatarUrl) {
        this.maybeFetchAvatar(accountId, result.customer.id, remoteJid).catch(() => undefined);
      }
      // >>> ANGGA — addendum v2 M3: pesan form funnel ("saya sudah melakukan
      // pemesanan <PRODUK> ...") di-seed deterministik ke offer registry —
      // pesan template = fakta pasti, tidak perlu LLM menebak ulang.
      // Fire-and-forget; guard dedupe per pesan ada di service-nya.
      void this.orderLog?.noteInboundForm(
        result.conversation.id,
        (result as { message?: { id?: string } }).message?.id ?? m.key.id ?? '',
        text,
      );
      // <<< ANGGA
      if (result.suppressAutomation) return;
      if (result.csatCaptured) return;
      await this.maybeAutoAway(result).catch((err) =>
        this.logger.warn(`Auto-away failed: ${err}`),
      );
      this.scheduleAutoReply(result.conversation.id, accountId, remoteJid);
    }
  }

  private wahaTypeToMessageType(wahaType: string): MessageType {
    const map: Record<string, MessageType> = {
      text: MessageType.text,
      image: MessageType.image,
      video: MessageType.video,
      audio: MessageType.audio,
      voice: MessageType.audio,
      document: MessageType.document,
      sticker: MessageType.document,
      location: MessageType.text,
      poll_creation: MessageType.text,
    };
    return map[wahaType] ?? MessageType.text;
  }

  private async maybeFetchAvatar(accountId: string, customerId: string, jid: string) {
    const url = await this.gateway.getContactAvatar(accountId, jid);
    if (!url) return;
    await this.prisma.customer.update({ where: { id: customerId }, data: { avatarUrl: url } });
    this.events.emitToAccount(accountId, 'customer:avatar', { customerId, avatarUrl: url });
  }

  private async maybeAutoAway(result: {
    conversation: { id: string; aiMode: AiMode; lastAwayAt: Date | null };
    customer: { phoneNumber: string };
    account: {
      id: string;
      awayMessage: string | null;
      businessHoursEnabled: boolean;
      businessHoursStart: string | null;
      businessHoursEnd: string | null;
      businessDays: number[];
      businessTimezone: string | null;
    };
  }) {
    const { conversation, customer, account } = result;
    if (!account.businessHoursEnabled || !account.awayMessage) return;
    if (conversation.aiMode === AiMode.ai_on) return;
    if (isWithinBusinessHours(account)) return;

    const cutoff = new Date(Date.now() - this.awayCooldownMs);
    const claim = await this.prisma.conversation.updateMany({
      where: { id: conversation.id, OR: [{ lastAwayAt: null }, { lastAwayAt: { lt: cutoff } }] },
      data: { lastAwayAt: new Date() },
    });
    if (claim.count === 0) return;

    const externalId = await this.gateway.sendText(account.id, phoneToJid(customer.phoneNumber), account.awayMessage);
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.system,
        content: account.awayMessage,
        status: MessageStatus.sent,
        externalId,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: account.awayMessage, lastMessageAt: new Date() },
    });
    this.events.emitToAccount(account.id, 'message:new', { conversationId: conversation.id, message });
  }

  /**
   * Debounce auto-reply per conversation: a customer who sends several
   * messages in quick succession (text, then an image, then a follow-up)
   * should get ONE reply that accounts for all of them, not one stale draft
   * per message. Each new message resets the quiet window; a "typing" presence
   * extends it too (see onCustomerTyping). Generation only runs once the
   * customer has been quiet for AUTO_REPLY_DEBOUNCE_MS — or the max-wait cap
   * is hit, whichever comes first.
   *
   * @param accountId/remoteJid optional — when given, the chat is subscribed
   * to presence so "typing" signals can extend the window, and the jid is
   * mapped so onCustomerTyping can find this timer.
   */
  private scheduleAutoReply(conversationId: string, accountId?: string, remoteJid?: string) {
    const existing = this.pendingReplies.get(conversationId);
    // First message of a new burst → record the start (cap anchor) and, if we
    // know the chat, subscribe to its typing presence.
    const startedAt = existing?.startedAt ?? Date.now();
    const jidKey = existing?.jidKey ?? (accountId && remoteJid ? `${accountId}:${remoteJid}` : null);
    if (!existing && jidKey && accountId && remoteJid) {
      this.jidToConversation.set(jidKey, conversationId);
      this.gateway.subscribePresence(accountId, remoteJid).catch(() => undefined);
    }
    this.armReplyTimer(conversationId, startedAt, jidKey);
  }

  /** (Re)arm the per-conversation timer, bounding the total wait by the
   *  max-wait cap measured from the burst's first message. */
  private armReplyTimer(conversationId: string, startedAt: number, jidKey: string | null) {
    const prev = this.pendingReplies.get(conversationId);
    if (prev) clearTimeout(prev.timer);
    const capRemaining = startedAt + WaInboundService.AUTO_REPLY_MAX_WAIT_MS - Date.now();
    const delay = Math.max(0, Math.min(WaInboundService.AUTO_REPLY_DEBOUNCE_MS, capRemaining));
    const timer = setTimeout(() => {
      this.pendingReplies.delete(conversationId);
      if (jidKey) this.jidToConversation.delete(jidKey);
      this.maybeAutoReply(conversationId).catch((err) =>
        this.logger.error(`Auto-reply failed: ${err}`),
      );
    }, delay);
    this.pendingReplies.set(conversationId, { timer, startedAt, jidKey });
  }

  /**
   * The customer is typing (WhatsApp "composing"/"recording" presence). If a
   * reply is already pending for their chat, push the quiet window out so we
   * don't answer mid-thought — bounded by the max-wait cap. Typing with no
   * pending reply is ignored (a fresh message starts the next burst).
   */
  onCustomerTyping(accountId: string, remoteJid: string) {
    const conversationId = this.jidToConversation.get(`${accountId}:${remoteJid}`);
    if (!conversationId) return;
    const pending = this.pendingReplies.get(conversationId);
    if (!pending) return;
    this.armReplyTimer(conversationId, pending.startedAt, pending.jidKey);
  }

  /** Block any draft still awaiting approval — it was generated before the
   *  customer's latest burst of messages and no longer reflects them. */
  private async expireStaleDrafts(conversationId: string, accountId: string) {
    const stale = await this.prisma.message.findMany({
      where: { conversationId, status: MessageStatus.pending, aiGenerated: true },
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.prisma.message.updateMany({
      where: { id: { in: stale.map((m) => m.id) } },
      data: { status: MessageStatus.failed },
    });
    for (const { id } of stale) {
      this.events.emitToAccount(accountId, 'message:draft-removed', { conversationId, messageId: id });
    }
  }

  private async maybeAutoReply(conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      // >>> ANGGA: bot ikut diambil untuk memeriksa statusnya <<<
      include: { customer: true, bot: { select: { status: true } } },
    });
    if (!convo) { this.logger.debug(`maybeAutoReply: conversation not found: ${conversationId}`); return; }
    // >>> ANGGA: gerbang status bot. Sebelumnya `Bot.status` (active/inactive/
    // draft) tersimpan tapi tidak pernah dibaca kode mana pun — mau apa pun
    // isinya, bot tetap membalas. Sekarang hanya bot `active` yang bekerja,
    // jadi status ini berfungsi sebagai saklar mati per-bot tanpa perlu
    // melepas penugasan akun (dan kehilangan konfigurasinya).
    // Percakapan TANPA bot sengaja dibiarkan lewat — perilaku lama tetap:
    // balas dengan persona bawaan.
    if (convo.bot && convo.bot.status !== BotStatus.active) {
      this.logger.debug(`maybeAutoReply: bot status is ${convo.bot.status}, not active`);
      return;
    }
    // <<< ANGGA
    if (convo.takeoverStatus === TakeoverStatus.admin_takeover) { this.logger.debug(`maybeAutoReply: admin takeover active`); return; }
    if (convo.aiMode === AiMode.ai_off || convo.aiMode === AiMode.ai_paused) { this.logger.debug(`maybeAutoReply: AI mode is off/paused: ${convo.aiMode}`); return; }
    if (!convo.customer.phoneNumber) { this.logger.debug(`maybeAutoReply: no phone number`); return; }

    // The customer's unanswered run of messages. >1 = a burst that may mix
    // several topics → handled by the segmented path below; a burst always
    // produces drafts (even in ai_on), so its stale drafts are expired too.
    const burst = await this.trailingCustomerBurst(conversationId);
    const isBurst = burst.length > 1;
    if (convo.aiMode === AiMode.ai_draft || convo.aiMode === AiMode.ai_supervised || isBurst) {
      await this.expireStaleDrafts(conversationId, convo.whatsappAccountId);
    }

    if (isBurst) {
      await this.handleBurstReply(conversationId, convo, burst);
      return;
    }

    this.logger.debug(`maybeAutoReply: generating reply for ${conversationId}, mode=${convo.aiMode}`);
    // >>> ANGGA — E1 (2026-08-05, ketok Bossfren): pesan FORM funnel dibalas
    // TEMPLATE deterministik yang dirender sistem (OrderContextService.
    // formWelcome) — LLM tidak dipanggil untuk giliran itu, wording pasti,
    // angka harga ditulis sistem. Hasilnya masuk percabangan mode AI yang SAMA
    // di bawah (ai_draft → draft, ai_on → kirim, supervised → review), sesuai
    // ketok "ikut AI mode". Burst (form + pertanyaan lain sekaligus) sengaja
    // tidak lewat sini — jalur segmented menanganinya via LLM + seed M3.
    let sambutanForm: string | null = null;
    try {
      sambutanForm =
        (await this.orderLog?.formWelcome(
          conversationId,
          burst[0]?.id ?? '',
          burst[0]?.content ?? '',
          (convo.customer as { name?: string | null }).name ?? null,
          convo.customer.phoneNumber ?? null,
        )) ?? null;
    } catch (err) {
      this.logger.warn(`Sambutan form gagal (lanjut ke LLM): ${err}`);
      sambutanForm = null;
    }
    const { text, moneyBlocked, moneyGateIssues } = sambutanForm
      ? { text: sambutanForm, moneyBlocked: false, moneyGateIssues: undefined as string[] | undefined }
      : await this.ai.generateReply(conversationId);
    // <<< ANGGA
    if (!text) { this.logger.debug(`maybeAutoReply: generateReply returned empty text`); return; }

    // TOCTOU guard: re-read after AI generation which can take >10s.
    const fresh = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { aiMode: true, takeoverStatus: true },
    });
    if (!fresh) return;
    if (fresh.takeoverStatus === TakeoverStatus.admin_takeover) return;
    if (fresh.aiMode === AiMode.ai_off || fresh.aiMode === AiMode.ai_paused) return;
    const effectiveMode = fresh.aiMode;

    // >>> ANGGA — Fase 113 (2026-08-04): gerbang uang menahan balasan ini
    // (token {{...}} tak terselesaikan, atau angka rupiah ditulis model
    // sendiri) — paksa draft di SEMUA mode, didahulukan sebelum percabangan
    // di bawah supaya ai_on tidak sempat kirim tanpa gerbang ini. "Jangan
    // pernah kirim teks yang masih memuat {{...}}" berlaku mutlak; lihat
    // AiService.gateMoneyTokens untuk detail lengkap kenapa ini tidak bisa
    // hanya jadi gerbang Sentinel (post-send untuk AI ON).
    if (moneyBlocked) {
      await this.storeDraft(conversationId, convo.whatsappAccountId, text, undefined, undefined, moneyGateIssues);
      // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): sebelum ini TIDAK
      // ADA notifikasi sama sekali untuk balasan tunggal yang ditahan gerbang
      // uang — satu-satunya cara admin tahu adalah buka inbox manual (dan
      // sebelum perbaikan sebelumnya, "tahu"-nya cuma dari teks "⚠️ [...]"
      // yang nempel di draft). Sekarang notifikasi dikirim di SEMUA mode AI
      // (bukan cuma mode yang biasanya tidak dijaga admin) — soalnya ini
      // bukan draft rutin, ini sinyal bot HAMPIR kirim harga/ongkir yang
      // belum terverifikasi, layak diberi tahu langsung apa pun mode-nya.
      this.notifications.send(
        `⚠️ Gerbang uang menahan balasan
${convo.customer.phoneNumber}: ${(moneyGateIssues ?? []).join('; ')}
Draft menunggu dicek admin (Edit dulu) sebelum bisa dikirim.`,
      );
      return;
    }
    // <<< ANGGA

    if (effectiveMode === AiMode.ai_draft) {
      await this.storeDraft(conversationId, convo.whatsappAccountId, text);
      return;
    }

    if (effectiveMode === AiMode.ai_supervised) {
      let review;
      try {
        review = await this.sentinel.review(conversationId, text);
      } catch (err) {
        // M1: Hermes/provider timeout/failure. Don't lose the message. Fall back to draft
        // so the admin can see it and manually route the decision. Log the failure for ops.
        this.logger.error(`Sentinel review failed (supervised mode fallback to draft): ${err instanceof Error ? err.message : err}`);
        await this.storeDraft(conversationId, convo.whatsappAccountId, text);
        return;
      }
      if (review.decision === SentinelDecision.approve) {
        try {
          await this.sendAndStore(convo, text, review.id);
        } catch (err) {
          // Send itself failed (e.g. account disconnected mid-flight) — the
          // draft already passed review, don't drop it silently.
          this.logger.error(`Send failed after Sentinel approval (fallback to draft): ${err instanceof Error ? err.message : err}`);
          await this.storeDraft(conversationId, convo.whatsappAccountId, text, review.id);
        }
      } else if (review.decision === SentinelDecision.draft) {
        await this.storeDraft(conversationId, convo.whatsappAccountId, text, review.id);
      } else {
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { aiMode: AiMode.ai_paused, takeoverStatus: TakeoverStatus.waiting_admin },
        });
      }
      return;
    }

    let message;
    try {
      message = await this.sendAndStore(convo, text);
    } catch (err) {
      // ai_on send failed outright (e.g. account disconnected mid-flight) —
      // hold the already-generated reply as a draft instead of losing it.
      this.logger.error(`Send failed in ai_on mode (fallback to draft): ${err instanceof Error ? err.message : err}`);
      await this.storeDraft(conversationId, convo.whatsappAccountId, text);
      return;
    }

    try {
      const assets = this.moduleRef.get<AssetsService>('ASSETS_SERVICE', { strict: false });
      void assets.maybeAutoSend(conversationId).catch((err: unknown) => this.logger.warn(`asset auto-send failed: ${err}`));
    } catch { /* AssetsService not resolvable */ }

    this.sentinel
      .review(conversationId, text)
      .then((review) => this.prisma.message.update({ where: { id: message.id }, data: { sentinelReviewId: review.id } }))
      .catch((err) => this.logger.error(`Post-send audit failed: ${err}`));

    // Fire-and-forget: score the lead (PRD 7.7) after receiving enough context
    // (now that a reply has been generated/sent). Never blocks the reply pipeline.
    this.ai
      .leadScore(conversationId)
      .catch((err) => this.logger.warn(`Lead score failed: ${err}`));
  }

  /**
   * Multi-message burst: ask the AI to split the burst into topics and draft
   * one reply per topic, each quoting the message that started that topic.
   * Every reply is held as a draft for admin approval regardless of AI mode —
   * a combined/segmented answer is too easy to get partly wrong to auto-send.
   */
  private async handleBurstReply(
    conversationId: string,
    convo: { whatsappAccountId: string; customer: { phoneNumber: string } },
    burst: Array<{ id: string; content: string | null; messageType: string }>,
  ) {
    this.logger.debug(`handleBurstReply: ${burst.length} messages in burst for ${conversationId}`);
    const segments = await this.ai.generateSegmentedReply(
      conversationId,
      burst.map((m, i) => ({ index: i + 1, content: m.content, messageType: m.messageType })),
    );
    if (segments.length === 0) return;

    // TOCTOU guard: re-read after generation (can take >10s).
    const fresh = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { aiMode: true, takeoverStatus: true },
    });
    if (!fresh) return;
    if (fresh.takeoverStatus === TakeoverStatus.admin_takeover) return;
    if (fresh.aiMode === AiMode.ai_off || fresh.aiMode === AiMode.ai_paused) return;

    // Risk gate (supervised/on only) over the combined draft text. A
    // block/pause/takeover verdict pauses the bot instead of leaving drafts.
    let reviewId: string | undefined;
    if (fresh.aiMode === AiMode.ai_supervised || fresh.aiMode === AiMode.ai_on) {
      const combined = segments.map((s) => s.text).join('\n\n');
      try {
        const review = await this.sentinel.review(conversationId, combined, { multiTopicBurst: true });
        reviewId = review.id;
        if (review.decision !== SentinelDecision.approve && review.decision !== SentinelDecision.draft) {
          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { aiMode: AiMode.ai_paused, takeoverStatus: TakeoverStatus.waiting_admin },
          });
          return;
        }
      } catch (err) {
        // Same fallback as the single-message path: don't lose the segments
        // just because Sentinel/the provider timed out — hold them as drafts
        // (reviewId left unset) so an admin can see and route them manually.
        this.logger.error(`Sentinel review failed on burst (fallback to draft): ${err instanceof Error ? err.message : err}`);
      }
    }

    for (const segment of segments) {
      const quotedMessageId =
        segment.answersIndex != null ? burst[segment.answersIndex - 1]?.id ?? null : null;
      await this.storeDraft(
        conversationId,
        convo.whatsappAccountId,
        segment.text,
        reviewId,
        quotedMessageId,
        segment.moneyGateIssues,
      );
    }

    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): sama seperti balasan
    // tunggal, segmen burst yang ditahan gerbang uang layak diberi tahu di
    // SEMUA mode (bukan cuma kalau bukan ai_draft) — ini bukan draft rutin,
    // ini sinyal bot HAMPIR kirim harga/ongkir yang belum terverifikasi.
    const moneyGatedSegments = segments.filter((s) => s.moneyGateIssues?.length);
    if (moneyGatedSegments.length) {
      const allIssues = moneyGatedSegments.flatMap((s) => s.moneyGateIssues ?? []);
      this.notifications.send(
        `⚠️ Gerbang uang menahan balasan
${convo.customer.phoneNumber}: ${allIssues.join('; ')}
Draft menunggu dicek admin (Edit dulu) sebelum bisa dikirim.`,
      );
    }

    // ai_draft admins already watch every draft; only ping for modes that
    // would normally not need a human (supervised/on). Kalau notifikasi
    // gerbang uang di atas SUDAH terkirim, tidak perlu dobel dengan yang
    // generik ini.
    if (fresh.aiMode !== AiMode.ai_draft && !moneyGatedSegments.length) {
      this.notifications.send(
        `📝 Balasan AI ditahan untuk approval\n${convo.customer.phoneNumber} mengirim beberapa pesan dengan topik berbeda — ${segments.length} draft balasan menunggu dicek admin sebelum kirim.`,
      );
    }
  }

  /** The customer's unanswered trailing run, oldest→newest. Length > 1 means a
   *  burst the AI hasn't replied to yet. Capped at 20 for sanity. */
  private async trailingCustomerBurst(
    conversationId: string,
  ): Promise<Array<{ id: string; content: string | null; messageType: string }>> {
    const recent = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, senderType: true, content: true, messageType: true },
    });
    const run: typeof recent = [];
    for (const m of recent) {
      if (m.senderType !== SenderType.customer) break;
      run.push(m);
    }
    return run.reverse().map(({ id, content, messageType }) => ({ id, content, messageType }));
  }

  private async sendAndStore(
    convo: { id: string; whatsappAccountId: string; customer: { phoneNumber: string } },
    text: string,
    sentinelReviewId?: string,
  ) {
    const externalId = await this.gateway.sendText(convo.whatsappAccountId, phoneToJid(convo.customer.phoneNumber), text);
    const message = await this.prisma.message.create({
      data: {
        conversationId: convo.id,
        senderType: SenderType.ai,
        content: text,
        status: MessageStatus.sent,
        aiGenerated: true,
        externalId,
        sentinelReviewId,
      },
    });
    await this.prisma.conversation.update({
      where: { id: convo.id },
      data: { lastMessage: text, lastMessageAt: new Date() },
    });
    this.events.emitToAccount(convo.whatsappAccountId, 'message:new', { conversationId: convo.id, message });
    // >>> ANGGA — Order Context Log (v1.1 §12.3-11 + addendum v2 M1): hook
    // pesan keluar yang BENAR-BENAR terkirim — deteksi closing (penanda
    // selesai) + scan PENAWARAN (teks yang menyebut produk katalog tercatat
    // sebagai offer, jangkar untuk "yg ini/yg itu"). Fire-and-forget.
    void this.orderLog?.noteOutbound(convo.id, message.id, text);
    // <<< ANGGA
    return message;
  }

  private async storeDraft(
    conversationId: string,
    accountId: string,
    text: string,
    sentinelReviewId?: string,
    quotedMessageId?: string | null,
    moneyGateIssues?: string[],
  ) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.ai,
        content: text,
        status: MessageStatus.pending,
        aiGenerated: true,
        sentinelReviewId,
        quotedMessageId: quotedMessageId ?? undefined,
        // Alasan penahanan gerbang uang dipersist TERPISAH dari content
        // (koreksi 2026-08-04, temuan Bossfren) — sebelumnya prefiks
        // "⚠️ [gerbang uang menahan: ...]" ikut ditulis ke content, artinya
        // klik "Approve" tanpa "Edit" dulu akan mengirim teks debug internal
        // itu apa adanya ke pelanggan. content sekarang SELALU bersih.
        moneyGateIssues: moneyGateIssues?.length ? moneyGateIssues : undefined,
      },
      // Include the quoted source so the dashboard can show which customer
      // message each segmented draft answers, and this draft's OWN Sentinel
      // review (koreksi 2026-08-04, temuan Bossfren) — null when the draft
      // was created without one (mis. ditahan gerbang uang), which the web
      // card must show as "belum direview", bukan review lama yang tidak
      // nyambung.
      include: {
        quotedMessage: { select: { id: true, content: true, senderType: true, messageType: true } },
        sentinelReview: {
          select: {
            id: true,
            decision: true,
            confidenceScore: true,
            riskScore: true,
            riskLevel: true,
            reason: true,
            recommendation: true,
          },
        },
      },
    });
    this.logger.debug(`storeDraft: created draft ${message.id} for conversation ${conversationId}`);
    this.events.emitToAccount(accountId, 'message:draft', { conversationId, message });
    return message;
  }

  /** Check if a phone is a direct (non-group) chat. Delegates to util. */
  isDirectChatJid(jid: string): boolean {
    return isDirectChatJid(jid);
  }
}
