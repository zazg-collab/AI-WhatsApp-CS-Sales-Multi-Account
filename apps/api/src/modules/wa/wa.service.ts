import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  type WASocket,
  type proto,
} from '@whiskeysockets/baileys';
import {
  AiMode,
  HermesDecision,
  MessageStatus,
  MessageType,
  SenderType,
  SessionStatus,
  TakeoverStatus,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { MessageIngestService } from './message-ingest.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AiService } from '../ai/ai.service';
import { HermesService } from '../hermes/hermes.service';
import { phoneToJid, humanDelay, isDirectChatJid, extForMimetype } from './wa.util';
import { MediaStorageService } from '../media/media-storage.service';
import { logAudit } from '../../common/audit.util';

interface Session {
  sock: WASocket;
  qr?: string; // latest QR as data-URL PNG
}

/**
 * Manages one Baileys connection per WhatsApp account. Sessions are keyed
 * by account id; auth state is persisted under WA_SESSION_DIR so a restart
 * resumes without re-scanning the QR.
 */
@Injectable()
export class WaService implements OnModuleInit {
  private readonly logger = new Logger(WaService.name);
  private readonly sessions = new Map<string, Session>();
  private readonly sessionDir: string;
  private readonly mediaMaxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly ingest: MessageIngestService,
    private readonly ai: AiService,
    private readonly hermes: HermesService,
    private readonly notifications: NotificationsService,
    private readonly storage: MediaStorageService,
    config: ConfigService,
  ) {
    this.sessionDir = config.get<string>('WA_SESSION_DIR') ?? './.wa-sessions';
    this.mediaMaxBytes = Number(
      config.get<string>('WA_MEDIA_MAX_BYTES') ?? 25 * 1024 * 1024,
    );
  }

  /** Reconnect every active account on boot. */
  async onModuleInit() {
    const accounts = await this.prisma.whatsappAccount.findMany({
      where: { isActive: true },
    });
    for (const account of accounts) {
      this.startSession(account.id).catch((err) =>
        this.logger.error(`Failed to start session ${account.id}: ${err}`),
      );
    }
  }

  async startSession(accountId: string): Promise<void> {
    if (this.sessions.has(accountId)) return;

    const { state, saveCreds } = await useMultiFileAuthState(
      join(this.sessionDir, accountId),
    );
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }) as never,
      printQRInTerminal: false,
    });

    this.sessions.set(accountId, { sock });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr);
        const session = this.sessions.get(accountId);
        if (session) session.qr = dataUrl;
        await this.setStatus(accountId, SessionStatus.qr_required);
        this.events.emitToAccount(accountId, 'wa:qr', { accountId, qr: dataUrl });
      }

      if (connection === 'open') {
        const session = this.sessions.get(accountId);
        if (session) session.qr = undefined;
        await this.setStatus(accountId, SessionStatus.connected);
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })
          ?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        this.sessions.delete(accountId);

        if (loggedOut) {
          await this.setStatus(accountId, SessionStatus.disconnected);
          this.logger.warn(`Account ${accountId} logged out`);
        } else {
          await this.setStatus(accountId, SessionStatus.reconnecting);
          this.logger.log(`Account ${accountId} reconnecting...`);
          setTimeout(() => {
            this.startSession(accountId).catch((err) =>
              this.logger.error(`Reconnect failed ${accountId}: ${err}`),
            );
          }, 3000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        await this.handleIncoming(accountId, m);
      }
    });
  }

  private async handleIncoming(accountId: string, m: proto.IWebMessageInfo) {
    if (m.key.fromMe || !m.key.remoteJid) return;
    // Only 1-on-1 chats (M1): drop groups, broadcast lists, newsletters.
    if (!isDirectChatJid(m.key.remoteJid)) return;

    const text =
      m.message?.conversation ??
      m.message?.extendedTextMessage?.text ??
      m.message?.imageMessage?.caption ??
      m.message?.videoMessage?.caption ??
      m.message?.documentMessage?.caption ??
      '';

    const type = this.resolveType(m);

    // Download inbound media to WA_MEDIA_DIR and reference it as /media/<file>.
    // Failure is non-fatal: the message is still ingested, just without media.
    let mediaUrl: string | undefined;
    if (type === MessageType.image || type === MessageType.video ||
        type === MessageType.audio || type === MessageType.document) {
      mediaUrl = await this.downloadInboundMedia(m).catch((err) => {
        this.logger.warn(`Media download failed for ${m.key.id}: ${err}`);
        return undefined;
      });
    }

    const result = await this.ingest.ingest({
      accountId,
      remoteJid: m.key.remoteJid,
      externalId: m.key.id ?? '',
      pushName: m.pushName ?? undefined,
      text,
      type,
      mediaUrl,
    });

    if (result) {
      await this.maybeAutoReply(result.conversation.id).catch((err) =>
        this.logger.error(`Auto-reply failed: ${err}`),
      );
    }
  }

  /**
   * AI reply path with Hermes gating:
   *   ai_off / ai_paused / admin takeover → nothing
   *   ai_draft        → generate, store as unsent draft for admin
   *   ai_supervised   → generate, Hermes reviews PRE-send and decides
   *   ai_on           → generate + send, Hermes audits POST-send
   */
  private async maybeAutoReply(conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true },
    });
    if (!convo) return;
    if (convo.takeoverStatus === TakeoverStatus.admin_takeover) return;
    if (convo.aiMode === AiMode.ai_off || convo.aiMode === AiMode.ai_paused) {
      return;
    }
    if (!convo.customer.phoneNumber) return;

    const { text } = await this.ai.generateReply(conversationId);
    if (!text) return;

    // TOCTOU guard (H2): generateReply can take >10s. An admin may have taken
    // over, paused, or switched the AI mode meanwhile. Re-read the conversation
    // and abort if the world changed under us, then honour the *current* mode.
    const fresh = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { aiMode: true, takeoverStatus: true },
    });
    if (!fresh) return;
    if (fresh.takeoverStatus === TakeoverStatus.admin_takeover) return;
    if (fresh.aiMode === AiMode.ai_off || fresh.aiMode === AiMode.ai_paused) {
      return;
    }
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
        // block / pause_ai / takeover_required — hold AI for this customer.
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            aiMode: AiMode.ai_paused,
            takeoverStatus: TakeoverStatus.waiting_admin,
          },
        });
      }
      return;
    }

    // ai_on: send directly, then post-send audit (no gating).
    const message = await this.sendAndStore(convo, text);
    this.hermes
      .review(conversationId, text)
      .then((review) =>
        this.prisma.message.update({
          where: { id: message.id },
          data: { hermesReviewId: review.id },
        }),
      )
      .catch((err) => this.logger.error(`Post-send audit failed: ${err}`));
  }

  private async sendAndStore(
    convo: { id: string; whatsappAccountId: string; customer: { phoneNumber: string } },
    text: string,
    hermesReviewId?: string,
  ) {
    const externalId = await this.sendText(
      convo.whatsappAccountId,
      convo.customer.phoneNumber,
      text,
    );
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

  /** Persist an AI draft without sending; the dashboard shows it for review. */
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
    this.events.emitToAccount(accountId, 'message:draft', { conversationId, message });
    return message;
  }

  /**
   * Download an inbound media message's bytes and persist them under
   * WA_MEDIA_DIR as <uuid>.<ext>. Returns a `/media/<file>` path served by
   * MediaController, or undefined when the payload is empty/oversized.
   */
  private async downloadInboundMedia(
    m: proto.IWebMessageInfo,
  ): Promise<string | undefined> {
    const buffer = await downloadMediaMessage(m as never, 'buffer', {});
    if (!buffer || buffer.length === 0) return undefined;
    if (buffer.length > this.mediaMaxBytes) {
      this.logger.warn(
        `Media ${m.key.id} is ${buffer.length}B > cap ${this.mediaMaxBytes}B, skipping`,
      );
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

  private resolveType(m: proto.IWebMessageInfo): MessageType {
    const msg = m.message;
    if (msg?.imageMessage) return MessageType.image;
    if (msg?.videoMessage) return MessageType.video;
    if (msg?.audioMessage) return MessageType.audio;
    if (msg?.documentMessage) return MessageType.document;
    if (msg?.stickerMessage) return MessageType.sticker;
    if (msg?.locationMessage) return MessageType.location;
    return MessageType.text;
  }

  /** Send a text message through the account's connection. */
  async sendText(accountId: string, phone: string, text: string) {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new NotFoundException(`Account ${accountId} is not connected`);
    }
    const jid = phoneToJid(phone);

    // Human-like typing indicator + delay to reduce ban risk.
    await session.sock.presenceSubscribe(jid);
    await session.sock.sendPresenceUpdate('composing', jid);
    await humanDelay();
    await session.sock.sendPresenceUpdate('paused', jid);

    const sent = await session.sock.sendMessage(jid, { text });
    return sent?.key.id ?? null;
  }

  /** Send an image or document via Baileys. */
  async sendMedia(
    accountId: string,
    phone: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    url: string,
    caption?: string,
  ): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new NotFoundException(`Account ${accountId} is not connected`);
    }
    const jid = phoneToJid(phone);
    await humanDelay();

    let content: Record<string, unknown>;
    if (mediaType === 'image') {
      content = { image: { url }, caption: caption ?? '' };
    } else if (mediaType === 'document') {
      content = {
        document: { url },
        mimetype: 'application/octet-stream',
        fileName: caption ?? 'file',
      };
    } else if (mediaType === 'audio') {
      content = { audio: { url }, mimetype: 'audio/mpeg' };
    } else {
      content = { video: { url }, caption: caption ?? '' };
    }

    const sent = await session.sock.sendMessage(jid, content as never);
    return sent?.key.id ?? null;
  }

  /**
   * Send media from raw bytes (admin upload). Bytes go straight to Baileys —
   * no URL round-trip — so the gateway never has to fetch from our own API and
   * private object storage stays private.
   */
  async sendMediaBuffer(
    accountId: string,
    phone: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    buffer: Buffer,
    mimetype: string,
    caption?: string,
    fileName?: string,
  ): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new NotFoundException(`Account ${accountId} is not connected`);
    }
    const jid = phoneToJid(phone);
    await humanDelay();

    let content: Record<string, unknown>;
    if (mediaType === 'image') {
      content = { image: buffer, caption: caption ?? '' };
    } else if (mediaType === 'document') {
      content = {
        document: buffer,
        mimetype: mimetype || 'application/octet-stream',
        fileName: fileName ?? caption ?? 'file',
      };
    } else if (mediaType === 'audio') {
      content = { audio: buffer, mimetype: mimetype || 'audio/mpeg' };
    } else {
      content = { video: buffer, caption: caption ?? '' };
    }

    const sent = await session.sock.sendMessage(jid, content as never);
    return sent?.key.id ?? null;
  }

  /** Log AI mode change to audit trail. */
  async logAiModeChange(
    conversationId: string,
    oldMode: string,
    newMode: string,
  ) {
    await logAudit(this.prisma, {
      action: 'ai_mode_change',
      entityType: 'conversation',
      entityId: conversationId,
      oldValue: { aiMode: oldMode },
      newValue: { aiMode: newMode },
    });
  }

  getQr(accountId: string): string | null {
    return this.sessions.get(accountId)?.qr ?? null;
  }

  isConnected(accountId: string): boolean {
    return this.sessions.has(accountId);
  }

  async restart(accountId: string) {
    const session = this.sessions.get(accountId);
    if (session) {
      try {
        session.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.sessions.delete(accountId);
    }
    await this.setStatus(accountId, SessionStatus.reconnecting);
    await this.startSession(accountId);
  }

  private async setStatus(accountId: string, status: SessionStatus) {
    const account = await this.prisma.whatsappAccount.update({
      where: { id: accountId },
      data: { sessionStatus: status },
    });
    this.events.emitToAccount(accountId, 'wa:status', { accountId, status });

    if (status === SessionStatus.banned || status === SessionStatus.disconnected) {
      this.notifications.send(
        `⚠️ WhatsApp ${status}\nAkun: ${account.accountName} (${account.phoneNumber})`,
      );
    }
  }
}
