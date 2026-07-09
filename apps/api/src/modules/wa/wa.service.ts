import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { join } from 'path';
import { rm } from 'fs/promises';
import * as QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type proto,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { SessionStatus } from '@sentinel/database';
import { MetricsService } from '../../common/metrics/metrics.service';
import { UpdateAccountDto } from './dto/update-account.dto';
import { buildAccountUpdateData } from './account-update.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { MediaStorageService } from '../media/media-storage.service';
import { ContactSyncService } from './contact-sync.service';
import { logAudit } from '../../common/audit.util';
import {
  backoffDelay,
  extForMimetype,
  isDirectChatJid,
  isGroupJid,
  jidToPhone,
  phoneToJid,
} from './wa.util';
import { WaSessionStore } from './wa-session.store';
import { WaGatewayService } from './wa-gateway.service';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService, type GroupMetadataLike } from './wa-mirror.service';
import { mapBaileysMessage, isDownloadableMedia } from './wa.types';
import { LearningService } from '../learning/learning.service';

/**
 * Session lifecycle + thin public facade. Manages one Baileys connection per
 * WhatsApp account: QR/pairing, auto-reconnect with backoff, health checks, and
 * all `sock.ev` wiring. Inbound messages are normalised to WaMessageShape and
 * handed to WaInboundService; outbound sends/ops delegate to WaGatewayService.
 */
@Injectable()
export class WaService implements OnModuleInit {
  private readonly logger = new Logger(WaService.name);
  private readonly sessionDir: string;
  private readonly syncFullHistory: boolean;
  private readonly mediaMaxBytes: number;
  private static readonly MAX_RECONNECT_ATTEMPTS = 10;
  // ponytail: in-process guard so reconnects don't re-mine within the same hour
  private readonly recentAutoMine = new Map<string, number>();

  constructor(
    private readonly store: WaSessionStore,
    private readonly gateway: WaGatewayService,
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly notifications: NotificationsService,
    private readonly storage: MediaStorageService,
    private readonly contactSync: ContactSyncService,
    private readonly waInbound: WaInboundService,
    private readonly waMirror: WaMirrorService,
    private readonly learning: LearningService,
    config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.sessionDir = config.get<string>('WA_SESSION_DIR') ?? './.wa-sessions';
    this.syncFullHistory = config.get<string>('WA_SYNC_FULL_HISTORY') !== 'false';
    this.mediaMaxBytes = Number(config.get<string>('WA_MEDIA_MAX_BYTES') ?? 25 * 1024 * 1024);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

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

  /** Deletes this account's on-disk Baileys auth state so the next
   *  startSession() starts unregistered and Baileys emits a fresh `qr`. */
  private async clearSessionFiles(accountId: string): Promise<void> {
    await rm(join(this.sessionDir, accountId), { recursive: true, force: true }).catch((err) =>
      this.logger.warn(`Failed to clear session files for ${accountId}: ${err}`),
    );
  }

  async startSession(accountId: string): Promise<void> {
    if (this.store.has(accountId)) return;

    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    const { state, saveCreds } = await useMultiFileAuthState(join(this.sessionDir, accountId));
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'silent' }) as never;
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      syncFullHistory: this.syncFullHistory,
      // macOS platform is normally required by Baileys/WhatsApp's server to
      // grant a full history sync — 'Chrome'/Ubuntu identity was observed
      // getting only a capped `RECENT` snapshot instead of
      // `FULL`/`INITIAL_BOOTSTRAP`. WA_BROWSER_PLATFORM/NAME/VERSION let ops
      // rotate away from Baileys' literal default tuple
      // ('Mac OS','Desktop','14.4.1') if WhatsApp starts fingerprinting/
      // blocking that exact signature, or rejecting the post-scan pairing
      // handshake for a given platform combo (see WhiskeySockets/Baileys
      // #2370, #2381, #2658 — server-side registration/pairing rejection).
      browser: [
        process.env.WA_BROWSER_PLATFORM || 'Mac OS',
        process.env.WA_BROWSER_NAME || 'Safari',
        process.env.WA_BROWSER_VERSION || '17.4.1',
      ],
      markOnlineOnConnect: false,
      keepAliveIntervalMs: parseInt(process.env.WA_KEEPALIVE_MS ?? '30000', 10),
      // ponytail: required by Baileys to resolve message content during history sync
      getMessage: async (key) => {
        if (!key.id) return undefined;
        const msg = await this.prisma.message.findFirst({
          where: { externalId: key.id },
          select: { content: true },
        });
        if (!msg) return undefined;
        return { conversation: msg.content ?? '' } as proto.IMessage;
      },
    });

    this.store.set(accountId, { sock });
    this.registerBaileysEvents(accountId, sock, saveCreds);
  }

  private intentionalDisconnect = new Set<string>();

  private registerBaileysEvents(
    accountId: string,
    sock: WASocket,
    saveCreds: () => Promise<void>,
  ): void {
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          const dataUrl = await QRCode.toDataURL(qr);
          this.store.setQr(accountId, dataUrl);
          await this.setStatus(accountId, SessionStatus.qr_required);
          this.events.emitToAccount(accountId, 'wa:qr', { accountId, qr: dataUrl });
          this.logger.log(`Account ${accountId}: QR generated — scan required`);
        }

        if (connection === 'open') {
          this.store.setQr(accountId, undefined);
          this.store.reconnectAttempts.set(accountId, 0);
          this.store.reconnectingSince.delete(accountId);
          await this.setStatus(accountId, SessionStatus.connected);
          this.logger.log(`Account ${accountId}: Connection OPEN`);
          // Visible "still syncing vs done" signal for the UI — Baileys gives no
          // explicit start event, so connection OPEN is the practical start; the
          // messaging-history.set handler below marks it done via `isLatest`.
          const generation = this.store.startHistorySync(accountId);
          this.events.emitToAccount(accountId, 'wa:history-sync', { accountId, ...this.store.getHistorySync(accountId) });
          // A plain reconnect to an already-synced session often gets no
          // messaging-history.set at all — without this, the indicator would
          // say "syncing" forever. If nothing arrived after a reasonable wait,
          // there's simply nothing to sync. Gated on `generation` so a flappy
          // reconnect (open→close→open within 15s) can't let this stale timer
          // mark a NEWER, still-in-progress sync as falsely "completed".
          setTimeout(() => {
            if (!this.store.isCurrentHistorySyncGeneration(accountId, generation)) return;
            const state = this.store.getHistorySync(accountId);
            if (state && state.status === 'syncing' && state.messages === 0) {
              const completed = this.store.addHistorySyncBatch(accountId, 0, 0, true);
              this.events.emitToAccount(accountId, 'wa:history-sync', { accountId, ...completed });
            }
          }, 15000);
        }

        if (connection === 'close') {
          // Socket identity guard: ignore closes from old sockets after restart
          if (this.store.getSock(accountId) !== sock) {
            this.logger.debug(`Ignoring close event from stale socket for ${accountId}`);
            return;
          }

          const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          const intentional = this.intentionalDisconnect.has(accountId);
          this.intentionalDisconnect.delete(accountId);
          this.store.delete(accountId);
          this.logger.warn(`Account ${accountId}: Connection CLOSED (code=${code}, loggedOut=${loggedOut}, intentional=${intentional})`);

          if (loggedOut && !intentional) {
            this.store.reconnectAttempts.delete(accountId);
            this.store.reconnectingSince.delete(accountId);
            await this.setStatus(accountId, SessionStatus.disconnected);
            // The phone/WhatsApp server invalidated this session — the on-disk
            // creds are now dead weight. Without clearing them, Baileys reuses
            // the stale (but still "registered") creds on every future restart
            // and never emits a fresh `qr` event, forcing users to delete and
            // recreate the whole account just to reconnect. Clear them so the
            // next restart/QR request on this SAME account works.
            await this.clearSessionFiles(accountId);
            const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } }).catch(() => null);
            this.notifications.send(
              `🚫 WhatsApp logged out / possibly banned\nAkun: ${account?.accountName ?? accountId} (${account?.phoneNumber ?? '?'}) — needs a fresh QR scan.`,
            );
          } else if (!intentional) {
            await this.scheduleReconnect(accountId);
          }
        }
      } catch (err) {
        this.logger.error(`Connection update handler failed for ${accountId}: ${err}`);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const m of messages) {
        await this.ingestBaileysMessage(accountId, m, type !== 'notify').catch((err) =>
          this.logger.warn(`Ingest failed for ${m.key?.id}: ${err}`),
        );
      }
    });

    sock.ev.on('contacts.upsert', async (contacts) => {
      await this.contactSync.syncContacts(accountId, contacts).catch((err) =>
        this.logger.warn(`Contact upsert sync failed: ${err}`),
      );
    });

    sock.ev.on('contacts.update', async (contacts) => {
      await this.contactSync.syncContacts(accountId, contacts).catch((err) =>
        this.logger.warn(`Contact update sync failed: ${err}`),
      );
    });

    const groupEvents = sock.ev as unknown as {
      on(event: 'groups.upsert' | 'groups.update' | 'group-participants.update', listener: (payload: never) => void): void;
    };

    groupEvents.on('groups.upsert', async (groups: GroupMetadataLike[]) => {
      for (const group of groups ?? []) {
        await this.waMirror.applyGroupMetadata(accountId, group).catch((err) =>
          this.logger.warn(`Group upsert mirror failed for ${group.id}: ${err}`),
        );
      }
    });

    groupEvents.on('groups.update', async (groups: GroupMetadataLike[]) => {
      for (const group of groups ?? []) {
        await this.waMirror.applyGroupMetadata(accountId, group, { logChanges: true }).catch((err) =>
          this.logger.warn(`Group update mirror failed for ${group.id}: ${err}`),
        );
      }
    });

    groupEvents.on('group-participants.update', async (update: {
      id?: string;
      author?: string;
      participants?: string[];
      action?: string;
    }) => {
      await this.waMirror.applyGroupParticipantUpdate(accountId, update).catch((err) =>
        this.logger.warn(`Group participant mirror failed for ${update.id}: ${err}`),
      );
    });

    sock.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        if (!chat.id) continue;
        await this.waMirror.applyChatMirrorState(accountId, chat.id, chat).catch((err) =>
          this.logger.warn(`Chat upsert mirror failed for ${chat.id}: ${err}`),
        );
      }
    });

    sock.ev.on('chats.update', async (updates) => {
      for (const chat of updates) {
        if (!chat.id) continue;
        await this.waMirror.applyChatMirrorState(accountId, chat.id, chat).catch((err) =>
          this.logger.warn(`Chat update mirror failed for ${chat.id}: ${err}`),
        );
      }
    });

    sock.ev.on('blocklist.set', async ({ blocklist }) => {
      await this.waMirror.applyBlocklist(accountId, blocklist, true).catch((err) =>
        this.logger.warn(`Blocklist set mirror failed: ${err}`),
      );
    });

    sock.ev.on('blocklist.update', async ({ blocklist, type }) => {
      await this.waMirror.applyBlocklist(accountId, blocklist, type === 'add').catch((err) =>
        this.logger.warn(`Blocklist update mirror failed: ${err}`),
      );
    });

    sock.ev.on('message-receipt.update', async (updates) => {
      for (const update of updates) {
        if (!update.key?.id) continue;
        await this.waMirror.applyReceiptDetail(accountId, update.key.id, update.receipt).catch((err) =>
          this.logger.warn(`Receipt detail mirror failed for ${update.key?.id}: ${err}`),
        );
      }
    });

    sock.ev.on('messaging-history.set', async ({ messages, contacts, chats, isLatest }) => {
      this.logger.log(
        `History sync ${accountId}: ${messages?.length ?? 0} messages, ${contacts?.length ?? 0} contacts${isLatest ? ' (latest)' : ''}`,
      );
      await this.contactSync.syncContacts(accountId, contacts ?? []).catch((err) =>
        this.logger.warn(`History contact sync failed: ${err}`),
      );
      // parallel: group metadata + chat mirror state (independent per chat)
      const validChats = (chats ?? []).filter((c): c is typeof c & { id: string } => !!c.id);
      await Promise.allSettled([
        ...validChats.filter(c => isGroupJid(c.id)).map(chat =>
          this.waMirror.applyGroupMetadata(accountId, { id: chat.id, subject: (chat as { name?: string }).name })
            .catch((err) => this.logger.warn(`History group metadata mirror failed for ${chat.id}: ${err}`)),
        ),
        ...validChats.map(chat =>
          this.waMirror.applyChatMirrorState(accountId, chat.id, chat)
            .catch((err) => this.logger.warn(`History chat mirror failed for ${chat.id}: ${err}`)),
        ),
      ]);
      // parallel batches of 20 — dramatically speeds up large history syncs
      const BATCH = 20;
      const msgs = messages ?? [];
      for (let i = 0; i < msgs.length; i += BATCH) {
        await Promise.allSettled(
          msgs.slice(i, i + BATCH).map(m =>
            this.ingestBaileysMessage(accountId, m, true).catch((err) =>
              this.logger.warn(`History ingest failed for ${m.key?.id}: ${err}`),
            ),
          ),
        );
      }
      // Re-sync contacts after message ingest: on first sync, customers are
      // created by ingest above but contacts were synced before them, leaving
      // whatsapp_contacts.customerId null. A second pass links them now that
      // the customer rows exist.
      if (contacts?.length) {
        await this.contactSync.syncContacts(accountId, contacts).catch((err) =>
          this.logger.warn(`History contact re-link failed: ${err}`),
        );
      }

      const syncState = this.store.addHistorySyncBatch(accountId, msgs.length, contacts?.length ?? 0, !!isLatest);
      this.events.emitToAccount(accountId, 'wa:history-sync', { accountId, ...syncState });

      if (isLatest) {
        this.autoMineAfterHistorySync(accountId).catch((err) =>
          this.logger.warn(`Auto-mine after history sync failed: ${err}`),
        );
        // fire-and-forget: fill customer names from WA contact data
        this.contactSync.backfillNames(accountId)
          .catch((err) => this.logger.warn(`Name backfill failed: ${err}`));
        // fire-and-forget: fetch profile photos for contacts without one (rate-limited 1/1.5s)
        this.contactSync.backfillAvatars(
          accountId,
          (jid) => this.gateway.getContactAvatar(accountId, jid),
        ).catch((err) => this.logger.warn(`Avatar backfill failed: ${err}`));
      }
    });

    sock.ev.on('presence.update', async ({ id, presences }) => {
      if (!isDirectChatJid(id)) return;
      const state = presences?.[id]?.lastKnownPresence;
      const typing = state === 'composing' || state === 'recording';
      let phone = jidToPhone(id);
      if (phone.endsWith('@lid')) {
        phone = await this.contactSync.resolveLidPhone(accountId, phone);
      }
      this.events.emitToAccount(accountId, 'wa:presence', {
        accountId,
        phone,
        typing,
        presence: state ?? 'unavailable',
      });
      // While the customer is typing, hold any pending auto-reply so the bot
      // answers the whole thought, not a half-typed burst.
      if (typing) this.waInbound.onCustomerTyping(accountId, id);
    });

    sock.ev.on('messages.update', async (updates) => {
      for (const u of updates) {
        if (!u.key?.id) continue;

        // Poll vote updates — emit to frontend via Socket.IO
        if ((u.update as any)?.pollUpdates) {
          this.logger.log(`Poll update for ${u.key.id}: ${JSON.stringify((u.update as any).pollUpdates)}`);
          this.events.server.emit('poll:update', {
            accountId,
            messageId: u.key.id,
            chatId: u.key.remoteJid,
            pollUpdates: (u.update as any).pollUpdates,
          });
          continue;
        }

        const edited = u.update?.message?.protocolMessage?.editedMessage
          ?? (u.update?.message?.editedMessage as never);
        const revoked = u.update?.messageStubType === 1 || u.update?.message === null;
        if (edited) {
          const newText = (edited as { conversation?: string; extendedTextMessage?: { text?: string } })
            .conversation ?? (edited as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text ?? '';
          await this.waMirror.applyEdit(accountId, u.key.id, newText).catch((err) =>
            this.logger.warn(`Edit apply failed for ${u.key?.id}: ${err}`));
          continue;
        }
        if (revoked) {
          await this.waMirror.applyRevoke(accountId, u.key.id).catch((err) =>
            this.logger.warn(`Revoke apply failed for ${u.key?.id}: ${err}`));
          continue;
        }
        const status = u.update?.status;
        if (status === undefined || status === null) continue;
        await this.waMirror.applyReceipt(accountId, u.key.id, status).catch((err) =>
          this.logger.warn(`Receipt update failed for ${u.key?.id}: ${err}`),
        );
      }
    });

    sock.ev.on('messages.reaction', async (reactions) => {
      for (const r of reactions) {
        if (!r.key?.id || !r.reaction) continue;
        await this.waMirror.applyReaction(
          accountId,
          r.key.id,
          r.reaction.text ?? '',
          jidToPhone(r.key.remoteJid ?? ''),
        ).catch((err) => this.logger.warn(`Reaction apply failed: ${err}`));
      }
    });

    sock.ev.on('call', async (calls) => {
      for (const c of calls) {
        if (c.status !== 'offer') continue;
        try {
          await sock.rejectCall(c.id, c.from);
        } catch (err) {
          this.logger.warn(`rejectCall failed: ${err}`);
        }
        await this.waMirror.logCall(accountId, c.from, c.isVideo ?? false).catch((err) =>
          this.logger.warn(`Call log failed: ${err}`));
      }
    });

    sock.ev.on('labels.edit', (labelList) => {
      this.gateway.setLabelsCache(accountId, labelList as any);
    });
  }

  /** Queue a mining job for the bot attached to this account, at most once per hour. */
  private async autoMineAfterHistorySync(accountId: string): Promise<void> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: { id: accountId },
      select: { assignedBot: { select: { id: true, botName: true } } },
    });
    const bot = account?.assignedBot;
    if (!bot) return;

    const lastMine = this.recentAutoMine.get(bot.id) ?? 0;
    if (Date.now() - lastMine < 60 * 60 * 1000) return;
    this.recentAutoMine.set(bot.id, Date.now());

    const { jobId } = await this.learning.queueMineAll(bot.id);
    this.logger.log(`Auto-mine queued for bot "${bot.botName}" (job ${jobId}) after history sync on account ${accountId}`);
    this.events.emitToAccount(accountId, 'learning:auto-mine', { botId: bot.id, botName: bot.botName, jobId });
  }

  /** Normalise a Baileys message, resolve any media to a storage URL, and ingest. */
  private async ingestBaileysMessage(
    accountId: string,
    m: proto.IWebMessageInfo,
    suppressAutomation: boolean,
  ): Promise<void> {
    if (!m.key) return;
    const shape = mapBaileysMessage(m);
    if (!suppressAutomation && !m.key.fromMe && shape.mediaMimetype && isDownloadableMedia(shape.wahaType) && shape.wahaType !== 'sticker') {
      shape.mediaUrl = await this.downloadMedia(accountId, m, shape.mediaMimetype).catch((err) => {
        this.logger.warn(`Media download failed for ${m.key?.id}: ${err}`);
        return undefined;
      });
    }
    await this.waInbound.handleIncoming(accountId, shape, { suppressAutomation });
  }

  private async downloadMedia(
    accountId: string,
    m: proto.IWebMessageInfo,
    mimetype: string,
  ): Promise<string | undefined> {
    if (!m.key) return undefined;
    const sock = this.store.getSock(accountId);
    const buffer = await downloadMediaMessage(
      m as WAMessage,
      'buffer',
      {},
      { logger: pino({ level: 'silent' }) as never, reuploadRequest: sock!.updateMediaMessage },
    );
    if (buffer.length > this.mediaMaxBytes) {
      this.logger.warn(`Media too large (${buffer.length} bytes), skipping`);
      return undefined;
    }
    const stored = await this.storage.save(buffer, extForMimetype(mimetype));
    return stored.url;
  }

  // ── Reconnect / health ────────────────────────────────────────────────────

  private async scheduleReconnect(accountId: string): Promise<void> {
    const attempt = this.store.reconnectAttempts.get(accountId) ?? 0;

    if (attempt >= WaService.MAX_RECONNECT_ATTEMPTS) {
      this.store.reconnectAttempts.delete(accountId);
      this.store.reconnectingSince.delete(accountId);
      await this.setStatus(accountId, SessionStatus.disconnected);
      const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } }).catch(() => null);
      this.notifications.send(
        `⛔ WhatsApp account ${account?.accountName ?? accountId} failed to reconnect after ${WaService.MAX_RECONNECT_ATTEMPTS} attempts.`,
      );
      this.events.emit('wa:status', { accountId, status: SessionStatus.disconnected, failed: true });
      return;
    }

    this.store.reconnectAttempts.set(accountId, attempt + 1);
    if (!this.store.reconnectingSince.has(accountId)) {
      this.store.reconnectingSince.set(accountId, Date.now());
    }
    await this.setStatus(accountId, SessionStatus.reconnecting);

    const delay = backoffDelay(attempt);
    this.logger.log(`Account ${accountId} reconnecting in ${delay}ms (attempt ${attempt + 1}/${WaService.MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(() => {
      this.startSession(accountId).catch((err) =>
        this.logger.error(`Reconnect failed ${accountId}: ${err}`),
      );
    }, delay);
  }

  @Interval(60_000)
  async healthCheck(): Promise<void> {
    try {
      const accounts = await this.prisma.whatsappAccount.findMany({ where: { isActive: true } });
      for (const account of accounts) {
        const live = this.store.has(account.id);
        if (account.sessionStatus === SessionStatus.connected && !live) {
          this.logger.warn(`Health check: account ${account.id} marked connected but has no live socket — reconnecting.`);
          this.store.reconnectAttempts.set(account.id, 0);
          await this.scheduleReconnect(account.id);
          continue;
        }
        if (account.sessionStatus === SessionStatus.reconnecting) {
          const since = this.store.reconnectingSince.get(account.id);
          if (since && Date.now() - since > 5 * 60_000) {
            this.logger.warn(`Health check: account ${account.id} stuck reconnecting for ${Math.round((Date.now() - since) / 1000)}s.`);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Health check failed: ${err}`);
    }
  }

  getHealth(accountId: string) {
    return {
      accountId,
      liveSocket: this.store.has(accountId),
      reconnectAttempts: this.store.reconnectAttempts.get(accountId) ?? 0,
      historySync: this.store.getHistorySync(accountId) ?? null,
    };
  }

  getQr(accountId: string): { qr: string | null; status: SessionStatus | 'unknown' } {
    const qr = this.store.getQr(accountId);
    // M3: status should reflect whether a QR scan is needed, not just socket existence.
    // If socket exists + QR is set: scanning. If socket exists + no QR: connected.
    if (!this.store.has(accountId)) return { qr, status: 'unknown' };
    return { qr, status: qr ? SessionStatus.qr_required : SessionStatus.connected };
  }

  isConnected(accountId: string): boolean {
    return this.store.has(accountId);
  }

  async getMetadata(accountId: string): Promise<{ phoneNumber: string | null; suggestedName: string | null }> {
    const me = await this.gateway.getMe(accountId);
    if (!me) return { phoneNumber: null, suggestedName: null };
    return { phoneNumber: jidToPhone(me.id), suggestedName: me.pushName || null };
  }

  // ── Account lifecycle ops ─────────────────────────────────────────────────

  async restart(accountId: string): Promise<void> {
    const sock = this.store.getSock(accountId);
    if (sock) {
      try { sock.end(undefined); } catch { /* ignore */ }
    }
    this.store.clearAll(accountId);
    await this.setStatus(accountId, SessionStatus.reconnecting);
    await this.startSession(accountId);
  }

  async removeAccount(accountId: string): Promise<void> {
    this.intentionalDisconnect.add(accountId);
    const sock = this.store.getSock(accountId);
    if (sock) {
      try { await sock.logout(); } catch { /* best-effort */ }
    }
    this.store.clearAll(accountId);
    await this.prisma.whatsappAccount.delete({ where: { id: accountId } });
    this.events.emitToAccount(accountId, 'wa:status', { accountId, status: 'disconnected', deleted: true });
  }

  async requestPairingCode(accountId: string): Promise<string> {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    const digits = (account.phoneNumber ?? '').replace(/\D/g, '');
    if (!digits) throw new Error('Account has no phone number configured');

    await this.startSession(accountId);
    const sock = this.store.getSock(accountId);
    if (!sock) throw new Error('Session failed to start');
    if (sock.authState.creds.registered) throw new Error('Account is already connected');

    // Baileys needs a brief moment after socket init before it can issue a code.
    await new Promise((r) => setTimeout(r, 1500));
    const code = await sock.requestPairingCode(digits);
    this.events.emitToAccount(accountId, 'wa:pairing-code', { accountId, code });
    return code;
  }

  async logout(accountId: string): Promise<void> {
    this.intentionalDisconnect.add(accountId);
    const sock = this.store.getSock(accountId);
    if (sock) await sock.logout().catch(() => undefined);
    this.store.clearAll(accountId);
    // Same reason as the loggedOut disconnect handler: stale creds on disk
    // block any future restart/QR request on this account from getting a
    // fresh QR. An explicit admin-triggered logout needs a clean slate too.
    await this.clearSessionFiles(accountId);
    await this.setStatus(accountId, SessionStatus.disconnected);
  }

  async setStatus(accountId: string, status: SessionStatus) {
    const account = await this.prisma.whatsappAccount.update({
      where: { id: accountId },
      data: { sessionStatus: status },
    });
    this.metrics?.waEvents.inc({ event: String(status) });
    this.events.emitToAccount(accountId, 'wa:status', { accountId, status });
    if (status === SessionStatus.banned || status === SessionStatus.disconnected) {
      this.notifications.send(
        `⚠️ WhatsApp ${status}\nAkun: ${account.accountName} (${account.phoneNumber})`,
      );
    }
  }

  async updateAccount(id: string, dto: UpdateAccountDto, userId?: string) {
    const data = buildAccountUpdateData(dto);
    const account = await this.prisma.whatsappAccount.update({ where: { id }, data });
    await logAudit(this.prisma, {
      userId,
      action: 'account_update',
      entityType: 'whatsapp_account',
      entityId: id,
      newValue: dto as Record<string, unknown>,
    });
    return account;
  }

  async logAiModeChange(conversationId: string, oldMode: string, newMode: string) {
    await logAudit(this.prisma, {
      action: 'ai_mode_change',
      entityType: 'conversation',
      entityId: conversationId,
      oldValue: { aiMode: oldMode },
      newValue: { aiMode: newMode },
    });
  }

  // ── Facade: send methods → WaGatewayService ───────────────────────────────

  sendText(
    accountId: string,
    phone: string,
    text: string,
    quoted?: { externalId: string; content: string | null; fromMe: boolean },
  ): Promise<string | null> {
    return this.gateway.sendText(accountId, phoneToJid(phone), text, quoted);
  }

  sendMedia(accountId: string, phone: string, mediaType: string, url: string, caption?: string): Promise<string | null> {
    const jid = phoneToJid(phone);
    if (mediaType === 'image') return this.gateway.sendImage(accountId, jid, url, caption);
    if (mediaType === 'video') return this.gateway.sendVideo(accountId, jid, url, caption);
    if (mediaType === 'audio') return this.gateway.sendVoice(accountId, jid, url);
    return this.gateway.sendFile(accountId, jid, url, caption ?? '');
  }

  sendMediaBuffer(
    accountId: string,
    phone: string,
    mediaType: 'image' | 'document' | 'audio' | 'video' | 'sticker',
    buffer: Buffer,
    mimetype: string,
    caption?: string,
    fileName?: string,
    viewOnce = false,
  ): Promise<string | null> {
    return this.gateway.sendMediaBuffer(accountId, phoneToJid(phone), mediaType, buffer, mimetype, caption, fileName, viewOnce);
  }

  sendLocation(accountId: string, phone: string, latitude: number, longitude: number, name?: string): Promise<string | null> {
    return this.gateway.sendLocation(accountId, phoneToJid(phone), latitude, longitude, name);
  }

  sendPoll(accountId: string, phone: string, question: string, options: string[], selectableCount?: number): Promise<string | null> {
    return this.gateway.sendPoll(accountId, phoneToJid(phone), question, options, selectableCount);
  }

  sendContacts(accountId: string, phone: string, contacts: { name: string; phone: string }[]): Promise<string | null> {
    return this.gateway.sendContact(accountId, phoneToJid(phone), contacts);
  }

  sendReaction(accountId: string, phone: string, externalId: string, emoji: string, fromMe = false): Promise<void> {
    return this.gateway.setReaction(accountId, phoneToJid(phone), externalId, emoji, fromMe);
  }

  editMessage(accountId: string, phone: string, externalId: string, newText: string): Promise<void> {
    return this.gateway.editMessage(accountId, phoneToJid(phone), externalId, newText);
  }

  deleteMessage(accountId: string, phone: string, externalId: string, fromMe: boolean): Promise<void> {
    return this.gateway.deleteMessage(accountId, phoneToJid(phone), externalId, fromMe);
  }

  forwardMessage(accountId: string, toPhone: string, messageId: string): Promise<string | null> {
    return this.gateway.forwardMessage(accountId, phoneToJid(toPhone), messageId);
  }

  setContactBlocked(accountId: string, phone: string, blocked: boolean): Promise<void> {
    return this.gateway.setContactBlocked(accountId, phoneToJid(phone), blocked);
  }

  setChatArchived(accountId: string, phone: string, archived: boolean): Promise<void> {
    return this.gateway.setArchived(accountId, phoneToJid(phone), archived);
  }

  setMessageStarred(accountId: string, phone: string, externalId: string, _fromMe: boolean, starred: boolean): Promise<void> {
    return this.gateway.setStar(accountId, phoneToJid(phone), externalId, starred);
  }

  setDisappearingMessages(accountId: string, phone: string, enabled: boolean, duration?: number): Promise<void> {
    return this.gateway.setDisappearing(accountId, phoneToJid(phone), enabled, duration);
  }

  async sendTyping(accountId: string, phone: string, typing: boolean): Promise<void> {
    const jid = phoneToJid(phone);
    if (typing) await this.gateway.startTyping(accountId, jid);
    else await this.gateway.stopTyping(accountId, jid);
  }

  async markRead(accountId: string, phone: string, externalIds: string[]): Promise<void> {
    const jid = phoneToJid(phone);
    for (const id of externalIds) {
      await this.gateway.sendSeen(accountId, jid, id).catch((err) =>
        this.logger.warn(`markRead failed for ${id}: ${err}`),
      );
    }
  }

  isOnWhatsApp(accountId: string, phone: string): Promise<boolean> {
    return this.gateway.checkNumberStatus(accountId, phone).then((r) => r.numberExists).catch(() => false);
  }

  fetchAvatar(accountId: string, phone: string): Promise<string | null> {
    return this.gateway.getContactAvatar(accountId, phoneToJid(phone));
  }

  addOrEditContact(accountId: string, phone: string, fullName: string, firstName?: string): Promise<void> {
    return this.gateway.addOrEditContact(accountId, phone, fullName, firstName);
  }

  sendWithLinkPreview(
    accountId: string,
    phone: string,
    text: string,
    linkPreview: { url: string; title: string; description?: string; thumbnailBase64?: string },
  ): Promise<string | null> {
    return this.gateway.sendWithLinkPreview(accountId, phoneToJid(phone), text, linkPreview);
  }

  // ── Own profile ───────────────────────────────────────────────────────────

  getProfile(accountId: string) {
    return this.gateway.getProfile(accountId);
  }

  setProfileName(accountId: string, name: string) {
    return this.gateway.setProfileName(accountId, name);
  }

  setProfileStatus(accountId: string, status: string) {
    return this.gateway.setProfileStatus(accountId, status);
  }

  setProfilePicture(accountId: string, url: string) {
    return this.gateway.setProfilePicture(accountId, url);
  }

  deleteProfilePicture(accountId: string) {
    return this.gateway.deleteProfilePicture(accountId);
  }

  // ── Presence (own) ──────────────────────────────────────────────────────────

  setPresence(accountId: string, presence: 'online' | 'offline') {
    return this.gateway.setPresence(accountId, presence);
  }

  getPresence(accountId: string, phone: string) {
    return this.gateway.getPresence(accountId, phoneToJid(phone));
  }

  subscribePresence(accountId: string, phone: string) {
    return this.gateway.subscribePresence(accountId, phoneToJid(phone));
  }

  // ── Chats ─────────────────────────────────────────────────────────────────

  getChatsOverview(accountId: string, limit?: number, offset?: number) {
    return this.gateway.getChatsOverview(accountId, limit, offset);
  }

  getChatHistory(accountId: string, phone: string, limit?: number, offset?: number, _downloadMedia?: boolean) {
    // History is served from our Postgres (Baileys has no message store), so
    // _downloadMedia is accepted for API compatibility but unused.
    return this.gateway.getChatMessages(accountId, phoneToJid(phone), limit, offset);
  }

  clearChat(accountId: string, phone: string) {
    return this.gateway.clearChat(accountId, phoneToJid(phone));
  }

  deleteChat(accountId: string, phone: string) {
    return this.gateway.deleteChat(accountId, phoneToJid(phone));
  }

  markChatUnread(accountId: string, phone: string) {
    return this.gateway.markChatUnread(accountId, phoneToJid(phone));
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  createGroup(accountId: string, name: string, participantPhones: string[]) {
    return this.gateway.createGroup(accountId, name, participantPhones.map(phoneToJid));
  }

  joinGroup(accountId: string, code: string) {
    return this.gateway.joinGroup(accountId, code);
  }

  leaveGroup(accountId: string, groupId: string) {
    return this.gateway.leaveGroup(accountId, groupId);
  }

  getGroupInviteCode(accountId: string, groupId: string) {
    return this.gateway.getGroupInviteCode(accountId, groupId);
  }

  addGroupParticipants(accountId: string, groupId: string, phones: string[]) {
    return this.gateway.addGroupParticipants(accountId, groupId, phones.map(phoneToJid));
  }

  removeGroupParticipants(accountId: string, groupId: string, phones: string[]) {
    return this.gateway.removeGroupParticipants(accountId, groupId, phones.map(phoneToJid));
  }

  promoteGroupAdmins(accountId: string, groupId: string, phones: string[]) {
    return this.gateway.promoteGroupAdmins(accountId, groupId, phones.map(phoneToJid));
  }

  demoteGroupAdmins(accountId: string, groupId: string, phones: string[]) {
    return this.gateway.demoteGroupAdmins(accountId, groupId, phones.map(phoneToJid));
  }

  setGroupSubject(accountId: string, groupId: string, subject: string) {
    return this.gateway.setGroupSubject(accountId, groupId, subject);
  }

  setGroupDescription(accountId: string, groupId: string, description: string) {
    return this.gateway.setGroupDescription(accountId, groupId, description);
  }

  revokeGroupInvite(accountId: string, groupId: string) {
    return this.gateway.revokeGroupInvite(accountId, groupId);
  }

  setGroupSettings(accountId: string, groupId: string, setting: 'locked' | 'unlocked' | 'announcement' | 'not_announcement') {
    return this.gateway.setGroupSettings(accountId, groupId, setting);
  }

  getAllGroups(accountId: string) {
    return this.gateway.getAllGroups(accountId);
  }

  getGroupMetadata(accountId: string, groupId: string) {
    return this.gateway.getGroupMetadata(accountId, groupId);
  }

  // ── Channels (Newsletters) ────────────────────────────────────────────────

  listChannels(accountId: string) {
    return this.gateway.listChannels(accountId);
  }

  createChannel(accountId: string, name: string, description?: string) {
    return this.gateway.createChannel(accountId, name, description);
  }

  getChannelMetadata(accountId: string, channelId: string) {
    return this.gateway.getChannelMetadata(accountId, channelId);
  }

  deleteChannel(accountId: string, channelId: string) {
    return this.gateway.deleteChannel(accountId, channelId);
  }

  followChannel(accountId: string, channelId: string, follow: boolean) {
    return this.gateway.followChannel(accountId, channelId, follow);
  }

  muteChannel(accountId: string, channelId: string, mute: boolean) {
    return this.gateway.muteChannel(accountId, channelId, mute);
  }

  reactToNewsletterMessage(accountId: string, channelId: string, serverId: string, reaction: string) {
    return this.gateway.reactToNewsletterMessage(accountId, channelId, serverId, reaction);
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  getLabels(accountId: string) {
    return this.gateway.getLabels(accountId);
  }

  addChatLabel(accountId: string, phone: string, labelId: string) {
    return this.gateway.addChatLabel(accountId, phoneToJid(phone), labelId);
  }

  removeChatLabel(accountId: string, phone: string, labelId: string) {
    return this.gateway.removeChatLabel(accountId, phoneToJid(phone), labelId);
  }

  sendButtons(
    accountId: string,
    phone: string,
    text: string,
    footer: string,
    buttons: Array<{ id: string; text: string }>,
  ) {
    return this.gateway.sendButtons(accountId, phoneToJid(phone), text, footer, buttons);
  }

  sendListMessage(
    accountId: string,
    phone: string,
    title: string,
    text: string,
    footer: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  ) {
    return this.gateway.sendListMessage(accountId, phoneToJid(phone), title, text, footer, buttonText, sections);
  }

  pinMessage(accountId: string, phone: string, messageId: string, unpin?: boolean) {
    return this.gateway.pinMessage(accountId, phoneToJid(phone), messageId, unpin);
  }

  editMediaCaption(
    accountId: string,
    phone: string,
    messageId: string,
    mediaType: 'image' | 'video' | 'document',
    caption: string,
  ) {
    return this.gateway.editMediaCaption(accountId, phoneToJid(phone), messageId, mediaType, caption);
  }

  // ── Status / Stories ─────────────────────────────────────────────────────

  sendTextStatus(accountId: string, text: string, backgroundColor?: string, targetPhones?: string[]): Promise<void> {
    const jids = targetPhones?.map(phoneToJid);
    return this.gateway.sendTextStatus(accountId, text, backgroundColor, jids);
  }

  sendImageStatus(accountId: string, imageBuffer: Buffer, caption?: string, targetPhones?: string[]): Promise<void> {
    const jids = targetPhones?.map(phoneToJid);
    return this.gateway.sendImageStatus(accountId, imageBuffer, caption, jids);
  }

  deleteStatus(accountId: string, messageId: string): Promise<void> {
    return this.gateway.deleteStatus(accountId, messageId);
  }

  // ── Recording presence ────────────────────────────────────────────────────

  startRecording(accountId: string, phone: string): Promise<void> {
    return this.gateway.startRecording(accountId, phoneToJid(phone));
  }

  stopRecording(accountId: string, phone: string): Promise<void> {
    return this.gateway.stopRecording(accountId, phoneToJid(phone));
  }
}
