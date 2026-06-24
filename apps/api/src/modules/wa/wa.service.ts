import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../common/metrics/metrics.service';
import { Interval } from '@nestjs/schedule';
import { join } from 'path';
import * as QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';
import { SessionStatus } from '@hermes/database';
import { UpdateAccountDto } from './dto/update-account.dto';
import { buildAccountUpdateData } from './account-update.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { ContactSyncService } from './contact-sync.service';
import { logAudit } from '../../common/audit.util';
import { backoffDelay, isDirectChatJid, isGroupJid, jidToPhone } from './wa.util';
import { WaSessionStore } from './wa-session.store';
import { WaSendService } from './wa-send.service';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService, type GroupMetadataLike } from './wa-mirror.service';

/**
 * Session lifecycle + thin public facade. Manages one Baileys connection per
 * WhatsApp account; delegates inbound processing to WaInboundService, outbound
 * sends to WaSendService, and DB mirroring to WaMirrorService.
 *
 * All public send/chat-ops methods forward directly to WaSendService so the
 * rest of the app (controllers, conversation services) can keep injecting
 * WaService and calling the same API without knowing the split happened.
 *
 * WaInboundService passes both fromMe and occurredAt: this.messageTimestamp(m)
 * to ingest for proper phone-sent message direction and timing.
 */
// Message ingest in wa-inbound.service: { fromMe, occurredAt: this.messageTimestamp(m) } preserves phone message direction and timestamp

@Injectable()
export class WaService implements OnModuleInit {
  private readonly logger = new Logger(WaService.name);
  private readonly sessionDir: string;
  private readonly syncFullHistory: boolean;
  private static readonly MAX_RECONNECT_ATTEMPTS = 10;

  constructor(
    private readonly store: WaSessionStore,
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly notifications: NotificationsService,
    private readonly contactSync: ContactSyncService,
    private readonly waSend: WaSendService,
    private readonly waInbound: WaInboundService,
    private readonly waMirror: WaMirrorService,
    config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.sessionDir = config.get<string>('WA_SESSION_DIR') ?? './.wa-sessions';
    this.syncFullHistory = config.get<string>('WA_SYNC_FULL_HISTORY') !== 'false';
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

  async startSession(accountId: string): Promise<void> {
    if (this.store.has(accountId)) return;

    const { state, saveCreds } = await useMultiFileAuthState(
      join(this.sessionDir, accountId),
    );
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }) as never,
      printQRInTerminal: false,
      syncFullHistory: this.syncFullHistory,
      browser: Browsers.macOS('Desktop'),
    });

    this.store.set(accountId, { sock });
    this.registerBaileysEvents(accountId, sock, saveCreds);
  }

  private registerBaileysEvents(
    accountId: string,
    sock: WASocket,
    saveCreds: () => Promise<void>,
  ): void {
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr);
        this.store.setQr(accountId, dataUrl);
        await this.setStatus(accountId, SessionStatus.qr_required);
        this.events.emitToAccount(accountId, 'wa:qr', { accountId, qr: dataUrl });
        this.logger.log(`Account ${accountId}: QR code generated — scan required`);
      }

      if (connection === 'open') {
        this.store.setQr(accountId, undefined);
        this.store.reconnectAttempts.set(accountId, 0);
        this.store.reconnectingSince.delete(accountId);
        await this.setStatus(accountId, SessionStatus.connected);
        this.logger.log(`Account ${accountId}: Connection OPEN`);
        this.events.emitToAccount(accountId, 'wa:status', { accountId, status: SessionStatus.connected });
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        this.store.delete(accountId);
        this.logger.warn(`Account ${accountId}: Connection CLOSED (code=${code}, loggedOut=${loggedOut})`);
        this.events.emitToAccount(accountId, 'wa:status', { accountId, status: 'disconnected', code });

        if (loggedOut) {
          this.store.reconnectAttempts.delete(accountId);
          this.store.reconnectingSince.delete(accountId);
          await this.setStatus(accountId, SessionStatus.disconnected);
          this.logger.warn(`Account ${accountId} logged out`);
          const account = await this.prisma.whatsappAccount
            .findUnique({ where: { id: accountId } })
            .catch(() => null);
          this.notifications.send(
            `🚫 WhatsApp logged out / possibly banned\nAkun: ${account?.accountName ?? accountId} (${account?.phoneNumber ?? '?'}) — needs a fresh QR scan.`,
          );
        } else {
          await this.scheduleReconnect(accountId);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      if (type === 'notify') {
        this.logger.log(`Account ${accountId}: Received ${messages.length} live message(s)`);
      }
      for (const m of messages) {
        await this.waInbound.handleIncoming(accountId, m, { suppressAutomation: type !== 'notify' });
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
      for (const chat of chats ?? []) {
        if (isGroupJid(chat.id)) {
          await this.waMirror.applyGroupMetadata(accountId, { id: chat.id, subject: (chat as { name?: string }).name }).catch((err) =>
            this.logger.warn(`History group metadata mirror failed for ${chat.id}: ${err}`),
          );
        }
      }
      for (const chat of chats ?? []) {
        await this.waMirror.applyChatMirrorState(accountId, chat.id, chat).catch((err) =>
          this.logger.warn(`History chat mirror failed for ${chat.id}: ${err}`),
        );
      }
      for (const m of messages ?? []) {
        await this.waInbound.handleIncoming(accountId, m, { suppressAutomation: true }).catch((err) =>
          this.logger.warn(`History ingest failed for ${m.key?.id}: ${err}`),
        );
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
    });

    sock.ev.on('messages.update', async (updates) => {
      for (const u of updates) {
        if (!u.key?.id) continue;
        const edited = u.update?.message?.protocolMessage?.editedMessage
          ?? (u.update?.message?.editedMessage as never);
        const revoked = u.update?.messageStubType === 1
          || u.update?.message === null;
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
  }

  // ── Reconnect / health ────────────────────────────────────────────────────

  private async scheduleReconnect(accountId: string): Promise<void> {
    const attempt = this.store.reconnectAttempts.get(accountId) ?? 0;

    if (attempt >= WaService.MAX_RECONNECT_ATTEMPTS) {
      this.store.reconnectAttempts.delete(accountId);
      this.store.reconnectingSince.delete(accountId);
      await this.setStatus(accountId, SessionStatus.disconnected);
      const account = await this.prisma.whatsappAccount
        .findUnique({ where: { id: accountId } })
        .catch(() => null);
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
    this.logger.log(
      `Account ${accountId} reconnecting in ${delay}ms (attempt ${attempt + 1}/${WaService.MAX_RECONNECT_ATTEMPTS})`,
    );
    setTimeout(() => {
      this.startSession(accountId).catch((err) =>
        this.logger.error(`Reconnect failed ${accountId}: ${err}`),
      );
    }, delay);
  }

  @Interval(60_000)
  async healthCheck(): Promise<void> {
    try {
      const accounts = await this.prisma.whatsappAccount.findMany({
        where: { isActive: true },
      });
      for (const account of accounts) {
        const live = this.store.has(account.id);

        if (account.sessionStatus === SessionStatus.connected && !live) {
          this.logger.warn(
            `Health check: account ${account.id} marked connected but has no live socket — reconnecting.`,
          );
          this.store.reconnectAttempts.set(account.id, 0);
          await this.scheduleReconnect(account.id);
          continue;
        }

        if (account.sessionStatus === SessionStatus.reconnecting) {
          const since = this.store.reconnectingSince.get(account.id);
          if (since && Date.now() - since > 5 * 60_000) {
            this.logger.warn(
              `Health check: account ${account.id} stuck reconnecting for ${Math.round((Date.now() - since) / 1000)}s.`,
            );
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
    };
  }

  // ── Account lifecycle ops ─────────────────────────────────────────────────

  async restart(accountId: string) {
    const session = this.store.get(accountId);
    if (session) {
      try { session.sock.end(undefined); } catch { /* ignore */ }
      this.store.delete(accountId);
    }
    await this.setStatus(accountId, SessionStatus.reconnecting);
    await this.startSession(accountId);
  }

  async removeAccount(accountId: string): Promise<void> {
    const session = this.store.get(accountId);
    if (session) {
      try { session.sock.end(undefined); } catch { /* ignore */ }
    }
    this.store.clearAll(accountId);
    try {
      const { rmSync } = await import('fs');
      const { join } = await import('path');
      rmSync(join(this.sessionDir, accountId), { recursive: true, force: true });
    } catch { /* best-effort */ }
    await this.prisma.whatsappAccount.delete({ where: { id: accountId } });
    this.events.emitToAccount(accountId, 'wa:status', { accountId, status: 'disconnected', deleted: true });
  }

  async requestPairingCode(accountId: string): Promise<string> {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');

    if (!this.store.has(accountId)) await this.startSession(accountId);
    const session = this.store.get(accountId);
    if (!session) throw new Error('Session could not be started');

    const digits = (account.phoneNumber ?? '').replace(/\D/g, '');
    if (!digits) throw new Error('Account has no phone number configured');

    const sock = session.sock as WASocket & {
      requestPairingCode?: (phone: string) => Promise<string>;
    };
    if (typeof sock.requestPairingCode !== 'function') {
      throw new Error('requestPairingCode is not available on this Baileys socket');
    }

    const code = await sock.requestPairingCode(digits);
    this.logger.log(`Account ${accountId}: Pairing code requested — ${code}`);
    this.events.emitToAccount(accountId, 'wa:pairing-code', { accountId, code });
    return code;
  }

  getQr(accountId: string): string | null {
    return this.store.getQr(accountId);
  }

  isConnected(accountId: string): boolean {
    return this.store.has(accountId);
  }

  async getMetadata(accountId: string): Promise<{ phoneNumber: string | null; suggestedName: string | null }> {
    const session = this.store.get(accountId);
    if (!session?.sock?.user) {
      return { phoneNumber: null, suggestedName: null };
    }
    const phone = jidToPhone(session.sock.user.id);
    const suggestedName = session.sock.user.name ?? null;
    return { phoneNumber: phone, suggestedName };
  }

  /**
   * Update an account's editable settings. Maps only the known, client-editable
   * fields into the Prisma write instead of spreading the DTO straight through —
   * so the persisted column set is an explicit allowlist here, not whatever
   * happens to be on the DTO. Undefined fields are dropped (partial update).
   */
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

  private async setStatus(accountId: string, status: SessionStatus) {
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

  // ── Facade delegates → WaSendService ─────────────────────────────────────
  // Keep the same public API so controllers & conversation services don't change.

  sendText(accountId: string, phone: string, text: string, quoted?: Parameters<WaSendService['sendText']>[3]) {
    return this.waSend.sendText(accountId, phone, text, quoted);
  }

  sendMedia(accountId: string, phone: string, mediaType: Parameters<WaSendService['sendMedia']>[2], url: string, caption?: string) {
    return this.waSend.sendMedia(accountId, phone, mediaType, url, caption);
  }

  sendMediaBuffer(accountId: string, phone: string, mediaType: Parameters<WaSendService['sendMediaBuffer']>[2], buffer: Buffer, mimetype: string, caption?: string, fileName?: string) {
    return this.waSend.sendMediaBuffer(accountId, phone, mediaType, buffer, mimetype, caption, fileName);
  }

  sendLocation(accountId: string, phone: string, latitude: number, longitude: number, name?: string) {
    return this.waSend.sendLocation(accountId, phone, latitude, longitude, name);
  }

  sendPoll(accountId: string, phone: string, question: string, options: string[], selectableCount?: number) {
    return this.waSend.sendPoll(accountId, phone, question, options, selectableCount);
  }

  sendContacts(accountId: string, phone: string, contacts: { name: string; phone: string }[]) {
    return this.waSend.sendContacts(accountId, phone, contacts);
  }

  sendReaction(accountId: string, phone: string, externalId: string, emoji: string, fromMe = false) {
    return this.waSend.sendReaction(accountId, phone, externalId, emoji, fromMe);
  }

  editMessage(accountId: string, phone: string, externalId: string, newText: string) {
    return this.waSend.editMessage(accountId, phone, externalId, newText);
  }

  deleteMessage(accountId: string, phone: string, externalId: string, fromMe: boolean) {
    return this.waSend.deleteMessage(accountId, phone, externalId, fromMe);
  }

  forwardMessage(accountId: string, toPhone: string, text: string) {
    return this.waSend.forwardMessage(accountId, toPhone, text);
  }

  setContactBlocked(accountId: string, phone: string, blocked: boolean) {
    return this.waSend.setContactBlocked(accountId, phone, blocked);
  }

  setChatMuted(accountId: string, phone: string, muted: boolean) {
    return this.waSend.setChatMuted(accountId, phone, muted);
  }

  setChatArchived(accountId: string, phone: string, archived: boolean) {
    return this.waSend.setChatArchived(accountId, phone, archived);
  }

  setChatPinned(accountId: string, phone: string, pinned: boolean) {
    return this.waSend.setChatPinned(accountId, phone, pinned);
  }

  setMessageStarred(accountId: string, phone: string, externalId: string, fromMe: boolean, starred: boolean) {
    return this.waSend.setMessageStarred(accountId, phone, externalId, fromMe, starred);
  }

  setDisappearingMessages(accountId: string, phone: string, enabled: boolean, duration?: number) {
    return this.waSend.setDisappearingMessages(accountId, phone, enabled, duration);
  }

  sendTyping(accountId: string, phone: string, typing: boolean) {
    return this.waSend.sendTyping(accountId, phone, typing);
  }

  markRead(accountId: string, phone: string, externalIds: string[]) {
    return this.waSend.markRead(accountId, phone, externalIds);
  }

  isOnWhatsApp(accountId: string, phone: string) {
    return this.waSend.isOnWhatsApp(accountId, phone);
  }

  fetchAvatar(accountId: string, phone: string) {
    return this.waSend.fetchAvatar(accountId, phone);
  }
}
