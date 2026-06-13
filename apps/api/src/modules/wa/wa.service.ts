import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { join } from 'path';
import * as QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers,
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
import { phoneToJid, jidToPhone, humanDelay, isDirectChatJid, isLidJid, extForMimetype, typingDelay, backoffDelay } from './wa.util';
import { MediaStorageService } from '../media/media-storage.service';
import { logAudit } from '../../common/audit.util';
import { isWithinBusinessHours } from '../../common/business-hours.util';

interface Session {
  sock: WASocket;
  qr?: string; // latest QR as data-URL PNG
  /** phone→lid mapping from Baileys events for resolving linked device JIDs. */
  lidMap: Map<string, string>; // lid → phoneJid
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
  private readonly awayCooldownMs: number;
  private readonly syncFullHistory: boolean;

  // Anti-ban + stability state (in-memory; survives reconnect, not restart).
  private static readonly MAX_RECONNECT_ATTEMPTS = 10;
  private static readonly MAX_SENDS_PER_MINUTE = 20;
  private readonly reconnectAttempts = new Map<string, number>();
  private readonly sendTimestamps = new Map<string, number[]>();
  private readonly reconnectingSince = new Map<string, number>();

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
    const cooldown = Number(config.get('AUTO_AWAY_COOLDOWN_MS'));
    this.awayCooldownMs = Number.isFinite(cooldown) && cooldown > 0 ? cooldown : 12 * 60 * 60 * 1000;
    this.syncFullHistory = config.get<string>('WA_SYNC_FULL_HISTORY') !== 'false';
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
      logger: pino({ level: 'warn' }) as never,
      printQRInTerminal: false,
      // Request WhatsApp history chunks so the app mirrors chats sent/read on the phone.
      // macOS/desktop browser identity is required by Baileys for full history sync.
      syncFullHistory: this.syncFullHistory,
      browser: Browsers.macOS('Desktop'),
    });

    this.sessions.set(accountId, { sock, lidMap: new Map() });

    sock.ev.on('creds.update', saveCreds);

    // Build a lid→phoneJid mapping from Baileys contact events.
    // Linked devices receive @lid JIDs; this map lets us resolve them to phone JIDs.
    const populateLidMap = (contacts: { id?: string; lid?: string }[]) => {
      const session = this.sessions.get(accountId);
      if (!session) return;
      for (const c of contacts) {
        if (c.id && c.lid && c.id.endsWith('@s.whatsapp.net')) {
          session.lidMap.set(c.lid, c.id);
        }
      }
    };

    sock.ev.on('contacts.upsert', (contacts) => {
      populateLidMap(contacts as { id?: string; lid?: string }[]);
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      this.logger.log(`connection.update [${accountId}]: connection=${connection}, qr=${!!qr}, lastDisconnect=${lastDisconnect?.error?.message ?? 'none'}`);

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
        this.reconnectAttempts.set(accountId, 0);
        this.reconnectingSince.delete(accountId);
        await this.setStatus(accountId, SessionStatus.connected);
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })
          ?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        this.sessions.delete(accountId);

        if (loggedOut) {
          this.reconnectAttempts.delete(accountId);
          this.reconnectingSince.delete(accountId);
          await this.setStatus(accountId, SessionStatus.disconnected);
          this.logger.warn(`Account ${accountId} logged out`);
          const account = await this.prisma.whatsappAccount
            .findUnique({ where: { id: accountId } })
            .catch(() => null);
          this.notifications.send(
            `🚫 WhatsApp logged out / possibly banned\nAkun: ${
              account?.accountName ?? accountId
            } (${account?.phoneNumber ?? '?'}) — needs a fresh QR scan.`,
          );
        } else {
          await this.scheduleReconnect(accountId);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // notify = live traffic; append = history/backfill from the linked phone.
      // We persist both so the dashboard mirrors WhatsApp, but suppress AI/away
      // automation for backfilled history to avoid replying to old chats.
      this.logger.log(`messages.upsert [${accountId}]: type=${type}, count=${messages?.length ?? 0}`);
      if (type !== 'notify' && type !== 'append') return;
      for (const m of messages) {
        this.logger.log(`Processing message [${accountId}]: jid=${m.key?.remoteJid}, fromMe=${m.key?.fromMe}, id=${m.key?.id}`);
        await this.handleIncoming(accountId, m, { suppressAutomation: type !== 'notify' });
      }
    });

    // Baileys delivers the *initial* history sync (negotiated at QR pairing
    // when syncFullHistory is on) through this event — NOT messages.upsert.
    // Without this handler the phone's existing chats never reach the app.
    sock.ev.on('messaging-history.set', async ({ messages, contacts, isLatest }) => {
      this.logger.log(
        `History sync ${accountId}: ${messages?.length ?? 0} messages, ${contacts?.length ?? 0} contacts${isLatest ? ' (latest)' : ''}`,
      );
      // Build LID→phone mapping from history contacts and update customer names.
      populateLidMap(contacts as { id?: string; lid?: string }[]);
      for (const c of contacts ?? []) {
        if (!c.id || !isDirectChatJid(c.id)) continue;
        const name = c.name ?? c.notify;
        if (!name) continue;
        await this.prisma.customer
          .updateMany({
            where: { phoneNumber: jidToPhone(c.id), sourceAccountId: accountId, name: null },
            data: { name },
          })
          .catch(() => undefined);
      }
      for (const m of messages ?? []) {
        await this.handleIncoming(accountId, m, { suppressAutomation: true }).catch((err) =>
          this.logger.warn(`History ingest failed for ${m.key?.id}: ${err}`),
        );
      }
    });

    // Customer typing/online indicator → live to the dashboard (scoped to account).
    sock.ev.on('presence.update', ({ id, presences }) => {
      if (!isDirectChatJid(id)) return;
      const resolvedId = this.resolveJid(accountId, id);
      const state = presences?.[id]?.lastKnownPresence;
      const typing = state === 'composing' || state === 'recording';
      this.events.emitToAccount(accountId, 'wa:presence', {
        accountId,
        phone: jidToPhone(resolvedId),
        typing,
        presence: state ?? 'unavailable',
      });
    });

    // Delivery/read receipts + edits/revokes for messages → update + checkmarks.
    sock.ev.on('messages.update', async (updates) => {
      for (const u of updates) {
        if (!u.key?.id) continue;
        // Edit (protocolMessage.editedMessage) and revoke (message === null after
        // a delete-for-everyone) arrive on this channel too.
        const edited = u.update?.message?.protocolMessage?.editedMessage
          ?? (u.update?.message?.editedMessage as never);
        const revoked = u.update?.messageStubType === 1 /* REVOKE */
          || u.update?.message === null;
        if (edited) {
          const newText = (edited as { conversation?: string; extendedTextMessage?: { text?: string } })
            .conversation ?? (edited as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text ?? '';
          await this.applyEdit(accountId, u.key.id, newText).catch((err) =>
            this.logger.warn(`Edit apply failed for ${u.key?.id}: ${err}`));
          continue;
        }
        if (revoked) {
          await this.applyRevoke(accountId, u.key.id).catch((err) =>
            this.logger.warn(`Revoke apply failed for ${u.key?.id}: ${err}`));
          continue;
        }
        const status = u.update?.status;
        if (status === undefined || status === null) continue;
        await this.applyReceipt(accountId, u.key.id, status).catch((err) =>
          this.logger.warn(`Receipt update failed for ${u.key?.id}: ${err}`),
        );
      }
    });

    // Reactions (customer adds/removes an emoji on a message).
    sock.ev.on('messages.reaction', async (reactions) => {
      for (const r of reactions) {
        if (!r.key?.id || !r.reaction) continue;
        await this.applyReaction(
          accountId,
          r.key.id,
          r.reaction.text ?? '',
          jidToPhone(r.key.remoteJid ?? ''),
        ).catch((err) => this.logger.warn(`Reaction apply failed: ${err}`));
      }
    });

    // Incoming calls: auto-reject (the bot can't answer) + log to the timeline.
    sock.ev.on('call', async (calls) => {
      for (const c of calls) {
        if (c.status !== 'offer') continue;
        try {
          await sock.rejectCall(c.id, c.from);
        } catch (err) {
          this.logger.warn(`rejectCall failed: ${err}`);
        }
        await this.logCall(accountId, c.from, c.isVideo ?? false).catch((err) =>
          this.logger.warn(`Call log failed: ${err}`));
      }
    });
  }

  /** Mark a message edited: update content + editedAt, emit live. */
  private async applyEdit(accountId: string, externalId: string, newText: string) {
    const message = await this.prisma.message.findFirst({
      where: { externalId, conversation: { whatsappAccountId: accountId } },
      select: { id: true, conversationId: true },
    });
    if (!message) return;
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { content: newText, editedAt: new Date() },
    });
    this.events.emitToAccount(accountId, 'message:edited', {
      conversationId: message.conversationId,
      messageId: message.id,
      content: updated.content,
    });
  }

  /** Mark a message deleted-for-everyone (revoked). */
  private async applyRevoke(accountId: string, externalId: string) {
    const message = await this.prisma.message.findFirst({
      where: { externalId, conversation: { whatsappAccountId: accountId } },
      select: { id: true, conversationId: true },
    });
    if (!message) return;
    await this.prisma.message.update({
      where: { id: message.id },
      data: { deletedAt: new Date() },
    });
    this.events.emitToAccount(accountId, 'message:deleted', {
      conversationId: message.conversationId,
      messageId: message.id,
    });
  }

  /** Merge/clear a reaction emoji for one reactor on a message. */
  private async applyReaction(
    accountId: string,
    externalId: string,
    emoji: string,
    reactor: string,
  ) {
    const message = await this.prisma.message.findFirst({
      where: { externalId, conversation: { whatsappAccountId: accountId } },
      select: { id: true, conversationId: true, reactions: true },
    });
    if (!message) return;
    const map: Record<string, string[]> = (message.reactions as Record<string, string[]>) ?? {};
    // Remove this reactor from every emoji first (WA = one reaction per person).
    for (const key of Object.keys(map)) {
      map[key] = (map[key] ?? []).filter((p) => p !== reactor);
      if (map[key].length === 0) delete map[key];
    }
    if (emoji) {
      map[emoji] = [...(map[emoji] ?? []), reactor];
    }
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { reactions: map as never },
    });
    this.events.emitToAccount(accountId, 'message:reaction', {
      conversationId: message.conversationId,
      messageId: message.id,
      reactions: updated.reactions,
    });
  }

  /** Record a (rejected) incoming call as a system message in the timeline. */
  private async logCall(accountId: string, fromJid: string, isVideo: boolean) {
    const phone = jidToPhone(fromJid);
    const customer = await this.prisma.customer.findFirst({
      where: { phoneNumber: phone, sourceAccountId: accountId },
      select: { id: true },
    });
    if (!customer) return;
    const conversation = await this.prisma.conversation.findFirst({
      where: { customerId: customer.id, whatsappAccountId: accountId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!conversation) return;
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.system,
        content: `📞 ${isVideo ? 'Panggilan video' : 'Panggilan suara'} masuk (ditolak otomatis)`,
        messageType: MessageType.system,
        status: MessageStatus.delivered,
      },
    });
    this.events.emitToAccount(accountId, 'message:new', { conversationId: conversation.id, message });
  }

  /** Map a Baileys numeric status to our MessageStatus and persist + emit it. */
  private async applyReceipt(
    accountId: string,
    externalId: string,
    waStatus: number | string,
  ) {
    // Baileys WAMessageStatus: 2 = DELIVERY_ACK, 3 = READ, 4 = PLAYED.
    const code = Number(waStatus);
    let status: MessageStatus | undefined;
    if (code >= 4) status = MessageStatus.read;
    else if (code === 3) status = MessageStatus.read;
    else if (code === 2) status = MessageStatus.delivered;
    if (!status) return;

    const message = await this.prisma.message.findFirst({
      where: { externalId },
      select: { id: true, conversationId: true, status: true },
    });
    if (!message) return;
    // Never downgrade (read → delivered).
    if (message.status === MessageStatus.read) return;

    await this.prisma.message.update({ where: { id: message.id }, data: { status } });
    this.events.emitToAccount(accountId, 'message:status', {
      conversationId: message.conversationId,
      messageId: message.id,
      status,
    });
  }

  /**
   * Mark the customer's recent inbound messages as read in WhatsApp (blue
   * ticks) when an admin opens the chat. Best-effort; never throws to caller.
   */
  async markRead(accountId: string, phone: string, externalIds: string[]) {
    const session = this.sessions.get(accountId);
    if (!session || externalIds.length === 0) return;
    const remoteJid = phoneToJid(phone);
    const keys = externalIds.map((id) => ({ remoteJid, id, fromMe: false }));
    try {
      await session.sock.readMessages(keys as never);
    } catch (err) {
      this.logger.warn(`markRead failed for ${remoteJid}: ${err}`);
    }
  }

  /**
   * Schedule an exponential-backoff reconnect for an account. Gives up after
   * MAX_RECONNECT_ATTEMPTS, marking the account disconnected and alerting.
   */
  private async scheduleReconnect(accountId: string): Promise<void> {
    const attempt = this.reconnectAttempts.get(accountId) ?? 0;

    if (attempt >= WaService.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.delete(accountId);
      this.reconnectingSince.delete(accountId);
      await this.setStatus(accountId, SessionStatus.disconnected);
      const account = await this.prisma.whatsappAccount
        .findUnique({ where: { id: accountId } })
        .catch(() => null);
      const name = account?.accountName ?? accountId;
      this.notifications.send(
        `⛔ WhatsApp account ${name} failed to reconnect after ` +
          `${WaService.MAX_RECONNECT_ATTEMPTS} attempts.`,
      );
      this.events.emit('wa:status', {
        accountId,
        status: SessionStatus.disconnected,
        failed: true,
      });
      return;
    }

    this.reconnectAttempts.set(accountId, attempt + 1);
    if (!this.reconnectingSince.has(accountId)) {
      this.reconnectingSince.set(accountId, Date.now());
    }
    await this.setStatus(accountId, SessionStatus.reconnecting);

    const delay = backoffDelay(attempt);
    this.logger.log(
      `Account ${accountId} reconnecting in ${delay}ms ` +
        `(attempt ${attempt + 1}/${WaService.MAX_RECONNECT_ATTEMPTS})`,
    );
    setTimeout(() => {
      this.startSession(accountId).catch((err) =>
        this.logger.error(`Reconnect failed ${accountId}: ${err}`),
      );
    }, delay);
  }

  /**
   * Per-account outbound rate limiter. Blocks until fewer than
   * MAX_SENDS_PER_MINUTE messages were sent in the trailing 60s window.
   */
  private async throttleSend(accountId: string): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60_000;
    const stamps = (this.sendTimestamps.get(accountId) ?? []).filter(
      (t) => t > windowStart,
    );

    if (stamps.length >= WaService.MAX_SENDS_PER_MINUTE) {
      const oldest = stamps[0];
      const wait = oldest + 60_000 - now;
      if (wait > 0) {
        this.logger.warn(
          `Throttling account ${accountId}: waiting ${wait}ms (rate limit)`,
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }

    const fresh = (this.sendTimestamps.get(accountId) ?? []).filter(
      (t) => t > Date.now() - 60_000,
    );
    fresh.push(Date.now());
    this.sendTimestamps.set(accountId, fresh);
  }

  /**
   * Periodic session health check: revive accounts that the DB believes are
   * connected but have no live socket, and warn about stuck reconnects.
   */
  @Interval(60_000)
  async healthCheck(): Promise<void> {
    try {
      const accounts = await this.prisma.whatsappAccount.findMany({
        where: { isActive: true },
      });
      for (const account of accounts) {
        const live = this.sessions.has(account.id);

        if (account.sessionStatus === SessionStatus.connected && !live) {
          this.logger.warn(
            `Health check: account ${account.id} marked connected but has no ` +
              `live socket — reconnecting.`,
          );
          this.reconnectAttempts.set(account.id, 0);
          await this.scheduleReconnect(account.id);
          continue;
        }

        if (account.sessionStatus === SessionStatus.reconnecting) {
          const since = this.reconnectingSince.get(account.id);
          if (since && Date.now() - since > 5 * 60_000) {
            this.logger.warn(
              `Health check: account ${account.id} stuck reconnecting for ` +
                `${Math.round((Date.now() - since) / 1000)}s.`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.error(`Health check failed: ${err}`);
    }
  }

  /** Expose internal stability state for the health endpoint. */
  getHealth(accountId: string) {
    return {
      accountId,
      liveSocket: this.sessions.has(accountId),
      reconnectAttempts: this.reconnectAttempts.get(accountId) ?? 0,
    };
  }

  private async handleIncoming(
    accountId: string,
    m: proto.IWebMessageInfo,
    opts: { suppressAutomation?: boolean } = {},
  ) {
    if (!m.key.remoteJid) return;
    // Only 1-on-1 chats (M1): drop groups, broadcast lists, newsletters.
    if (!isDirectChatJid(m.key.remoteJid)) {
      this.logger.log(`handleIncoming [${accountId}]: dropped non-direct JID: ${m.key.remoteJid}`);
      return;
    }

    // Resolve @lid JIDs to phone numbers via Baileys contact store.
    const remoteJid = await this.resolveJid(accountId, m.key.remoteJid);

    const fromMe = m.key.fromMe === true;

    const locationText = m.message?.locationMessage
      ? `📍 ${m.message.locationMessage.degreesLatitude?.toFixed(6)}, ${m.message.locationMessage.degreesLongitude?.toFixed(6)}`
      : '';

    const text =
      m.message?.conversation ??
      m.message?.extendedTextMessage?.text ??
      m.message?.imageMessage?.caption ??
      m.message?.videoMessage?.caption ??
      m.message?.documentMessage?.caption ??
      locationText ??
      '';

    const type = this.resolveType(m);
    if (!text && type === MessageType.text) return;

    // Download inbound media to WA_MEDIA_DIR and reference it as /media/<file>.
    // Failure is non-fatal: the message is still ingested, just without media.
    // History backfill skips downloads entirely: old media keys are usually
    // expired and thousands of fetches would stall the sync.
    let mediaUrl: string | undefined;
    if (!opts.suppressAutomation &&
        (type === MessageType.image || type === MessageType.video ||
         type === MessageType.audio || type === MessageType.voice || type === MessageType.document)) {
      mediaUrl = await this.downloadInboundMedia(m).catch((err) => {
        this.logger.warn(`Media download failed for ${m.key.id}: ${err}`);
        return undefined;
      });
    }

    // If the customer replied to (quoted) an earlier message, WhatsApp sends
    // the original's id as contextInfo.stanzaId — link it to our stored row.
    const ctx =
      m.message?.extendedTextMessage?.contextInfo ??
      m.message?.imageMessage?.contextInfo ??
      m.message?.videoMessage?.contextInfo ??
      m.message?.documentMessage?.contextInfo;

    const result = await this.ingest.ingest({
      accountId,
      remoteJid,
      externalId: m.key.id ?? '',
      pushName: m.pushName ?? undefined,
      text,
      type,
      mediaUrl,
      quotedExternalId: ctx?.stanzaId ?? undefined,
      fromMe,
      occurredAt: this.messageTimestamp(m),
      suppressAutomation: opts.suppressAutomation,
    });

    if (result && !result.fromMe && !result.suppressAutomation) {
      // Fetch the contact's profile picture once (when we don't have one yet).
      if (result.customer && !result.customer.avatarUrl) {
        this.maybeFetchAvatar(accountId, result.customer.id, result.customer.phoneNumber)
          .catch(() => undefined);
      }
      // A4: a bare "1–5" consumed as a CSAT rating needs no away message and
      // must not be answered by the bot.
      if (result.csatCaptured) return;
      await this.maybeAutoAway(result).catch((err) =>
        this.logger.warn(`Auto-away failed: ${err}`),
      );
      await this.maybeAutoReply(result.conversation.id).catch((err) =>
        this.logger.error(`Auto-reply failed: ${err}`),
      );
    }
  }

  /**
   * Resolve @lid JIDs to phone-based @s.whatsapp.net JIDs.
   * Linked devices receive messages with @lid identifiers instead of phone JIDs.
   * We maintain a lidMap from Baileys contact events to perform the mapping.
   * Falls back to the original JID if no mapping is found.
   */
  private resolveJid(accountId: string, jid: string): string {
    if (!isLidJid(jid)) return jid;

    const session = this.sessions.get(accountId);
    if (!session) return jid;

    const resolved = session.lidMap.get(jid);
    if (resolved) return resolved;

    // No resolution found — keep the @lid (messages will still appear, just
    // with the LID as the customer identifier).
    return jid;
  }

  /** Store a customer's WhatsApp avatar and notify the dashboard. */
  private async maybeFetchAvatar(accountId: string, customerId: string, phone: string) {
    const url = await this.fetchAvatar(accountId, phone);
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

  /**
   * Send a configured away message when an inbound arrives outside the
   * account's business hours and the bot isn't handling it (ai_on). Throttled
   * per conversation by AUTO_AWAY_COOLDOWN_MS so the customer isn't spammed.
   */
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
    if (conversation.aiMode === AiMode.ai_on) return; // bot replies 24/7
    if (isWithinBusinessHours(account)) return;

    // Atomic cooldown claim (A15): set lastAwayAt only if still outside the
    // cooldown, so a burst of near-simultaneous inbounds can't double-send.
    // If the send below fails, the away message is simply skipped until the
    // next cooldown window — preferable to risking duplicates.
    const cutoff = new Date(Date.now() - this.awayCooldownMs);
    const claim = await this.prisma.conversation.updateMany({
      where: {
        id: conversation.id,
        OR: [{ lastAwayAt: null }, { lastAwayAt: { lt: cutoff } }],
      },
      data: { lastAwayAt: new Date() },
    });
    if (claim.count === 0) return;

    const externalId = await this.sendText(account.id, customer.phoneNumber, account.awayMessage);
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
    // PTT = Push-To-Talk (voice message)
    if (msg?.audioMessage?.ptt === true) return MessageType.voice;
    if (msg?.audioMessage) return MessageType.audio;
    if (msg?.documentMessage) return MessageType.document;
    if (msg?.stickerMessage) return MessageType.sticker;
    if (msg?.locationMessage) return MessageType.location;
    return MessageType.text;
  }

  /**
   * Send a text message through the account's connection. When `quoted` is
   * given the message is sent as a WhatsApp reply: Baileys only needs the
   * original key + a text stub, which we reconstruct from our stored row.
   */
  async sendText(
    accountId: string,
    phone: string,
    text: string,
    quoted?: { externalId: string; content: string | null; fromMe: boolean },
  ) {
    const session = this.sessions.get(accountId);
    if (!session) {
      throw new NotFoundException(`Account ${accountId} is not connected`);
    }
    const jid = phoneToJid(phone);

    await this.throttleSend(accountId);

    // Human-like typing indicator + length-proportional delay to reduce ban
    // risk. Presence updates must never block the actual send.
    try {
      await session.sock.presenceSubscribe(jid);
      await session.sock.sendPresenceUpdate('composing', jid);
    } catch {
      /* presence is best-effort */
    }
    await typingDelay(text);
    try {
      await session.sock.sendPresenceUpdate('paused', jid);
    } catch {
      /* presence is best-effort */
    }

    const options = quoted
      ? {
          quoted: {
            key: { remoteJid: jid, id: quoted.externalId, fromMe: quoted.fromMe },
            message: { conversation: quoted.content ?? '' },
          },
        }
      : undefined;

    const sent = await session.sock.sendMessage(jid, { text }, options as never);
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
    await this.throttleSend(accountId);
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

    // Send audio as a real voice note (PTT) so it plays inline like WhatsApp.
    if (mediaType === 'audio') (content as { ptt?: boolean }).ptt = true;

    const sent = await session.sock.sendMessage(jid, content as never);
    return sent?.key.id ?? null;
  }

  /** Check whether a phone number is registered on WhatsApp. */
  async isOnWhatsApp(accountId: string, phone: string): Promise<boolean> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    try {
      const jid = phoneToJid(phone);
      const results = await session.sock.onWhatsApp(jid);
      return Boolean(results?.[0]?.exists);
    } catch (err) {
      this.logger.warn(`onWhatsApp check failed for ${phone}: ${err}`);
      return false;
    }
  }

  /** Best-effort profile-picture URL for a contact (null if none/locked). */
  async fetchAvatar(accountId: string, phone: string): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) return null;
    try {
      return (await session.sock.profilePictureUrl(phoneToJid(phone), 'image')) ?? null;
    } catch {
      return null; // no picture or privacy-locked
    }
  }

  /** Send a voice message (PTT = push-to-talk). */
  async sendVoice(
    accountId: string,
    phone: string,
    audioBuffer: Buffer,
    mimetype = 'audio/ogg; codecs=opus',
  ): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await humanDelay();

    const sent = await session.sock.sendMessage(jid, {
      audio: audioBuffer,
      mimetype,
      ptt: true,
    } as never);
    return sent?.key.id ?? null;
  }

  /** Send a location message. */
  async sendLocation(
    accountId: string,
    phone: string,
    latitude: number,
    longitude: number,
  ): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await humanDelay();

    const sent = await session.sock.sendMessage(jid, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude },
    } as never);
    return sent?.key.id ?? null;
  }

  /** React to a message with an emoji (empty string clears our reaction). */
  async sendReaction(accountId: string, phone: string, externalId: string, emoji: string) {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, id: externalId, fromMe: false } },
    } as never);
  }

  /** Edit a message we sent (WhatsApp allows edits within ~15 minutes). */
  async editMessage(accountId: string, phone: string, externalId: string, newText: string) {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.sendMessage(jid, {
      text: newText,
      edit: { remoteJid: jid, id: externalId, fromMe: true },
    } as never);
  }

  /** Delete a message for everyone (revoke). */
  async deleteMessage(accountId: string, phone: string, externalId: string, fromMe: boolean) {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.sendMessage(jid, {
      delete: { remoteJid: jid, id: externalId, fromMe },
    } as never);
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

  /**
   * Log out a WhatsApp account: close the Baileys socket, wipe the auth
   * state on disk, and mark the account disconnected. The admin can then
   * delete the account row or re-scan a fresh QR.
   */
  async logout(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (session) {
      try {
        // Baileys logout() sends a proper logout to WhatsApp servers so the
        // linked device is removed from the phone's device list.
        await session.sock.logout();
      } catch {
        // Best-effort: if logout fails (already disconnected), just end.
        try { session.sock.end(undefined); } catch { /* ignore */ }
      }
      this.sessions.delete(accountId);
    }
    this.reconnectAttempts.delete(accountId);
    this.reconnectingSince.delete(accountId);
    await this.setStatus(accountId, SessionStatus.disconnected);
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
