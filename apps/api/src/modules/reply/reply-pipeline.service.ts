import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiMode, BotStatus, SenderType, SentinelDecision, TakeoverStatus } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SentinelService } from '../sentinel/sentinel.service';
import { OrderContextService } from '../shipping/order-context.service';
import {
  FOLLOW_UP_DELAY_MS,
  FOLLOW_UP_MESSAGE,
  type ReplyChannel,
  type ReplyConversation,
  type ReplyOutcome,
} from './reply.types';

/**
 * >>> ANGGA — F3a gelombang v2 (2026-08-09, cowork): OTAK BALASAN, SATU UNTUK
 * SEMUA KANAL. Isinya dipindah UTUH dari `WaInboundService.maybeAutoReply`,
 * `handleBurstReply`, dan `maybeScheduleFollowUp` — urutan langkah, teks log,
 * dan semua cabang dipertahankan apa adanya. Yang berubah cuma tujuan efek
 * keluarnya: `this.storeDraft/sendAndStore/notifications` → `channel.*`.
 *
 * Gate F3a: `wa-inbound.service.spec.ts` TIDAK BOLEH diubah sebaris pun. Kalau
 * spec itu perlu disunting, berarti perilakunya bergeser dan potongannya salah.
 *
 * Detail yang paling gampang hilang saat memindah ini (dan karenanya diberi
 * test sendiri): `scheduleFollowUp` HANYA dipanggil di ujung jalur `ai_on`
 * sesudah kirim berhasil — mode draft & supervised TIDAK menjadwalkan apa pun.
 */
@Injectable()
export class ReplyPipelineService {
  private readonly logger = new Logger(ReplyPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly sentinel: SentinelService,
    @Optional() private readonly orderLog?: OrderContextService,
  ) {}

  async run(conversationId: string, channel: ReplyChannel): Promise<ReplyOutcome> {
    const convo = (await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true, bot: { select: { status: true } } },
    })) as unknown as ReplyConversation | null;

    if (!convo) {
      this.logger.debug(`maybeAutoReply: conversation not found: ${conversationId}`);
      return { kind: 'skipped', reason: 'no-conversation' };
    }
    if (convo.bot && convo.bot.status !== BotStatus.active) {
      this.logger.debug(`maybeAutoReply: bot status is ${convo.bot.status}, not active`);
      return { kind: 'skipped', reason: 'bot-inactive' };
    }
    if (convo.takeoverStatus === TakeoverStatus.admin_takeover) {
      this.logger.debug(`maybeAutoReply: admin takeover active`);
      return { kind: 'skipped', reason: 'takeover' };
    }
    if (convo.aiMode === AiMode.ai_off || convo.aiMode === AiMode.ai_paused) {
      this.logger.debug(`maybeAutoReply: AI mode is off/paused: ${convo.aiMode}`);
      return { kind: 'skipped', reason: 'ai-off' };
    }
    if (!convo.customer.phoneNumber) {
      this.logger.debug(`maybeAutoReply: no phone number`);
      return { kind: 'skipped', reason: 'no-phone' };
    }

    const burst = await this.trailingCustomerBurst(conversationId);
    const isBurst = burst.length > 1;
    if (convo.aiMode === AiMode.ai_draft || convo.aiMode === AiMode.ai_supervised || isBurst) {
      await channel.expireStaleDrafts(convo);
    }
    if (isBurst) return this.handleBurst(conversationId, convo, burst, channel);

    this.logger.debug(`maybeAutoReply: generating reply for ${conversationId}, mode=${convo.aiMode}`);
    let sambutanForm: string | null = null;
    try {
      sambutanForm =
        (await this.orderLog?.formWelcome(
          conversationId,
          burst[0]?.id ?? '',
          burst[0]?.content ?? '',
          convo.customer.name ?? null,
          convo.customer.phoneNumber ?? null,
        )) ?? null;
    } catch (err) {
      this.logger.warn(`Sambutan form gagal (lanjut ke LLM): ${err}`);
      sambutanForm = null;
    }
    const { text, moneyBlocked, moneyGateIssues } = sambutanForm
      ? { text: sambutanForm, moneyBlocked: false, moneyGateIssues: undefined as string[] | undefined }
      : await this.ai.generateReply(conversationId);
    if (!text) {
      this.logger.debug(`maybeAutoReply: generateReply returned empty text`);
      return { kind: 'skipped', reason: 'empty-text' };
    }

    // TOCTOU guard: re-read after AI generation which can take >10s.
    const fresh = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { aiMode: true, takeoverStatus: true },
    });
    if (!fresh) return { kind: 'skipped', reason: 'stale' };
    if (fresh.takeoverStatus === TakeoverStatus.admin_takeover) return { kind: 'skipped', reason: 'stale' };
    if (fresh.aiMode === AiMode.ai_off || fresh.aiMode === AiMode.ai_paused) return { kind: 'skipped', reason: 'stale' };
    const effectiveMode = fresh.aiMode;

    if (moneyBlocked) {
      await channel.draft(convo, text, { moneyGateIssues });
      channel.notifyAdmin(
        `⚠️ Gerbang uang menahan balasan
${convo.customer.phoneNumber}: ${(moneyGateIssues ?? []).join('; ')}
Draft menunggu dicek admin (Edit dulu) sebelum bisa dikirim.`,
      );
      return { kind: 'drafted', reason: 'money-gate' };
    }

    if (effectiveMode === AiMode.ai_draft) {
      await channel.draft(convo, text);
      return { kind: 'drafted', reason: 'ai-draft' };
    }

    if (effectiveMode === AiMode.ai_supervised) {
      let review;
      try {
        review = await this.sentinel.review(conversationId, text);
      } catch (err) {
        this.logger.error(`Sentinel review failed (supervised mode fallback to draft): ${err instanceof Error ? err.message : err}`);
        await channel.draft(convo, text);
        return { kind: 'drafted', reason: 'sentinel-error' };
      }
      if (review.decision === SentinelDecision.approve) {
        try {
          const { messageId } = await channel.send(convo, text, review.id);
          return { kind: 'sent', messageId };
        } catch (err) {
          this.logger.error(`Send failed after Sentinel approval (fallback to draft): ${err instanceof Error ? err.message : err}`);
          await channel.draft(convo, text, { sentinelReviewId: review.id });
          return { kind: 'drafted', reason: 'send-failed' };
        }
      }
      if (review.decision === SentinelDecision.draft) {
        await channel.draft(convo, text, { sentinelReviewId: review.id });
        return { kind: 'drafted', reason: 'sentinel-draft' };
      }
      await this.pauseAi(conversationId);
      return { kind: 'paused' };
    }

    let messageId: string;
    try {
      ({ messageId } = await channel.send(convo, text));
    } catch (err) {
      this.logger.error(`Send failed in ai_on mode (fallback to draft): ${err instanceof Error ? err.message : err}`);
      await channel.draft(convo, text);
      return { kind: 'drafted', reason: 'send-failed' };
    }

    channel.autoSendAssets?.(conversationId);

    this.sentinel
      .review(conversationId, text)
      .then((review) => this.prisma.message.update({ where: { id: messageId }, data: { sentinelReviewId: review.id } }))
      .catch((err) => this.logger.error(`Post-send audit failed: ${err}`));

    this.ai.leadScore(conversationId).catch((err) => this.logger.warn(`Lead score failed: ${err}`));

    this.maybeScheduleFollowUp(conversationId, channel).catch((err) =>
      this.logger.warn(`Follow-up scheduling failed: ${err}`),
    );

    return { kind: 'sent', messageId };
  }

  /** >>> ANGGA — e4415a5: dijadwalkan HANYA saat langkah funnel ada di
   *  `closing`/`closing_followup`. Keputusannya di sini (sama untuk semua
   *  kanal); eksekusinya di kanal. <<< */
  private async maybeScheduleFollowUp(conversationId: string, channel: ReplyChannel) {
    if (!channel.scheduleFollowUp) return;
    const expect = await this.ai.getFunnelExpect(conversationId);
    if (expect === 'closing' || expect === 'closing_followup') {
      await channel.scheduleFollowUp(conversationId, FOLLOW_UP_MESSAGE, FOLLOW_UP_DELAY_MS);
    }
  }

  private async handleBurst(
    conversationId: string,
    convo: ReplyConversation,
    burst: Array<{ id: string; content: string | null; messageType: string }>,
    channel: ReplyChannel,
  ): Promise<ReplyOutcome> {
    this.logger.debug(`handleBurstReply: ${burst.length} messages in burst for ${conversationId}`);
    const segments = await this.ai.generateSegmentedReply(
      conversationId,
      burst.map((m, i) => ({ index: i + 1, content: m.content, messageType: m.messageType })),
    );
    if (segments.length === 0) return { kind: 'skipped', reason: 'no-segments' };

    const fresh = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { aiMode: true, takeoverStatus: true },
    });
    if (!fresh) return { kind: 'skipped', reason: 'stale' };
    if (fresh.takeoverStatus === TakeoverStatus.admin_takeover) return { kind: 'skipped', reason: 'stale' };
    if (fresh.aiMode === AiMode.ai_off || fresh.aiMode === AiMode.ai_paused) return { kind: 'skipped', reason: 'stale' };

    let reviewId: string | undefined;
    if (fresh.aiMode === AiMode.ai_supervised || fresh.aiMode === AiMode.ai_on) {
      const combined = segments.map((s) => s.text).join('\n\n');
      try {
        const review = await this.sentinel.review(conversationId, combined, { multiTopicBurst: true });
        reviewId = review.id;
        if (review.decision !== SentinelDecision.approve && review.decision !== SentinelDecision.draft) {
          await this.pauseAi(conversationId);
          return { kind: 'paused' };
        }
      } catch (err) {
        this.logger.error(`Sentinel review failed on burst (fallback to draft): ${err instanceof Error ? err.message : err}`);
      }
    }

    for (const segment of segments) {
      const quotedMessageId =
        segment.answersIndex != null ? burst[segment.answersIndex - 1]?.id ?? null : null;
      await channel.draft(convo, segment.text, {
        sentinelReviewId: reviewId,
        quotedMessageId,
        moneyGateIssues: segment.moneyGateIssues,
      });
    }

    const moneyGatedSegments = segments.filter((s) => s.moneyGateIssues?.length);
    if (moneyGatedSegments.length) {
      const allIssues = moneyGatedSegments.flatMap((s) => s.moneyGateIssues ?? []);
      channel.notifyAdmin(
        `⚠️ Gerbang uang menahan balasan
${convo.customer.phoneNumber}: ${allIssues.join('; ')}
Draft menunggu dicek admin (Edit dulu) sebelum bisa dikirim.`,
      );
    }

    if (fresh.aiMode !== AiMode.ai_draft && !moneyGatedSegments.length) {
      channel.notifyAdmin(
        `📝 Balasan AI ditahan untuk approval\n${convo.customer.phoneNumber} mengirim beberapa pesan dengan topik berbeda — ${segments.length} draft balasan menunggu dicek admin sebelum kirim.`,
      );
    }

    return { kind: 'drafted', reason: 'burst', count: segments.length };
  }

  private async pauseAi(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiMode: AiMode.ai_paused, takeoverStatus: TakeoverStatus.waiting_admin },
    });
  }

  /** Deretan pesan customer yang belum dijawab, lama→baru. >1 = burst.
   *  Dipindah UTUH dari `WaInboundService` — murni baca tabel Message, tidak
   *  ada yang khas WhatsApp, jadi milik pipeline bukan kanal. */
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
}
