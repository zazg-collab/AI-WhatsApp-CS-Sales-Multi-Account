import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { SessionStatus } from '@hermes/database';
import { MetricsService } from '../../common/metrics/metrics.service';
import { UpdateAccountDto } from './dto/update-account.dto';
import { buildAccountUpdateData } from './account-update.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { ContactSyncService } from './contact-sync.service';
import { logAudit } from '../../common/audit.util';
import { phoneToJid } from './wa.util';
import { WahaClientService } from './waha-client.service';
import { WaRateLimiter } from './wa-rate-limiter';

/**
 * Session lifecycle + thin public facade.
 * All session management is now delegated to WAHA via WahaClientService.
 * All outbound sends go through WaRateLimiter → WahaClientService.
 * Inbound events are handled by WahaEventService (wired separately).
 */
@Injectable()
export class WaService implements OnModuleInit {
  private readonly logger = new Logger(WaService.name);

  constructor(
    private readonly wahaClient: WahaClientService,
    private readonly rateLimiter: WaRateLimiter,
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly notifications: NotificationsService,
    private readonly contactSync: ContactSyncService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

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
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    // Create session in WAHA if it doesn't exist yet, then start it.
    // WAHA returns 409 if already exists — swallow that.
    try {
      await this.wahaClient.createSession(accountId);
    } catch { /* session already exists */ }

    await this.wahaClient.startSession(accountId);
    this.logger.log(`Session started for account ${accountId}`);
  }

  // ── Account lifecycle ops ─────────────────────────────────────────────────

  async restart(accountId: string): Promise<void> {
    await this.wahaClient.restartSession(accountId);
    await this.setStatus(accountId, SessionStatus.reconnecting);
  }

  async removeAccount(accountId: string): Promise<void> {
    await this.wahaClient.deleteSession(accountId).catch(() => undefined);
    await this.prisma.whatsappAccount.delete({ where: { id: accountId } });
    this.events.emitToAccount(accountId, 'wa:status', { accountId, status: 'disconnected', deleted: true });
  }

  async requestPairingCode(accountId: string): Promise<string> {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    const digits = (account.phoneNumber ?? '').replace(/\D/g, '');
    if (!digits) throw new Error('Account has no phone number configured');

    const code = await this.wahaClient.requestPairingCode(accountId, digits);
    this.events.emitToAccount(accountId, 'wa:pairing-code', { accountId, code });
    return code;
  }

  async getQr(accountId: string): Promise<{ qr: string | null; status: string }> {
    const [status, qr] = await Promise.all([
      this.wahaClient.getSessionStatus(accountId).catch(() => ({ status: 'unknown' })),
      this.wahaClient.getQr(accountId).catch(() => null),
    ]);
    return { qr, status: status.status };
  }

  /** Returns true when WAHA reports the session as WORKING/connected. */
  async isConnected(accountId: string): Promise<boolean> {
    const status = await this.wahaClient.getSessionStatus(accountId).catch(() => ({ status: 'unknown' }));
    return status.status === 'WORKING';
  }

  async getMetadata(accountId: string): Promise<{ phoneNumber: string | null; suggestedName: string | null }> {
    const me = await this.wahaClient.getMe(accountId);
    if (!me) return { phoneNumber: null, suggestedName: null };
    return {
      phoneNumber: me.id.replace(/@.*/, ''),
      suggestedName: me.pushName ?? null,
    };
  }

  async getHealth(accountId: string): Promise<{ accountId: string; status: string }> {
    const status = await this.wahaClient.getSessionStatus(accountId).catch(() => ({ status: 'unknown' }));
    return { accountId, status: status.status };
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

  /**
   * Update an account's editable settings.
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

  // ── Facade send methods → WahaClientService ───────────────────────────────

  async sendText(
    accountId: string,
    phone: string,
    text: string,
    _quoted?: { externalId: string; content: string | null; fromMe: boolean },
  ): Promise<string | null> {
    await this.rateLimiter.throttle(accountId);
    return this.wahaClient.sendText(accountId, phoneToJid(phone), text);
  }

  async sendMedia(
    accountId: string,
    phone: string,
    mediaType: string,
    url: string,
    caption?: string,
  ): Promise<string | null> {
    await this.rateLimiter.throttle(accountId);
    const jid = phoneToJid(phone);
    if (mediaType === 'image') return this.wahaClient.sendImage(accountId, jid, url, caption);
    if (mediaType === 'video') return this.wahaClient.sendVideo(accountId, jid, url, caption);
    if (mediaType === 'audio') return this.wahaClient.sendVoice(accountId, jid, url);
    return this.wahaClient.sendFile(accountId, jid, url, caption ?? '');
  }

  async sendMediaBuffer(
    accountId: string,
    _phone: string,
    _mediaType: string,
    _buffer: Buffer,
    _mimetype: string,
    _caption?: string,
    _fileName?: string,
  ): Promise<string | null> {
    // WAHA does not support binary buffer uploads — callers should upload to
    // storage and use sendMedia(url) instead.
    this.logger.warn(`sendMediaBuffer called for account ${accountId}: not supported by WAHA; use sendMedia with a URL`);
    return null;
  }

  async sendLocation(
    accountId: string,
    phone: string,
    latitude: number,
    longitude: number,
    name?: string,
  ): Promise<string | null> {
    await this.rateLimiter.throttle(accountId);
    return this.wahaClient.sendLocation(accountId, phoneToJid(phone), latitude, longitude, name);
  }

  async sendPoll(
    accountId: string,
    phone: string,
    question: string,
    options: string[],
    selectableCount?: number,
  ): Promise<string | null> {
    await this.rateLimiter.throttle(accountId);
    return this.wahaClient.sendPoll(accountId, phoneToJid(phone), question, options, selectableCount);
  }

  async sendContacts(
    accountId: string,
    phone: string,
    contacts: { name: string; phone: string }[],
  ): Promise<string | null> {
    await this.rateLimiter.throttle(accountId);
    return this.wahaClient.sendContact(accountId, phoneToJid(phone), contacts);
  }

  async sendReaction(
    accountId: string,
    _phone: string,
    externalId: string,
    emoji: string,
    _fromMe = false,
  ): Promise<void> {
    await this.wahaClient.setReaction(accountId, externalId, emoji);
  }

  async editMessage(
    accountId: string,
    _phone: string,
    _externalId: string,
    _newText: string,
  ): Promise<void> {
    // WAHA does not expose a message-edit endpoint; log and no-op.
    this.logger.warn(`editMessage called for account ${accountId}: not supported by WAHA`);
  }

  async deleteMessage(
    accountId: string,
    phone: string,
    externalId: string,
    _fromMe: boolean,
  ): Promise<void> {
    await this.wahaClient.deleteMessage(accountId, phoneToJid(phone), externalId);
  }

  async forwardMessage(
    accountId: string,
    toPhone: string,
    messageId: string,
  ): Promise<string | null> {
    await this.rateLimiter.throttle(accountId);
    return this.wahaClient.forwardMessage(accountId, phoneToJid(toPhone), messageId);
  }

  async setContactBlocked(accountId: string, phone: string, blocked: boolean): Promise<void> {
    await this.wahaClient.setContactBlocked(accountId, phoneToJid(phone), blocked);
  }

  async setChatMuted(accountId: string, phone: string, muted: boolean): Promise<void> {
    await this.wahaClient.setMuted(accountId, phoneToJid(phone), muted);
  }

  async setChatArchived(accountId: string, phone: string, archived: boolean): Promise<void> {
    await this.wahaClient.setArchived(accountId, phoneToJid(phone), archived);
  }

  async setChatPinned(accountId: string, phone: string, pinned: boolean): Promise<void> {
    await this.wahaClient.setPinned(accountId, phoneToJid(phone), pinned);
  }

  async setMessageStarred(
    accountId: string,
    phone: string,
    externalId: string,
    _fromMe: boolean,
    starred: boolean,
  ): Promise<void> {
    await this.wahaClient.setStar(accountId, phoneToJid(phone), externalId, starred);
  }

  async setDisappearingMessages(
    accountId: string,
    phone: string,
    enabled: boolean,
    duration?: number,
  ): Promise<void> {
    await this.wahaClient.setDisappearing(accountId, phoneToJid(phone), enabled, duration);
  }

  async sendTyping(accountId: string, phone: string, typing: boolean): Promise<void> {
    const jid = phoneToJid(phone);
    if (typing) {
      await this.wahaClient.startTyping(accountId, jid);
    } else {
      await this.wahaClient.stopTyping(accountId, jid);
    }
  }

  async markRead(accountId: string, phone: string, externalIds: string[]): Promise<void> {
    const jid = phoneToJid(phone);
    for (const id of externalIds) {
      await this.wahaClient.sendSeen(accountId, jid, id).catch((err) =>
        this.logger.warn(`markRead sendSeen failed for ${id}: ${err}`),
      );
    }
  }

  async isOnWhatsApp(accountId: string, phone: string): Promise<boolean> {
    const result = await this.wahaClient.checkNumberStatus(accountId, phone).catch(() => ({ numberExists: false }));
    return result.numberExists;
  }

  async fetchAvatar(accountId: string, phone: string): Promise<string | null> {
    return this.wahaClient.getContactAvatar(accountId, phoneToJid(phone));
  }
}
