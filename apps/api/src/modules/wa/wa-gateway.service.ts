import { Injectable, NotFoundException } from '@nestjs/common';
import type { WASocket } from '@whiskeysockets/baileys';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WaSessionStore } from './wa-session.store';
import { WaRateLimiter } from './wa-rate-limiter';
import { humanDelay, typingDelay, jidToPhone } from './wa.util';

export interface GroupInfoLike {
  id: string;
  subject?: string;
  owner?: string;
  desc?: string;
  participants?: Array<{ id: string; admin?: string | null }>;
}

/**
 * All outbound WhatsApp operations + read ops, backed by live Baileys sockets
 * from WaSessionStore. Replaces the WAHA REST client. Never owns the session
 * lifecycle (that is WaService) and never writes the message DB on send
 * (callers persist results) — but reads chat history from our own Postgres,
 * since modern Baileys has no built-in message store.
 *
 * Every send throttles through WaRateLimiter (single anti-ban chokepoint),
 * so callers must NOT pre-throttle.
 */
@Injectable()
export class WaGatewayService {
  /** Ephemeral label cache: accountId → Map<labelId, label> */
  private readonly labelStore = new Map<string, Map<string, { id: string; name: string; color: number }>>();

  constructor(
    private readonly store: WaSessionStore,
    private readonly rateLimiter: WaRateLimiter,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private sock(accountId: string): WASocket {
    const sock = this.store.getSock(accountId);
    if (!sock) throw new NotFoundException(`Account ${accountId} is not connected`);
    return sock;
  }

  private async humanDelay(): Promise<void> {
    const wa = await this.settings.wa();
    return humanDelay(wa.humanDelayMinMs, wa.humanDelayMaxMs);
  }

  private async typingDelay(text: string): Promise<void> {
    const wa = await this.settings.wa();
    return typingDelay(text, wa.typingPerCharMs, wa.typingMinMs, wa.typingMaxMs);
  }

  // ── Sends ──────────────────────────────────────────────────────────────────

  async sendText(
    accountId: string,
    chatId: string,
    text: string,
    quoted?: { externalId: string; content: string | null; fromMe: boolean },
  ): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    try {
      await sock.presenceSubscribe(chatId);
      await sock.sendPresenceUpdate('composing', chatId);
    } catch { /* presence is best-effort */ }
    await this.typingDelay(text);
    try { await sock.sendPresenceUpdate('paused', chatId); } catch { /* best-effort */ }
    const options = quoted
      ? { quoted: { key: { remoteJid: chatId, id: quoted.externalId, fromMe: quoted.fromMe }, message: { conversation: quoted.content ?? '' } } }
      : undefined;
    const sent = await sock.sendMessage(chatId, { text }, options as never);
    return sent?.key.id ?? null;
  }

  async sendImage(accountId: string, chatId: string, url: string, caption?: string): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, { image: { url }, caption: caption ?? '' });
    return sent?.key.id ?? null;
  }

  async sendVideo(accountId: string, chatId: string, url: string, caption?: string): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, { video: { url }, caption: caption ?? '' });
    return sent?.key.id ?? null;
  }

  async sendVoice(accountId: string, chatId: string, url: string): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, { audio: { url }, mimetype: 'audio/mp4', ptt: true });
    return sent?.key.id ?? null;
  }

  async sendFile(accountId: string, chatId: string, url: string, filename: string): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, {
      document: { url },
      mimetype: 'application/octet-stream',
      fileName: filename || 'file',
    });
    return sent?.key.id ?? null;
  }

  async sendLocation(accountId: string, chatId: string, latitude: number, longitude: number, name?: string): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude, name },
    });
    return sent?.key.id ?? null;
  }

  async sendPoll(accountId: string, chatId: string, question: string, options: string[], selectableCount = 1): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, {
      poll: { name: question, values: options, selectableCount },
    });
    return sent?.key.id ?? null;
  }

  async sendContact(accountId: string, chatId: string, contacts: Array<{ name: string; phone: string }>): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const contactCards = contacts.map((c) => {
      const digits = c.phone.replace(/[^\d]/g, '');
      return {
        displayName: c.name,
        vcard: ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.name}`, `TEL;type=CELL;type=VOICE;waid=${digits}:${c.phone}`, 'END:VCARD'].join('\n'),
      };
    });
    const sent = await sock.sendMessage(chatId, {
      contacts: { displayName: contacts.length === 1 ? contacts[0].name : `${contacts.length} contacts`, contacts: contactCards },
    });
    return sent?.key.id ?? null;
  }

  async sendMediaBuffer(
    accountId: string,
    chatId: string,
    mediaType: 'image' | 'document' | 'audio' | 'video' | 'sticker',
    buffer: Buffer,
    mimetype: string,
    caption?: string,
    fileName?: string,
    viewOnce = false,
  ): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    let content: Record<string, unknown>;
    if (mediaType === 'image') content = { image: buffer, caption: caption ?? '', viewOnce };
    else if (mediaType === 'document') content = { document: buffer, mimetype: mimetype || 'application/octet-stream', fileName: fileName ?? caption ?? 'file' };
    else if (mediaType === 'audio') content = { audio: buffer, mimetype: mimetype || 'audio/mp4', ptt: true };
    else if (mediaType === 'sticker') content = { sticker: await this.toStickerWebp(buffer) };
    else content = { video: buffer, caption: caption ?? '', viewOnce };
    const sent = await sock.sendMessage(chatId, content as never);
    return sent?.key.id ?? null;
  }

  /** WhatsApp stickers must be webp, square-padded. Baileys does not convert for us. */
  private async toStickerWebp(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp()
      .toBuffer();
  }

  // ── Message ops ─────────────────────────────────────────────────────────────

  async setReaction(accountId: string, chatId: string, messageId: string, reaction: string, fromMe = false): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendMessage(chatId, { react: { text: reaction, key: { remoteJid: chatId, id: messageId, fromMe } } });
  }

  async setStar(accountId: string, chatId: string, messageId: string, star: boolean): Promise<void> {
    const sock = this.sock(accountId);
    await sock.chatModify({ star: { messages: [{ id: messageId, fromMe: true }], star } }, chatId);
  }

  async editMessage(accountId: string, chatId: string, messageId: string, text: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendMessage(chatId, { text, edit: { remoteJid: chatId, id: messageId, fromMe: true } });
  }

  async deleteMessage(accountId: string, chatId: string, messageId: string, fromMe: boolean): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendMessage(chatId, { delete: { remoteJid: chatId, id: messageId, fromMe } });
  }

  /** Baileys cannot forward by id alone — re-send the original content from our DB. */
  async forwardMessage(accountId: string, chatId: string, messageId: string): Promise<string | null> {
    const original = await this.prisma.message.findFirst({
      where: { externalId: messageId },
      select: { content: true, mediaUrl: true, messageType: true },
    });
    if (!original) return null;
    if (original.mediaUrl) {
      const caption = original.content ?? undefined;
      switch (original.messageType) {
        case 'image': return this.sendImage(accountId, chatId, original.mediaUrl, caption);
        case 'video': return this.sendVideo(accountId, chatId, original.mediaUrl, caption);
        case 'audio': return this.sendVoice(accountId, chatId, original.mediaUrl);
        default: return this.sendFile(accountId, chatId, original.mediaUrl, 'forwarded');
      }
    }
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, {
      text: original.content ?? '',
      contextInfo: { forwardingScore: 1, isForwarded: true },
    } as never);
    return sent?.key.id ?? null;
  }

  async sendSeen(accountId: string, chatId: string, messageId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.readMessages([{ remoteJid: chatId, id: messageId, fromMe: false }]);
  }

  async startTyping(accountId: string, chatId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.presenceSubscribe(chatId).catch(() => undefined);
    await sock.sendPresenceUpdate('composing', chatId);
  }

  async stopTyping(accountId: string, chatId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendPresenceUpdate('paused', chatId);
  }

  async sendButtons(
    accountId: string,
    chatId: string,
    text: string,
    footer: string,
    buttons: Array<{ id: string; text: string }>,
  ): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, {
      buttons: buttons.map((b, i) => ({ buttonId: b.id || String(i), buttonText: { displayText: b.text }, type: 1 })),
      text,
      footer,
      headerType: 1,
    } as any);
    return sent?.key.id ?? null;
  }

  async sendListMessage(
    accountId: string,
    chatId: string,
    title: string,
    text: string,
    footer: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  ): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, {
      listMessage: { title, description: text, footerText: footer, buttonText, listType: 1, sections },
    } as any);
    return sent?.key.id ?? null;
  }

  async pinMessage(accountId: string, chatId: string, messageId: string, unpin?: boolean): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendMessage(chatId, {
      pin: { key: { remoteJid: chatId, id: messageId }, type: unpin ? 2 : 1, time: 86400 },
    } as any);
  }

  async editMediaCaption(
    accountId: string,
    chatId: string,
    messageId: string,
    mediaType: 'image' | 'video' | 'document',
    caption: string,
  ): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendMessage(chatId, {
      edit: { remoteJid: chatId, id: messageId, fromMe: true },
      [`${mediaType}Message`]: { caption },
    } as any);
  }

  // ── Chat state ──────────────────────────────────────────────────────────────

  async setArchived(accountId: string, chatId: string, archived: boolean): Promise<void> {
    const sock = this.sock(accountId);
    await sock.chatModify({ archive: archived, lastMessages: [] }, chatId);
  }

  async setDisappearing(accountId: string, chatId: string, enabled: boolean, durationSeconds = 7 * 24 * 60 * 60): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendMessage(chatId, { disappearingMessagesInChat: enabled ? durationSeconds : false });
  }

  async markChatUnread(accountId: string, chatId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.chatModify({ markRead: false, lastMessages: [] }, chatId).catch(() => undefined);
  }

  async clearChat(accountId: string, chatId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.chatModify({ clear: 'all' } as never, chatId).catch(() => undefined);
  }

  async deleteChat(accountId: string, chatId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.chatModify({ delete: true, lastMessages: [] }, chatId).catch(() => undefined);
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  async addOrEditContact(accountId: string, phone: string, fullName: string, firstName?: string): Promise<void> {
    const sock = this.sock(accountId);
    const digits = phone.replace(/\D/g, '');
    const jid = `${digits}@s.whatsapp.net`;
    await (sock as any).addOrEditContact(jid, {
      fullName,
      firstName: firstName ?? fullName.split(' ')[0],
      saveOnPrimaryAddressbook: true,
    });
  }

  async sendWithLinkPreview(
    accountId: string,
    chatId: string,
    text: string,
    linkPreview: { url: string; title: string; description?: string; thumbnailBase64?: string },
  ): Promise<string | null> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await this.humanDelay();
    const sent = await sock.sendMessage(chatId, {
      text,
      linkPreview: {
        matchedText: linkPreview.url,
        canonicalUrl: linkPreview.url,
        title: linkPreview.title,
        description: linkPreview.description ?? '',
        jpegThumbnail: linkPreview.thumbnailBase64
          ? Buffer.from(linkPreview.thumbnailBase64, 'base64')
          : undefined,
      } as any,
    } as any);
    return sent?.key.id ?? null;
  }

  async checkNumberStatus(accountId: string, phone: string): Promise<{ numberExists: boolean; chatId?: string }> {
    const sock = this.sock(accountId);
    const digits = phone.replace(/\D/g, '');
    const results = await sock.onWhatsApp(`${digits}@s.whatsapp.net`).catch(() => undefined);
    const hit = results?.[0];
    return { numberExists: Boolean(hit?.exists), chatId: hit?.jid };
  }

  async getContactAvatar(accountId: string, contactId: string): Promise<string | null> {
    const sock = this.store.getSock(accountId);
    if (!sock) return null;
    try {
      return (await sock.profilePictureUrl(contactId, 'image')) ?? null;
    } catch {
      return null;
    }
  }

  async setContactBlocked(accountId: string, contactId: string, blocked: boolean): Promise<void> {
    const sock = this.sock(accountId);
    await sock.updateBlockStatus(contactId, blocked ? 'block' : 'unblock');
  }

  async getBlockedContacts(accountId: string): Promise<string[]> {
    const sock = this.sock(accountId);
    const list = await (sock as any).fetchBlocklist();
    return (list as (string | undefined)[]).filter((jid): jid is string => Boolean(jid));
  }

  // ── Groups ──────────────────────────────────────────────────────────────────

  async getGroupInfo(accountId: string, groupId: string): Promise<GroupInfoLike | null> {
    const sock = this.store.getSock(accountId);
    if (!sock) return null;
    try {
      const md = await sock.groupMetadata(groupId);
      return {
        id: md.id,
        subject: md.subject,
        owner: md.owner ?? undefined,
        desc: md.desc ?? undefined,
        participants: md.participants?.map((p) => ({ id: p.id, admin: p.admin ?? null })),
      };
    } catch {
      return null;
    }
  }

  async createGroup(accountId: string, name: string, participantIds: string[]): Promise<{ id: string }> {
    const sock = this.sock(accountId);
    const md = await sock.groupCreate(name, participantIds);
    return { id: md.id };
  }

  async joinGroup(accountId: string, code: string): Promise<{ id?: string }> {
    const sock = this.sock(accountId);
    const id = await sock.groupAcceptInvite(code.replace(/^https?:\/\/chat\.whatsapp\.com\//, ''));
    return { id: id ?? undefined };
  }

  async leaveGroup(accountId: string, groupId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.groupLeave(groupId);
  }

  async getGroupInviteCode(accountId: string, groupId: string): Promise<string> {
    const sock = this.sock(accountId);
    return (await sock.groupInviteCode(groupId)) ?? '';
  }

  async addGroupParticipants(accountId: string, groupId: string, ids: string[]): Promise<void> {
    const sock = this.sock(accountId);
    await sock.groupParticipantsUpdate(groupId, ids, 'add');
  }

  async removeGroupParticipants(accountId: string, groupId: string, ids: string[]): Promise<void> {
    const sock = this.sock(accountId);
    await sock.groupParticipantsUpdate(groupId, ids, 'remove');
  }

  async promoteGroupAdmins(accountId: string, groupId: string, ids: string[]): Promise<void> {
    const sock = this.sock(accountId);
    await sock.groupParticipantsUpdate(groupId, ids, 'promote');
  }

  async demoteGroupAdmins(accountId: string, groupId: string, ids: string[]): Promise<void> {
    const sock = this.sock(accountId);
    await sock.groupParticipantsUpdate(groupId, ids, 'demote');
  }

  async setGroupSubject(accountId: string, groupId: string, subject: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.groupUpdateSubject(groupId, subject);
  }

  async setGroupDescription(accountId: string, groupId: string, description: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.groupUpdateDescription(groupId, description);
  }

  async revokeGroupInvite(accountId: string, groupId: string): Promise<string> {
    const sock = this.sock(accountId);
    return (await (sock as any).groupRevokeInvite(groupId)) ?? '';
  }

  async setGroupSettings(
    accountId: string,
    groupId: string,
    setting: 'locked' | 'unlocked' | 'announcement' | 'not_announcement',
  ): Promise<void> {
    const sock = this.sock(accountId);
    await (sock as any).groupSettingUpdate(groupId, setting);
  }

  async getAllGroups(accountId: string): Promise<Array<{ id: string; subject?: string; participantCount: number }>> {
    const sock = this.sock(accountId);
    const groups = await (sock as any).groupFetchAllParticipating();
    return Object.values(groups as Record<string, any>).map((g) => ({
      id: g.id,
      subject: g.subject,
      participantCount: g.participants?.length ?? 0,
    }));
  }

  async getGroupMetadata(accountId: string, groupId: string): Promise<unknown> {
    const sock = this.sock(accountId);
    return sock.groupMetadata(groupId);
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  setLabelsCache(accountId: string, labels: Array<{ id: string; name: string; color: number }>): void {
    const map = new Map<string, { id: string; name: string; color: number }>();
    for (const l of labels) map.set(l.id, l);
    this.labelStore.set(accountId, map);
  }

  getLabels(accountId: string): Array<{ id: string; name: string; color: number }> {
    return Array.from(this.labelStore.get(accountId)?.values() ?? []);
  }

  async addChatLabel(accountId: string, chatId: string, labelId: string): Promise<void> {
    const sock = this.sock(accountId);
    await (sock as any).chatModify({ addLabel: labelId, lastMessages: [] }, chatId);
  }

  async removeChatLabel(accountId: string, chatId: string, labelId: string): Promise<void> {
    const sock = this.sock(accountId);
    await (sock as any).chatModify({ removeLabel: labelId, lastMessages: [] }, chatId);
  }

  // ── Own profile ───────────────────────────────────────────────────────────

  async getMe(accountId: string): Promise<{ id: string; pushName: string } | null> {
    const sock = this.store.getSock(accountId);
    const user = sock?.user;
    if (!user?.id) return null;
    return { id: user.id, pushName: user.name ?? user.verifiedName ?? '' };
  }

  async getProfile(accountId: string): Promise<{ id?: string; name?: string; status?: string; picture?: string } | null> {
    const sock = this.store.getSock(accountId);
    if (!sock?.user?.id) return null;
    const id = sock.user.id;
    const [status, picture] = await Promise.all([
      sock.fetchStatus(id).then((s) => {
        const first = Array.isArray(s) ? s[0] : s;
        return (first as { status?: { status?: string } | string } | undefined)?.status as string | undefined;
      }).catch(() => undefined),
      sock.profilePictureUrl(id, 'image').catch(() => undefined),
    ]);
    return { id, name: sock.user.name ?? undefined, status: status ?? undefined, picture: picture ?? undefined };
  }

  async setProfileName(accountId: string, name: string): Promise<void> {
    await this.sock(accountId).updateProfileName(name);
  }

  async setProfileStatus(accountId: string, status: string): Promise<void> {
    await this.sock(accountId).updateProfileStatus(status);
  }

  async setProfilePicture(accountId: string, url: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.updateProfilePicture(sock.user!.id, { url });
  }

  async deleteProfilePicture(accountId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.removeProfilePicture(sock.user!.id);
  }

  // ── Presence ────────────────────────────────────────────────────────────────

  async setPresence(accountId: string, presence: 'online' | 'offline'): Promise<void> {
    await this.sock(accountId).sendPresenceUpdate(presence === 'online' ? 'available' : 'unavailable');
  }

  async getPresence(_accountId: string, _chatId: string): Promise<unknown> {
    // Baileys exposes presence only via the presence.update event (pushed to the
    // socket gateway), not a getter. Return empty; live typing comes through
    // wa:presence events instead.
    return {};
  }

  async subscribePresence(accountId: string, chatId: string): Promise<void> {
    await this.sock(accountId).presenceSubscribe(chatId);
  }

  // ── Chat reads (served from our Postgres — Baileys has no message store) ─────

  async getChatsOverview(accountId: string, limit = 20, offset = 0): Promise<unknown[]> {
    const convos = await this.prisma.conversation.findMany({
      where: { whatsappAccountId: accountId },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      skip: offset,
      include: { customer: { select: { phoneNumber: true, name: true, avatarUrl: true } } },
    });
    return convos.map((c) => ({
      id: c.customer?.phoneNumber ? `${c.customer.phoneNumber}@s.whatsapp.net` : c.id,
      name: c.customer?.name ?? c.customer?.phoneNumber ?? null,
      picture: c.customer?.avatarUrl ?? null,
      lastMessage: c.lastMessage ?? null,
      timestamp: c.lastMessageAt ? Math.floor(c.lastMessageAt.getTime() / 1000) : null,
      unreadCount: c.unreadCount ?? 0,
    }));
  }

  async getChatMessages(accountId: string, chatId: string, limit = 50, offset = 0): Promise<unknown[]> {
    const phone = jidToPhone(chatId);
    const convo = await this.prisma.conversation.findFirst({
      where: { whatsappAccountId: accountId, customer: { phoneNumber: phone } },
      select: { id: true },
    });
    if (!convo) return [];
    const messages = await this.prisma.message.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return messages.map((m) => ({
      id: m.externalId ?? m.id,
      body: m.content ?? '',
      fromMe: m.senderType !== 'customer',
      timestamp: Math.floor(m.createdAt.getTime() / 1000),
      type: m.messageType,
      mediaUrl: m.mediaUrl ?? null,
    }));
  }

  // ── Channels (Newsletters) ────────────────────────────────────────────────

  // ponytail: Baileys has no bulk "list subscribed newsletters" call, only
  // per-jid newsletterMetadata — so membership is mirrored locally in
  // wa_channels (written by createChannel/followChannel/deleteChannel) and
  // read back here instead of asking Baileys to enumerate.
  async listChannels(accountId: string): Promise<unknown[]> {
    return this.prisma.waChannel.findMany({
      where: { whatsappAccountId: accountId, isFollowing: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createChannel(accountId: string, name: string, description?: string): Promise<unknown> {
    const sock = this.sock(accountId);
    const created = await (sock as any).newsletterCreate(name, { description: description ?? '' });
    await this.upsertChannel(accountId, created.id, name, description, true);
    return created;
  }

  async getChannelMetadata(accountId: string, channelId: string): Promise<unknown> {
    const sock = this.sock(accountId);
    return (sock as any).newsletterMetadata('invite', channelId);
  }

  async deleteChannel(accountId: string, channelId: string): Promise<void> {
    const sock = this.sock(accountId);
    await (sock as any).newsletterDelete(channelId);
    await this.prisma.waChannel.deleteMany({ where: { whatsappAccountId: accountId, channelId } });
  }

  async followChannel(accountId: string, channelId: string, follow: boolean): Promise<void> {
    const sock = this.sock(accountId);
    if (follow) {
      await (sock as any).newsletterFollow(channelId);
      await this.upsertChannel(accountId, channelId, undefined, undefined, true);
    } else {
      await (sock as any).newsletterUnfollow(channelId);
      await this.prisma.waChannel.updateMany({
        where: { whatsappAccountId: accountId, channelId },
        data: { isFollowing: false },
      });
    }
  }

  private async upsertChannel(
    accountId: string,
    channelId: string,
    name?: string,
    description?: string,
    isFollowing = true,
  ): Promise<void> {
    await this.prisma.waChannel.upsert({
      where: { whatsappAccountId_channelId: { whatsappAccountId: accountId, channelId } },
      create: { whatsappAccountId: accountId, channelId, name, description, isFollowing },
      update: { isFollowing, ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}) },
    });
  }

  async muteChannel(accountId: string, channelId: string, mute: boolean): Promise<void> {
    const sock = this.sock(accountId);
    if (mute) {
      await (sock as any).newsletterMute(channelId);
    } else {
      await (sock as any).newsletterUnmute(channelId);
    }
  }

  /** Baileys' only channel-analytics surface: current subscriber count. */
  async getChannelSubscribers(accountId: string, channelId: string): Promise<{ subscribers: number }> {
    const sock = this.sock(accountId);
    return (sock as any).newsletterSubscribers(channelId);
  }

  async reactToNewsletterMessage(accountId: string, channelId: string, serverId: string, reaction: string): Promise<void> {
    const sock = this.sock(accountId);
    await (sock as any).newsletterReactMessage(channelId, serverId, reaction);
  }

  // ── Status / Stories ──────────────────────────────────────────────────────

  async sendTextStatus(accountId: string, text: string, backgroundColor?: string, targetJids?: string[]): Promise<void> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await sock.sendMessage(
      'status@broadcast',
      { text, backgroundColor: backgroundColor ?? '#000000' } as any,
      { statusJidList: targetJids ?? [] } as any,
    );
  }

  async sendImageStatus(accountId: string, imageBuffer: Buffer, caption?: string, targetJids?: string[]): Promise<void> {
    const sock = this.sock(accountId);
    await this.rateLimiter.throttle(accountId);
    await sock.sendMessage(
      'status@broadcast',
      { image: imageBuffer, caption: caption ?? '' },
      { statusJidList: targetJids ?? [] } as any,
    );
  }

  async deleteStatus(accountId: string, messageId: string): Promise<void> {
    const sock = this.sock(accountId);
    const statusKey = { remoteJid: 'status@broadcast', id: messageId, fromMe: true };
    await sock.sendMessage('status@broadcast', { delete: statusKey } as any);
  }

  // ── Recording presence ────────────────────────────────────────────────────

  async startRecording(accountId: string, chatId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.presenceSubscribe(chatId).catch(() => undefined);
    await sock.sendPresenceUpdate('recording', chatId);
  }

  async stopRecording(accountId: string, chatId: string): Promise<void> {
    const sock = this.sock(accountId);
    await sock.sendPresenceUpdate('paused', chatId);
  }

  // ── Session auth ──────────────────────────────────────────────────────────

  async logoutSession(accountId: string): Promise<void> {
    const sock = this.store.getSock(accountId);
    if (sock) await sock.logout().catch(() => undefined);
  }
}
