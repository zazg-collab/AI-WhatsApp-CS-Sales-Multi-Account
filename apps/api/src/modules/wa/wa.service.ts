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
  type WASocket,
  type proto,
} from '@whiskeysockets/baileys';
import {
  AiMode,
  MessageType,
  SenderType,
  SessionStatus,
  TakeoverStatus,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { MessageIngestService } from './message-ingest.service';
import { AiService } from '../ai/ai.service';
import { phoneToJid, humanDelay } from './wa.util';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly ingest: MessageIngestService,
    private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.sessionDir = config.get<string>('WA_SESSION_DIR') ?? './.wa-sessions';
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
        this.events.emit('wa:qr', { accountId, qr: dataUrl });
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
    if (m.key.remoteJid === 'status@broadcast') return;

    const text =
      m.message?.conversation ??
      m.message?.extendedTextMessage?.text ??
      m.message?.imageMessage?.caption ??
      m.message?.videoMessage?.caption ??
      '';

    const type = this.resolveType(m);

    const result = await this.ingest.ingest({
      accountId,
      remoteJid: m.key.remoteJid,
      externalId: m.key.id ?? '',
      pushName: m.pushName ?? undefined,
      text,
      type,
    });

    if (result) {
      await this.maybeAutoReply(result.conversation.id).catch((err) =>
        this.logger.error(`Auto-reply failed: ${err}`),
      );
    }
  }

  /**
   * Auto-reply path: only fires when the conversation is in AI_ON and no
   * admin has taken over. Draft/supervised modes are handled by the
   * dashboard (and, later, the Hermes review gate) — not auto-sent here.
   */
  private async maybeAutoReply(conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true },
    });
    if (!convo) return;
    if (convo.aiMode !== AiMode.ai_on) return;
    if (convo.takeoverStatus === TakeoverStatus.admin_takeover) return;
    if (!convo.customer.phoneNumber) return;

    const { text } = await this.ai.generateReply(conversationId);
    if (!text) return;

    const externalId = await this.sendText(
      convo.whatsappAccountId,
      convo.customer.phoneNumber,
      text,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.ai,
        content: text,
        status: 'sent',
        aiGenerated: true,
        externalId,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessage: text, lastMessageAt: new Date() },
    });

    this.events.emit('message:new', { conversationId, message });
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
    await this.prisma.whatsappAccount.update({
      where: { id: accountId },
      data: { sessionStatus: status },
    });
    this.events.emit('wa:status', { accountId, status });
  }
}
