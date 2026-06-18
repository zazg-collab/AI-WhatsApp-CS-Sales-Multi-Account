import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { downloadMediaMessage, type proto } from '@whiskeysockets/baileys';
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
import { WaSendService } from './wa-send.service';
import {
  jidToPhone,
  isGroupJid,
  isDirectChatJid,
  isSupportedChatJid,
  extForMimetype,
} from './wa.util';
import { isWithinBusinessHours } from '../../common/business-hours.util';
import type { AssetsService } from '../assets/assets.service';

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
    private readonly send: WaSendService,
    private readonly moduleRef: ModuleRef,
    config: ConfigService,
  ) {
    const cooldown = Number(config.get('AUTO_AWAY_COOLDOWN_MS'));
    this.awayCooldownMs = Number.isFinite(cooldown) && cooldown > 0 ? cooldown : 12 * 60 * 60 * 1000;
    this.mediaMaxBytes = Number(config.get<string>('WA_MEDIA_MAX_BYTES') ?? 25 * 1024 * 1024);
  }

  async handleIncoming(
    accountId: string,
    m: proto.IWebMessageInfo,
    opts: { suppressAutomation?: boolean } = {},
  ) {
    const remoteJid = m.message?.deviceSentMessage?.destinationJid ?? m.key.remoteJid;
    if (!remoteJid) return;
    if (!isSupportedChatJid(remoteJid)) return;
    const groupChat = isGroupJid(remoteJid);
    const fromMe = m.key.fromMe === true;
    const msg = this.unwrapMessage(m.message);

    const text =
      msg?.conversation ??
      msg?.extendedTextMessage?.text ??
      msg?.imageMessage?.caption ??
      msg?.videoMessage?.caption ??
      msg?.documentMessage?.caption ??
      '';

    const type = this.resolveType(msg);
    if (!text && type === MessageType.text) return;

    let mediaUrl: string | undefined;
    if (!opts.suppressAutomation &&
        (type === MessageType.image || type === MessageType.video ||
         type === MessageType.audio || type === MessageType.document)) {
      mediaUrl = await this.downloadInboundMedia(m).catch((err) => {
        this.logger.warn(`Media download failed for ${m.key.id}: ${err}`);
        return undefined;
      });
    }

    const ctx =
      msg?.extendedTextMessage?.contextInfo ??
      msg?.imageMessage?.contextInfo ??
      msg?.videoMessage?.contextInfo ??
      msg?.documentMessage?.contextInfo;

    const key = m.key as typeof m.key & { senderPn?: string | null; participantPn?: string | null };
    const senderPn = key.senderPn ?? key.participantPn ?? undefined;

    const result = await this.ingest.ingest({
      accountId,
      remoteJid,
      senderPn: senderPn ?? undefined,
      externalId: m.key.id ?? '',
      pushName: m.pushName ?? undefined,
      text,
      type,
      mediaUrl,
      quotedExternalId: ctx?.stanzaId ?? undefined,
      fromMe,
      occurredAt: this.messageTimestamp(m),
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

  private async maybeFetchAvatar(accountId: string, customerId: string, phone: string) {
    const url = await this.send.fetchAvatar(accountId, phone);
    if (!url) return;
    await this.prisma.customer.update({ where: { id: customerId }, data: { avatarUrl: url } });
    this.events.emitToAccount(accountId, 'customer:avatar', { customerId, avatarUrl: url });
  }

  private messageTimestamp(m: proto.IWebMessageInfo): Date | undefined {
    const raw = m.messageTimestamp;
    if (raw === undefined || raw === null) return undefined;
    const seconds = Number(typeof raw === 'object' && 'toString' in raw ? raw.toString() : raw);
    if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
    return new Date(seconds * 1000);
  }

  private unwrapMessage(message?: proto.IMessage | null): proto.IMessage | undefined {
    let current = message ?? undefined;
    for (let i = 0; i < 5 && current; i++) {
      const wrapped =
        current.ephemeralMessage?.message ??
        current.viewOnceMessage?.message ??
        current.viewOnceMessageV2?.message ??
        current.viewOnceMessageV2Extension?.message ??
        current.documentWithCaptionMessage?.message ??
        current.deviceSentMessage?.message;
      if (!wrapped || wrapped === current) return current;
      current = wrapped;
    }
    return current;
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

    const externalId = await this.send.sendText(account.id, customer.phoneNumber, account.awayMessage);
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
    const externalId = await this.send.sendText(convo.whatsappAccountId, convo.customer.phoneNumber, text);
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

  private async downloadInboundMedia(m: proto.IWebMessageInfo): Promise<string | undefined> {
    const buffer = await downloadMediaMessage(m as never, 'buffer', {});
    if (!buffer || buffer.length === 0) return undefined;
    if (buffer.length > this.mediaMaxBytes) {
      this.logger.warn(`Media ${m.key.id} is ${buffer.length}B > cap ${this.mediaMaxBytes}B, skipping`);
      return undefined;
    }
    const mime =
      m.message?.imageMessage?.mimetype ??
      m.message?.videoMessage?.mimetype ??
      m.message?.audioMessage?.mimetype ??
      m.message?.documentMessage?.mimetype;
    const { url } = await this.storage.save(buffer, extForMimetype(mime));
    return url;
  }

  private resolveType(msg?: proto.IMessage | null): MessageType {
    if (msg?.imageMessage) return MessageType.image;
    if (msg?.videoMessage) return MessageType.video;
    if (msg?.audioMessage) return MessageType.audio;
    if (msg?.documentMessage) return MessageType.document;
    if (msg?.stickerMessage) return MessageType.sticker;
    if (msg?.locationMessage) return MessageType.location;
    return MessageType.text;
  }

  /** Check if a phone is a direct (non-group) chat. Delegates to util. */
  isDirectChatJid(jid: string): boolean {
    return isDirectChatJid(jid);
  }
}
