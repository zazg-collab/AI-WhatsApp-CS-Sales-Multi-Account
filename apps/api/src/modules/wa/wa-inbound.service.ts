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
// >>> ANGGA — F3a (2026-08-09, cowork): otak balasan pindah ke ReplyPipeline;
// berkas ini tinggal jadi ADAPTER kanal WhatsApp. <<<
import { ReplyPipelineService } from '../reply/reply-pipeline.service';
import type { ReplyChannel, ReplyConversation } from '../reply/reply.types';

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
    // >>> ANGGA — F3a: opsional SENGAJA. Dua spec lama membangun service ini
    // dengan 9 argumen posisional; kalau parameter ini wajib, spec-spec itu
    // harus disunting — padahal justru merekalah gerbang bukti bahwa F3a
    // tidak menggeser perilaku. Kalau tidak disuntik, pipeline dibangun
    // sendiri dari dependensi yang memang sudah dipegang service ini. <<<
    @Optional() private readonly injectedPipeline?: ReplyPipelineService,
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
      
      try {
        const FollowUpsService = require('../followups/followups.service').FollowUpsService;
        const followUps = this.moduleRef.get(FollowUpsService, { strict: false });
        await followUps.cancelByConversation(result.conversation.id);
      } catch (err) { /* FollowUpsService not resolvable */ }
      
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

  private pipelineFallback?: ReplyPipelineService;
  private get replyPipeline(): ReplyPipelineService {
    return (this.injectedPipeline ??
      (this.pipelineFallback ??= new ReplyPipelineService(this.prisma, this.ai, this.sentinel, this.orderLog)));
  }

  /** >>> ANGGA — F3a: adapter kanal WhatsApp. Semua efek keluar yang khas WA
   *  tinggal di sini; keputusannya milik `ReplyPipelineService`. <<< */
  private waChannel(): ReplyChannel {
    return {
      expireStaleDrafts: async (convo: ReplyConversation) => {
        await this.expireStaleDrafts(convo.id, convo.whatsappAccountId);
      },
      send: async (convo: ReplyConversation, text: string, sentinelReviewId?: string) => {
        const message = await this.sendAndStore(
          { id: convo.id, whatsappAccountId: convo.whatsappAccountId, customer: { phoneNumber: convo.customer.phoneNumber } },
          text,
          sentinelReviewId,
        );
        return { messageId: message.id };
      },
      draft: async (convo: ReplyConversation, text: string, opts) => {
        await this.storeDraft(
          convo.id,
          convo.whatsappAccountId,
          text,
          opts?.sentinelReviewId,
          opts?.quotedMessageId,
          opts?.moneyGateIssues,
        );
      },
      notifyAdmin: (pesan: string) => {
        this.notifications.send(pesan);
      },
      autoSendAssets: (conversationId: string) => {
        try {
          const assets = this.moduleRef.get<AssetsService>('ASSETS_SERVICE', { strict: false });
          void assets.maybeAutoSend(conversationId).catch((err: unknown) => this.logger.warn(`asset auto-send failed: ${err}`));
        } catch { /* AssetsService not resolvable */ }
      },
      scheduleFollowUp: async (conversationId: string, pesan: string, delayMs: number) => {
        try {
          const FollowUpsService = require('../followups/followups.service').FollowUpsService;
          const followUps = this.moduleRef.get(FollowUpsService, { strict: false });
          if (!followUps) return;
          await followUps.schedule({
            conversationId,
            scheduledAt: new Date(Date.now() + delayMs).toISOString(),
            message: pesan,
          });
        } catch (err) {
          this.logger.warn(`Failed to schedule follow-up: ${err instanceof Error ? err.message : err}`);
        }
      },
    };
  }

  private async maybeAutoReply(conversationId: string) {
    await this.replyPipeline.run(conversationId, this.waChannel());
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
