import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { phoneToJid } from './wa.util';
import { WaSessionStore } from './wa-session.store';
import { SettingsService } from '../settings/settings.service';
import { humanDelay, typingDelay } from './wa.util';

/**
 * All outbound WhatsApp operations: send, react, edit, delete, chat-state
 * changes, and contact checks. Never writes to the database — callers are
 * responsible for persisting the result.
 */
@Injectable()
export class WaSendService {
  private readonly logger = new Logger(WaSendService.name);
  private static readonly MAX_SENDS_PER_MINUTE = 20;

  /**
   * Per-account serialization chain for slot reservation. Concurrent sends to
   * the same account must reserve their rate-limit slot one at a time, otherwise
   * they all read `stamps.length < limit` together and burst past the cap
   * (anti-ban hazard). Each account's chain links reservations serially.
   */
  private readonly throttleChains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: WaSessionStore,
    private readonly settings: SettingsService,
  ) {}

  private async humanDelay(): Promise<void> {
    const wa = await this.settings.wa();
    return humanDelay(wa.humanDelayMinMs, wa.humanDelayMaxMs);
  }

  private async typingDelay(text: string): Promise<void> {
    const wa = await this.settings.wa();
    return typingDelay(text, wa.typingPerCharMs, wa.typingMinMs, wa.typingMaxMs);
  }

  private async throttleSend(accountId: string): Promise<void> {
    // Serialize reservation per account so concurrent sends can't all observe a
    // sub-limit count and burst together. The chain tail is wrapped so a failed
    // reservation never breaks the chain for subsequent sends.
    const prev = this.throttleChains.get(accountId) ?? Promise.resolve();
    const run = prev.then(() => this.reserveSlot(accountId));
    this.throttleChains.set(accountId, run.catch(() => undefined));
    await run;
  }

  private async reserveSlot(accountId: string): Promise<void> {
    const limit = WaSendService.MAX_SENDS_PER_MINUTE;
    const windowMs = 60_000;
    let stamps = (this.store.sendTimestamps.get(accountId) ?? []).filter((t) => t > Date.now() - windowMs);

    if (stamps.length >= limit) {
      // Wait until enough of the oldest stamps expire to drop below the limit.
      // stamps is ascending; the stamp at index (length - limit) must age out of
      // the window before a fresh slot is available.
      const mustExpire = stamps[stamps.length - limit];
      const wait = mustExpire + windowMs - Date.now();
      if (wait > 0) {
        this.logger.warn(`Throttling account ${accountId}: waiting ${wait}ms (rate limit)`);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      stamps = (this.store.sendTimestamps.get(accountId) ?? []).filter((t) => t > Date.now() - windowMs);
    }

    stamps.push(Date.now());
    this.store.sendTimestamps.set(accountId, stamps);
  }

  async sendText(
    accountId: string,
    phone: string,
    text: string,
    quoted?: { externalId: string; content: string | null; fromMe: boolean },
  ): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);

    await this.throttleSend(accountId);
    try {
      await session.sock.presenceSubscribe(jid);
      await session.sock.sendPresenceUpdate('composing', jid);
    } catch { /* presence is best-effort */ }
    await this.typingDelay(text);
    try {
      await session.sock.sendPresenceUpdate('paused', jid);
    } catch { /* presence is best-effort */ }

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

  async sendMedia(
    accountId: string,
    phone: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    url: string,
    caption?: string,
  ): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();

    let content: Record<string, unknown>;
    if (mediaType === 'image') content = { image: { url }, caption: caption ?? '' };
    else if (mediaType === 'document') content = { document: { url }, mimetype: 'application/octet-stream', fileName: caption ?? 'file' };
    else if (mediaType === 'audio') content = { audio: { url }, mimetype: 'audio/mpeg' };
    else content = { video: { url }, caption: caption ?? '' };

    const sent = await session.sock.sendMessage(jid, content as never);
    return sent?.key.id ?? null;
  }

  async sendMediaBuffer(
    accountId: string,
    phone: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    buffer: Buffer,
    mimetype: string,
    caption?: string,
    fileName?: string,
  ): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();

    let content: Record<string, unknown>;
    if (mediaType === 'image') content = { image: buffer, caption: caption ?? '' };
    else if (mediaType === 'document') content = { document: buffer, mimetype: mimetype || 'application/octet-stream', fileName: fileName ?? caption ?? 'file' };
    else if (mediaType === 'audio') content = { audio: buffer, mimetype: mimetype || 'audio/mpeg' };
    else content = { video: buffer, caption: caption ?? '' };

    if (mediaType === 'audio') (content as { ptt?: boolean }).ptt = true;

    const sent = await session.sock.sendMessage(jid, content as never);
    return sent?.key.id ?? null;
  }

  async sendLocation(
    accountId: string,
    phone: string,
    latitude: number,
    longitude: number,
    name?: string,
  ): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const sent = await session.sock.sendMessage(jid, { location: { degreesLatitude: latitude, degreesLongitude: longitude, name } } as never);
    return sent?.key.id ?? null;
  }

  async sendPoll(
    accountId: string,
    phone: string,
    question: string,
    options: string[],
    selectableCount = 1,
  ): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const sent = await session.sock.sendMessage(jid, { poll: { name: question, values: options, selectableCount } } as never);
    return sent?.key.id ?? null;
  }

  async sendContacts(
    accountId: string,
    phone: string,
    contacts: { name: string; phone: string }[],
  ): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const contactCards = contacts.map((c) => {
      const digits = c.phone.replace(/[^\d]/g, '');
      return {
        displayName: c.name,
        vcard: ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.name}`, `TEL;type=CELL;type=VOICE;waid=${digits}:${c.phone}`, 'END:VCARD'].join('\n'),
      };
    });
    const sent = await session.sock.sendMessage(jid, {
      contacts: { displayName: contacts.length === 1 ? contacts[0].name : `${contacts.length} contacts`, contacts: contactCards },
    } as never);
    return sent?.key.id ?? null;
  }

  async sendReaction(accountId: string, phone: string, externalId: string, emoji: string, fromMe = false): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    // `fromMe` must match the target message's authorship — reacting to a
    // message we sent needs fromMe:true, otherwise WhatsApp can't resolve the
    // message key and the reaction silently no-ops on the customer's device.
    await session.sock.sendMessage(jid, { react: { text: emoji, key: { remoteJid: jid, id: externalId, fromMe } } } as never);
  }

  async editMessage(accountId: string, phone: string, externalId: string, newText: string): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.sendMessage(jid, { text: newText, edit: { remoteJid: jid, id: externalId, fromMe: true } } as never);
  }

  async deleteMessage(accountId: string, phone: string, externalId: string, fromMe: boolean): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.sendMessage(jid, { delete: { remoteJid: jid, id: externalId, fromMe } } as never);
  }

  async forwardMessage(accountId: string, toPhone: string, text: string): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(toPhone);
    await this.throttleSend(accountId);
    await this.humanDelay();
    const sent = await session.sock.sendMessage(jid, { text, contextInfo: { forwardingScore: 1, isForwarded: true } } as never);
    return sent?.key.id ?? null;
  }

  async setContactBlocked(accountId: string, phone: string, blocked: boolean): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    await session.sock.updateBlockStatus(phoneToJid(phone), blocked ? 'block' : 'unblock');
  }

  async setChatMuted(accountId: string, phone: string, muted: boolean): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    const muteUntil = muted ? Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 : null;
    await session.sock.chatModify({ mute: muteUntil } as never, jid);
  }

  async setChatArchived(accountId: string, phone: string, archived: boolean): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    await session.sock.chatModify({ archive: archived, lastMessages: [] } as never, phoneToJid(phone));
  }

  async setChatPinned(accountId: string, phone: string, pinned: boolean): Promise<void> {
    const session = this.store.get(accountId);
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
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.chatModify({ star: { messages: [{ id: externalId, fromMe }], star: starred } } as never, jid);
  }

  async setDisappearingMessages(accountId: string, phone: string, enabled: boolean, duration = 7 * 24 * 60 * 60): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.sendMessage(jid, { disappearingMessagesInChat: enabled ? duration : false } as never);
  }

  async sendTyping(accountId: string, phone: string, typing: boolean): Promise<void> {
    const session = this.store.get(accountId);
    if (!session) throw new NotFoundException(`Account ${accountId} is not connected`);
    const jid = phoneToJid(phone);
    await session.sock.presenceSubscribe(jid).catch(() => undefined);
    await session.sock.sendPresenceUpdate(typing ? 'composing' : 'paused', jid);
  }

  async markRead(accountId: string, phone: string, externalIds: string[]): Promise<void> {
    const session = this.store.get(accountId);
    if (!session || externalIds.length === 0) return;
    const remoteJid = phoneToJid(phone);
    const keys = externalIds.map((id) => ({ remoteJid, id, fromMe: false }));
    try {
      await session.sock.readMessages(keys as never);
    } catch (err) {
      this.logger.warn(`markRead failed for ${remoteJid}: ${err}`);
    }
  }

  async isOnWhatsApp(accountId: string, phone: string): Promise<boolean> {
    const session = this.store.get(accountId);
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

  async fetchAvatar(accountId: string, phone: string): Promise<string | null> {
    const session = this.store.get(accountId);
    if (!session) return null;
    try {
      return (await session.sock.profilePictureUrl(phoneToJid(phone), 'image')) ?? null;
    } catch {
      return null;
    }
  }
}
