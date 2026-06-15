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
import { phoneToJid, jidToPhone, humanDelay, isDirectChatJid, isGroupJid, isSupportedChatJid, extForMimetype, typingDelay, backoffDelay } from './wa.util';
import { SettingsService } from '../settings/settings.service';
import { MediaStorageService } from '../media/media-storage.service';
import { logAudit } from '../../common/audit.util';
import { isWithinBusinessHours } from '../../common/business-hours.util';
import { ContactSyncService } from './contact-sync.service';

interface Session {
  sock: WASocket;
  qr?: string; // latest QR as data-URL PNG
}

type LongLike = { toString(): string };

type GroupMetadataLike = {
  id?: string;
  subject?: string | null;
  owner?: string | null;
  desc?: string | null;
  participants?: Array<{
    id?: string;
    admin?: string | null;
  }>;
};

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
    private readonly contactSync: ContactSyncService,
    private readonly settings: SettingsService,
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

  // ── Anti-ban delays (admin-tunable via settings) ──────────────────────
  /** Random per-message send delay using the configured bounds. */
  private async humanDelay(): Promise<void> {
    const wa = await this.settings.wa();
    return humanDelay(wa.humanDelayMinMs, wa.humanDelayMaxMs);
  }

  /** Typing-indicator duration for a message using the configured model. */
  private async typingDelay(text: string): Promise<void> {
    const wa = await this.settings.wa();
    return typingDelay(text, wa.typingPerCharMs, wa.typingMinMs, wa.typingMaxMs);
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
      // Request WhatsApp history chunks so the app mirrors chats sent/read on the phone.
      // macOS/desktop browser identity is required by Baileys for full history sync.
      syncFullHistory: this.syncFullHistory,
      browser: Browsers.macOS('Desktop'),
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
        this.logger.log(`Account ${accountId}: QR code generated — scan required`);
      }

      if (connection === 'open') {
        const session = this.sessions.get(accountId);
        if (session) session.qr = undefined;
        this.reconnectAttempts.set(accountId, 0);
        this.reconnectingSince.delete(accountId);
        await this.setStatus(accountId, SessionStatus.connected);
        this.logger.log(`Account ${accountId}: Connection OPEN`);
        this.events.emitToAccount(accountId, 'wa:status', { accountId, status: SessionStatus.connected });
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })
          ?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        this.sessions.delete(accountId);
        this.logger.warn(`Account ${accountId}: Connection CLOSED (code=${code}, loggedOut=${loggedOut})`);
        this.events.emitToAccount(accountId, 'wa:status', { accountId, status: 'disconnected', code });

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
      if (type !== 'notify' && type !== 'append') return;
      if (type === 'notify') {
        this.logger.log(`Account ${accountId}: Received ${messages.length} live message(s)`);
      }
      for (const m of messages) {
        await this.handleIncoming(accountId, m, { suppressAutomation: type !== 'notify' });
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
      on(event: 'groups.upsert' | 'groups.update' | 'group-participants.update', listener: (payload: any) => void): void;
    };

    groupEvents.on('groups.upsert', async (groups: GroupMetadataLike[]) => {
      for (const group of groups ?? []) {
        await this.applyGroupMetadata(accountId, group).catch((err) =>
          this.logger.warn(`Group upsert mirror failed for ${group.id}: ${err}`),
        );
      }
    });

    groupEvents.on('groups.update', async (groups: GroupMetadataLike[]) => {
      for (const group of groups ?? []) {
        await this.applyGroupMetadata(accountId, group, { logChanges: true }).catch((err) =>
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
      await this.applyGroupParticipantUpdate(accountId, update).catch((err) =>
        this.logger.warn(`Group participant mirror failed for ${update.id}: ${err}`),
      );
    });

    sock.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        await this.applyChatMirrorState(accountId, chat.id, chat).catch((err) =>
          this.logger.warn(`Chat upsert mirror failed for ${chat.id}: ${err}`),
        );
      }
    });

    sock.ev.on('chats.update', async (updates) => {
      for (const chat of updates) {
        if (!chat.id) continue;
        await this.applyChatMirrorState(accountId, chat.id, chat).catch((err) =>
          this.logger.warn(`Chat update mirror failed for ${chat.id}: ${err}`),
        );
      }
    });

    sock.ev.on('blocklist.set', async ({ blocklist }) => {
      await this.applyBlocklist(accountId, blocklist, true).catch((err) =>
        this.logger.warn(`Blocklist set mirror failed: ${err}`),
      );
    });

    sock.ev.on('blocklist.update', async ({ blocklist, type }) => {
      await this.applyBlocklist(accountId, blocklist, type === 'add').catch((err) =>
        this.logger.warn(`Blocklist update mirror failed: ${err}`),
      );
    });

    sock.ev.on('message-receipt.update', async (updates) => {
      for (const update of updates) {
        if (!update.key?.id) continue;
        await this.applyReceiptDetail(accountId, update.key.id, update.receipt).catch((err) =>
          this.logger.warn(`Receipt detail mirror failed for ${update.key?.id}: ${err}`),
        );
      }
    });

    // Baileys delivers the *initial* history sync (negotiated at QR pairing
    // when syncFullHistory is on) through this event — NOT messages.upsert.
    // Without this handler the phone's existing chats never reach the app.
    sock.ev.on('messaging-history.set', async ({ messages, contacts, chats, isLatest }) => {
      this.logger.log(
        `History sync ${accountId}: ${messages?.length ?? 0} messages, ${contacts?.length ?? 0} contacts${isLatest ? ' (latest)' : ''}`,
      );
      await this.contactSync.syncContacts(accountId, contacts ?? []).catch((err) =>
        this.logger.warn(`History contact sync failed: ${err}`),
      );
      for (const chat of chats ?? []) {
        if (isGroupJid(chat.id)) {
          await this.applyGroupMetadata(accountId, { id: chat.id, subject: (chat as { name?: string }).name }).catch((err) =>
            this.logger.warn(`History group metadata mirror failed for ${chat.id}: ${err}`),
          );
        }
      }
      for (const chat of chats ?? []) {
        await this.applyChatMirrorState(accountId, chat.id, chat).catch((err) =>
          this.logger.warn(`History chat mirror failed for ${chat.id}: ${err}`),
        );
      }
      for (const m of messages ?? []) {
        await this.handleIncoming(accountId, m, { suppressAutomation: true }).catch((err) =>
          this.logger.warn(`History ingest failed for ${m.key?.id}: ${err}`),
        );
      }
    });

    // Customer typing/online indicator → live to the dashboard (scoped to account).
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

  private async conversationsForJid(accountId: string, jid: string) {
    if (isGroupJid(jid)) {
      const conversation = await this.ensureGroupConversation(accountId, { id: jid });
      return [{ id: conversation.id }];
    }
    if (!isDirectChatJid(jid)) return [];
    return this.prisma.conversation.findMany({
      where: {
        whatsappAccountId: accountId,
        customer: {
          phoneNumber: jidToPhone(jid),
          sourceAccountId: accountId,
        },
      },
      select: { id: true },
    });
  }

  private async ensureGroupConversation(accountId: string, group: GroupMetadataLike) {
    const jid = group.id;
    if (!jid || !isGroupJid(jid)) {
      throw new Error(`Invalid group jid: ${jid}`);
    }
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    const subject = group.subject ?? jid;
    const participants = (group.participants ?? [])
      .filter((participant) => participant.id)
      .map((participant) => ({ jid: participant.id, admin: participant.admin ?? null }));

    const customer = await this.prisma.customer.upsert({
      where: {
        phoneNumber_sourceAccountId: {
          phoneNumber: jid,
          sourceAccountId: accountId,
        },
      },
      update: { name: subject },
      create: {
        name: subject,
        phoneNumber: jid,
        sourceAccountId: accountId,
        assignedAdminId: account.assignedAdminId,
      },
    });

    const existing = await this.prisma.conversation.findUnique({
      where: { whatsappAccountId_chatJid: { whatsappAccountId: accountId, chatJid: jid } },
      select: { id: true, groupSubject: true },
    });
    const data = {
      customerId: customer.id,
      whatsappAccountId: accountId,
      botId: account.assignedBotId,
      aiMode: AiMode.ai_off,
      assignedAdminId: account.assignedAdminId,
      chatJid: jid,
      isGroup: true,
      groupSubject: subject,
      groupOwnerJid: group.owner ?? null,
      groupDescription: group.desc ?? null,
      groupParticipants: participants,
      groupMetadata: group as never,
    };

    if (existing) {
      return this.prisma.conversation.update({
        where: { id: existing.id },
        data: {
          groupSubject: subject,
          groupOwnerJid: group.owner ?? undefined,
          groupDescription: group.desc ?? undefined,
          groupParticipants: participants.length ? participants : undefined,
          groupMetadata: group as never,
        },
      });
    }

    const conversation = await this.prisma.conversation.create({ data });
    this.events.emitToAccount(accountId, 'conversation:updated', {
      conversationId: conversation.id,
      isGroup: true,
      groupSubject: subject,
    });
    return conversation;
  }

  private async applyGroupMetadata(
    accountId: string,
    group: GroupMetadataLike,
    opts: { logChanges?: boolean } = {},
  ) {
    if (!group.id || !isGroupJid(group.id)) return;
    const before = await this.prisma.conversation.findUnique({
      where: { whatsappAccountId_chatJid: { whatsappAccountId: accountId, chatJid: group.id } },
      select: { id: true, groupSubject: true, groupDescription: true },
    });
    const conversation = await this.ensureGroupConversation(accountId, group);
    this.events.emitToAccount(accountId, 'conversation:updated', {
      conversationId: conversation.id,
      isGroup: true,
      groupSubject: conversation.groupSubject,
      groupDescription: conversation.groupDescription,
      groupParticipants: conversation.groupParticipants,
    });

    if (!opts.logChanges || !before) return;
    if (group.subject && before.groupSubject && group.subject !== before.groupSubject) {
      await this.logGroupSystemMessage(accountId, conversation.id, `Subject grup diganti menjadi "${group.subject}"`);
    }
    if (group.desc && before.groupDescription !== undefined && group.desc !== before.groupDescription) {
      await this.logGroupSystemMessage(accountId, conversation.id, 'Deskripsi grup diperbarui');
    }
  }

  private async applyGroupParticipantUpdate(
    accountId: string,
    update: { id?: string; author?: string; participants?: string[]; action?: string },
  ) {
    if (!update.id || !isGroupJid(update.id)) return;
    const session = this.sessions.get(accountId);
    let conversation = await this.ensureGroupConversation(accountId, { id: update.id });
    if (session) {
      const metadata = await session.sock.groupMetadata(update.id).catch(() => null);
      if (metadata) {
        conversation = await this.ensureGroupConversation(accountId, metadata as GroupMetadataLike);
      }
    }
    const participants = update.participants ?? [];
    const count = participants.length;
    const sample = participants.slice(0, 3).map(jidToPhone).join(', ');
    const suffix = count > 3 ? ` +${count - 3} lainnya` : '';
    const actionLabel: Record<string, string> = {
      add: 'ditambahkan ke grup',
      remove: 'dikeluarkan dari grup',
      promote: 'dipromosikan menjadi admin',
      demote: 'diturunkan dari admin',
    };
    const label = actionLabel[update.action ?? ''] ?? `mengalami perubahan (${update.action ?? 'unknown'})`;
    await this.logGroupSystemMessage(
      accountId,
      conversation.id,
      `${sample || `${count} participant`} ${label}${suffix}`,
      {
        action: update.action ?? null,
        author: update.author ?? null,
        participants,
      },
    );
  }

  private async logGroupSystemMessage(
    accountId: string,
    conversationId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.system,
        messageType: MessageType.system,
        content,
        status: MessageStatus.delivered,
        rawWaPayload: metadata as never,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessage: content, lastMessageAt: message.createdAt },
    });
    this.events.emitToAccount(accountId, 'message:new', { conversationId, message });
    this.events.emitToAccount(accountId, 'conversation:updated', {
      conversationId,
      lastMessage: content,
      lastMessageAt: message.createdAt,
    });
  }

  private longToNumber(value: number | LongLike | null | undefined): number | undefined {
    if (value === null || value === undefined) return undefined;
    const n = Number(typeof value === 'object' && 'toString' in value ? value.toString() : value);
    return Number.isFinite(n) ? n : undefined;
  }

  private async applyChatMirrorState(
    accountId: string,
    jid: string,
    chat: {
      archived?: boolean | null;
      pinned?: number | null;
      muteEndTime?: number | LongLike | null;
      unreadCount?: number | null;
      ephemeralExpiration?: number | null;
      ephemeralSettingTimestamp?: number | LongLike | null;
    },
  ) {
    const conversations = await this.conversationsForJid(accountId, jid);
    if (conversations.length === 0) return;

    const data: Record<string, unknown> = {};
    if (chat.archived !== undefined && chat.archived !== null) data.isArchived = chat.archived;
    if (chat.pinned !== undefined && chat.pinned !== null) data.isPinned = chat.pinned > 0;
    if (chat.muteEndTime !== undefined && chat.muteEndTime !== null) {
      const muteEnd = this.longToNumber(chat.muteEndTime);
      const isMuted = Boolean(muteEnd && muteEnd > Math.floor(Date.now() / 1000));
      data.isMuted = isMuted;
      data.muteUntil = isMuted && muteEnd ? new Date(muteEnd * 1000) : null;
    }
    if (chat.unreadCount !== undefined && chat.unreadCount !== null) data.unreadCount = chat.unreadCount;
    if (chat.ephemeralExpiration !== undefined && chat.ephemeralExpiration !== null) {
      data.disappearingDuration = chat.ephemeralExpiration > 0 ? chat.ephemeralExpiration : null;
      const setAt = this.longToNumber(chat.ephemeralSettingTimestamp);
      data.disappearingSetAt = chat.ephemeralExpiration > 0 && setAt ? new Date(setAt * 1000) : null;
    }
    if (Object.keys(data).length === 0) return;

    for (const conversation of conversations) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: data as never,
      });
      this.events.emitToAccount(accountId, 'conversation:updated', {
        conversationId: conversation.id,
        ...data,
      });
    }
  }

  private async applyBlocklist(accountId: string, blocklist: string[], blocked: boolean) {
    for (const jid of blocklist) {
      const conversations = await this.conversationsForJid(accountId, jid);
      for (const conversation of conversations) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { isBlocked: blocked },
        });
        this.events.emitToAccount(accountId, 'conversation:updated', {
          conversationId: conversation.id,
          isBlocked: blocked,
        });
      }
    }
  }

  private async applyReceiptDetail(
    accountId: string,
    externalId: string,
    receipt: {
      userJid?: string | null;
      receiptTimestamp?: number | LongLike | null;
      readTimestamp?: number | LongLike | null;
      playedTimestamp?: number | LongLike | null;
      pendingDeviceJid?: string[] | null;
      deliveredDeviceJid?: string[] | null;
    },
  ) {
    const message = await this.prisma.message.findFirst({
      where: { externalId, conversation: { whatsappAccountId: accountId } },
      select: { id: true, conversationId: true, receiptDetails: true, status: true },
    });
    if (!message) return;
    const key = receipt.userJid ?? 'unknown';
    const details = (message.receiptDetails as Record<string, unknown>) ?? {};
    details[key] = {
      receiptTimestamp: this.longToNumber(receipt.receiptTimestamp) ?? null,
      readTimestamp: this.longToNumber(receipt.readTimestamp) ?? null,
      playedTimestamp: this.longToNumber(receipt.playedTimestamp) ?? null,
      pendingDeviceJid: receipt.pendingDeviceJid ?? [],
      deliveredDeviceJid: receipt.deliveredDeviceJid ?? [],
    };
    const readTs = this.longToNumber(receipt.readTimestamp);
    const deliveredTs = this.longToNumber(receipt.receiptTimestamp);
    const status = readTs
      ? MessageStatus.read
      : deliveredTs && message.status !== MessageStatus.read
        ? MessageStatus.delivered
        : message.status;
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { receiptDetails: details as never, status },
    });
    this.events.emitToAccount(accountId, 'message:updated', {
      conversationId: message.conversationId,
      message: updated,
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

    // Download inbound media to WA_MEDIA_DIR and reference it as /media/<file>.
    // Failure is non-fatal: the message is still ingested, just without media.
    // History backfill skips downloads entirely: old media keys are usually
    // expired and thousands of fetches would stall the sync.
    let mediaUrl: string | undefined;
    if (!opts.suppressAutomation &&
        (type === MessageType.image || type === MessageType.video ||
         type === MessageType.audio || type === MessageType.document)) {
      mediaUrl = await this.downloadInboundMedia(m).catch((err) => {
        this.logger.warn(`Media download failed for ${m.key.id}: ${err}`);
        return undefined;
      });
    }

    // If the customer replied to (quoted) an earlier message, WhatsApp sends
    // the original's id as contextInfo.stanzaId — link it to our stored row.
    const ctx =
      msg?.extendedTextMessage?.contextInfo ??
      msg?.imageMessage?.contextInfo ??
      msg?.videoMessage?.contextInfo ??
      msg?.documentMessage?.contextInfo;

    // Newer WhatsApp addresses some chats by @lid (privacy identifier) instead
    // of a phone number. Baileys still surfaces the real phone on the message
    // key as senderPn / participantPn — capture it so ingest can resolve and
    // persist the lid → phone mapping instead of showing a raw "…@lid" string.
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
    if (!convo) {
      this.logger.debug(`maybeAutoReply: conversation not found: ${conversationId}`);
      return;
    }
    if (convo.takeoverStatus === TakeoverStatus.admin_takeover) {
      this.logger.debug(`maybeAutoReply: admin takeover active`);
      return;
    }
    if (convo.aiMode === AiMode.ai_off || convo.aiMode === AiMode.ai_paused) {
      this.logger.debug(`maybeAutoReply: AI mode is off/paused: ${convo.aiMode}`);
      return;
    }
    if (!convo.customer.phoneNumber) {
      this.logger.debug(`maybeAutoReply: no phone number`);
      return;
    }

    this.logger.debug(`maybeAutoReply: generating reply for ${conversationId}, mode=${convo.aiMode}`);
    const { text } = await this.ai.generateReply(conversationId);
    if (!text) {
      this.logger.debug(`maybeAutoReply: generateReply returned empty text`);
      return;
    }
    this.logger.debug(`maybeAutoReply: generated reply: ${text.substring(0, 100)}...`);

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
    this.logger.debug(`storeDraft: created draft message ${message.id} for conversation ${conversationId}`);
    this.events.emitToAccount(accountId, 'message:draft', { conversationId, message });
    this.logger.debug(`storeDraft: emitted message:draft event to account ${accountId}`);
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

  private resolveType(msg?: proto.IMessage | null): MessageType {
    if (msg?.imageMessage) return MessageType.image;
    if (msg?.videoMessage) return MessageType.video;
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
    await this.typingDelay(text);
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
    await this.humanDelay();

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
    await this.throttleSend(accountId);
    await this.humanDelay();

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

  async sendLocation(
    accountId: string,
    phone: string,
    latitude: number,
    longitude: number,
    name?: string,
  ): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const sent = await session.sock.sendMessage(jid, {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name,
      },
    } as never);
    return sent?.key.id ?? null;
  }

  async sendPoll(
    accountId: string,
    phone: string,
    question: string,
    options: string[],
    selectableCount = 1,
  ): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const sent = await session.sock.sendMessage(jid, {
      poll: {
        name: question,
        values: options,
        selectableCount,
      },
    } as never);
    return sent?.key.id ?? null;
  }

  async sendContacts(
    accountId: string,
    phone: string,
    contacts: { name: string; phone: string }[],
  ): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const contactCards = contacts.map((contact) => {
      const digits = contact.phone.replace(/[^\d]/g, '');
      return {
        displayName: contact.name,
        vcard: [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${contact.name}`,
          `TEL;type=CELL;type=VOICE;waid=${digits}:${contact.phone}`,
          'END:VCARD',
        ].join('\n'),
      };
    });
    const sent = await session.sock.sendMessage(jid, {
      contacts: {
        displayName: contacts.length === 1 ? contacts[0].name : `${contacts.length} contacts`,
        contacts: contactCards,
      },
    } as never);
    return sent?.key.id ?? null;
  }

  async forwardMessage(accountId: string, toPhone: string, text: string): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(toPhone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const sent = await session.sock.sendMessage(jid, {
      text,
      contextInfo: { forwardingScore: 1, isForwarded: true },
    } as never);
    return sent?.key.id ?? null;
  }

  async setContactBlocked(accountId: string, phone: string, blocked: boolean): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    await session.sock.updateBlockStatus(phoneToJid(phone), blocked ? 'block' : 'unblock');
  }

  async setChatMuted(accountId: string, phone: string, muted: boolean): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    const muteUntil = muted ? Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 : null;
    await session.sock.chatModify({ mute: muteUntil } as never, jid);
  }

  async setChatArchived(accountId: string, phone: string, archived: boolean): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    await session.sock.chatModify({ archive: archived, lastMessages: [] } as never, phoneToJid(phone));
  }

  async setChatPinned(accountId: string, phone: string, pinned: boolean): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    await session.sock.chatModify({ pin: pinned } as never, phoneToJid(phone));
  }

  async setMessageStarred(
    accountId: string,
    phone: string,
    externalId: string,
    fromMe: boolean,
    starred: boolean,
  ): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.chatModify({
      star: {
        messages: [{ id: externalId, fromMe }],
        star: starred,
      },
    } as never, jid);
  }

  async setDisappearingMessages(
    accountId: string,
    phone: string,
    enabled: boolean,
    duration = 7 * 24 * 60 * 60,
  ): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.sendMessage(jid, {
      disappearingMessagesInChat: enabled ? duration : false,
    } as never);
  }

  async sendTyping(accountId: string, phone: string, typing: boolean): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.presenceSubscribe(jid).catch(() => undefined);
    await session.sock.sendPresenceUpdate(typing ? 'composing' : 'paused', jid);
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

  /** Fully remove an account: close socket, clean up state, delete DB record + session files. */
  async removeAccount(accountId: string): Promise<void> {
    // 1. Close live socket if any.
    const session = this.sessions.get(accountId);
    if (session) {
      try {
        session.sock.end(undefined);
      } catch { /* ignore */ }
      this.sessions.delete(accountId);
    }
    // 2. Clean up anti-ban / reconnect state.
    this.reconnectAttempts.delete(accountId);
    this.reconnectingSince.delete(accountId);
    this.sendTimestamps.delete(accountId);
    // 3. Delete on-disk auth state (session credentials).
    try {
      const { rmSync } = await import('fs');
      const { join } = await import('path');
      const sessionPath = join(this.sessionDir, accountId);
      rmSync(sessionPath, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
    // 4. Delete DB record (cascades to related data via FK).
    await this.prisma.whatsappAccount.delete({ where: { id: accountId } });
    // 5. Notify dashboards.
    this.events.emitToAccount(accountId, 'wa:status', {
      accountId,
      status: 'disconnected',
      deleted: true,
    });
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
