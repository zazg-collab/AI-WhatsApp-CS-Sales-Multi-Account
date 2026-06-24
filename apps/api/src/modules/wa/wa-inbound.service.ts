import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import {
  AiMode,
  HermesDecision,
  MessageStatus,
  MessageType,
  SenderType,
  TakeoverStatus,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { MessageIngestService } from './message-ingest.service';
import { AiService } from '../ai/ai.service';
import { HermesService } from '../hermes/hermes.service';
import { MediaStorageService } from '../media/media-storage.service';
import { WahaClientService } from './waha-client.service';
import { isGroupJid, isDirectChatJid, isSupportedChatJid, extForMimetype, phoneToJid } from './wa.util';
import { isWithinBusinessHours } from '../../common/business-hours.util';
import type { AssetsService } from '../assets/assets.service';
import { WaMessageShape } from './wa.types';

/**
 * Processes inbound WhatsApp messages: ingests, triggers auto-away replies,
 * and runs the AI/Hermes auto-reply pipeline (ai_on / ai_draft / ai_supervised).
 */
@Injectable()
export class WaInboundService {
  private readonly logger = new Logger(WaInboundService.name);
  private readonly awayCooldownMs: number;
  private readonly mediaMaxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly ingest: MessageIngestService,
    private readonly ai: AiService,
    private readonly hermes: HermesService,
    private readonly storage: MediaStorageService,
    private readonly wahaClient: WahaClientService,
    private readonly moduleRef: ModuleRef,
    config: ConfigService,
  ) {
    const cooldown = Number(config.get('AUTO_AWAY_COOLDOWN_MS'));
    this.awayCooldownMs = Number.isFinite(cooldown) && cooldown > 0 ? cooldown : 12 * 60 * 60 * 1000;
    this.mediaMaxBytes = Number(config.get<string>('WA_MEDIA_MAX_BYTES') ?? 25 * 1024 * 1024);
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

    let mediaUrl: string | undefined;
    if (
      !opts.suppressAutomation &&
      m.mediaUrl &&
      (type === MessageType.image ||
        type === MessageType.video ||
        type === MessageType.audio ||
        type === MessageType.document)
    ) {
      mediaUrl = await this.uploadWahaMedia(m.mediaUrl, m.mediaMimetype).catch((err) => {
        this.logger.warn(`Media upload failed for ${m.key.id}: ${err}`);
        return undefined;
      });
    }

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

    if (result && !groupChat && !result.fromMe && !result.suppressAutomation) {
      if (result.customer && !result.customer.avatarUrl) {
        this.maybeFetchAvatar(accountId, result.customer.id, result.customer.phoneNumber)
          .catch(() => undefined);
      }
      if (result.csatCaptured) return;
      await this.maybeAutoAway(result).catch((err) =>
        this.logger.warn(`Auto-away failed: ${err}`),
      );
      await this.maybeAutoReply(result.conversation.id).catch((err) =>
        this.logger.error(`Auto-reply failed: ${err}`),
      );
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

  private async uploadWahaMedia(
    wahaMediaUrl: string,
    mimetype?: string | null,
  ): Promise<string | undefined> {
    const res = await fetch(wahaMediaUrl, {
      headers: { 'x-api-key': process.env.WAHA_API_KEY ?? '' },
    });
    if (!res.ok) return undefined;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > this.mediaMaxBytes) {
      this.logger.warn(`Media too large (${buffer.length} bytes), skipping`);
      return undefined;
    }
    const ext = extForMimetype(mimetype ?? '');
    const stored = await this.storage.save(buffer, ext);
    return stored.url;
  }

  private async maybeFetchAvatar(accountId: string, customerId: string, phone: string) {
    const url = await this.wahaClient.getContactAvatar(accountId, phoneToJid(phone));
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

    const externalId = await this.wahaClient.sendText(account.id, phoneToJid(customer.phoneNumber), account.awayMessage);
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

  private async maybeAutoReply(conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true },
    });
    if (!convo) { this.logger.debug(`maybeAutoReply: conversation not found: ${conversationId}`); return; }
    if (convo.takeoverStatus === TakeoverStatus.admin_takeover) { this.logger.debug(`maybeAutoReply: admin takeover active`); return; }
    if (convo.aiMode === AiMode.ai_off || convo.aiMode === AiMode.ai_paused) { this.logger.debug(`maybeAutoReply: AI mode is off/paused: ${convo.aiMode}`); return; }
    if (!convo.customer.phoneNumber) { this.logger.debug(`maybeAutoReply: no phone number`); return; }

    this.logger.debug(`maybeAutoReply: generating reply for ${conversationId}, mode=${convo.aiMode}`);
    const { text } = await this.ai.generateReply(conversationId);
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

    if (effectiveMode === AiMode.ai_draft) {
      await this.storeDraft(conversationId, convo.whatsappAccountId, text);
      return;
    }

    if (effectiveMode === AiMode.ai_supervised) {
      const review = await this.hermes.review(conversationId, text);
      if (review.decision === HermesDecision.approve) {
        await this.sendAndStore(convo, text, review.id);
      } else if (review.decision === HermesDecision.draft) {
        await this.storeDraft(conversationId, convo.whatsappAccountId, text, review.id);
      } else {
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { aiMode: AiMode.ai_paused, takeoverStatus: TakeoverStatus.waiting_admin },
        });
      }
      return;
    }

    // ai_on: send directly, then post-send audit.
    const message = await this.sendAndStore(convo, text);

    try {
      const assets = this.moduleRef.get<AssetsService>('ASSETS_SERVICE', { strict: false });
      void assets.maybeAutoSend(conversationId).catch((err: unknown) => this.logger.warn(`asset auto-send failed: ${err}`));
    } catch { /* AssetsService not resolvable */ }

    this.hermes
      .review(conversationId, text)
      .then((review) => this.prisma.message.update({ where: { id: message.id }, data: { hermesReviewId: review.id } }))
      .catch((err) => this.logger.error(`Post-send audit failed: ${err}`));
  }

  private async sendAndStore(
    convo: { id: string; whatsappAccountId: string; customer: { phoneNumber: string } },
    text: string,
    hermesReviewId?: string,
  ) {
    const externalId = await this.wahaClient.sendText(convo.whatsappAccountId, phoneToJid(convo.customer.phoneNumber), text);
    const message = await this.prisma.message.create({
      data: {
        conversationId: convo.id,
        senderType: SenderType.ai,
        content: text,
        status: MessageStatus.sent,
        aiGenerated: true,
        externalId,
        hermesReviewId,
      },
    });
    await this.prisma.conversation.update({
      where: { id: convo.id },
      data: { lastMessage: text, lastMessageAt: new Date() },
    });
    this.events.emitToAccount(convo.whatsappAccountId, 'message:new', { conversationId: convo.id, message });
    return message;
  }

  private async storeDraft(
    conversationId: string,
    accountId: string,
    text: string,
    hermesReviewId?: string,
  ) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.ai,
        content: text,
        status: MessageStatus.pending,
        aiGenerated: true,
        hermesReviewId,
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
