import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import {
  AiMode,
  MessageStatus,
  MessageType,
  SenderType,
  Prisma,
} from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { ContactSyncService } from './contact-sync.service';
import { WaGatewayService } from './wa-gateway.service';
import { jidToPhone, isGroupJid, isDirectChatJid } from './wa.util';

type LongLike = { toString(): string };

export type GroupMetadataLike = {
  id?: string;
  subject?: string | null;
  owner?: string | null;
  desc?: string | null;
  participants?: Array<{ id?: string; admin?: string | null }>;
};

/**
 * Pure DB-mirror operations: reflects WhatsApp events (edits, revokes,
 * reactions, receipts, group changes, chat state) into the local database
 * and emits live events to the dashboard. Never sends to WhatsApp.
 */
@Injectable()
export class WaMirrorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly contactSync: ContactSyncService,
    private readonly gateway: WaGatewayService,
  ) {}

  private longToNumber(value: number | LongLike | null | undefined): number | undefined {
    if (value === null || value === undefined) return undefined;
    const n = Number(typeof value === 'object' && 'toString' in value ? value.toString() : value);
    return Number.isFinite(n) ? n : undefined;
  }

  async conversationsForJid(accountId: string, jid: string) {
    if (isGroupJid(jid)) {
      const conversation = await this.ensureGroupConversation(accountId, { id: jid });
      return [{ id: conversation.id }];
    }
    if (!isDirectChatJid(jid)) return [];
    return this.prisma.conversation.findMany({
      where: {
        whatsappAccountId: accountId,
        customer: { phoneNumber: jidToPhone(jid), sourceAccountId: accountId },
      },
      select: { id: true },
    });
  }

  async ensureGroupConversation(accountId: string, group: GroupMetadataLike) {
    const jid = group.id;
    if (!jid || !isGroupJid(jid)) throw new Error(`Invalid group jid: ${jid}`);
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    const subject = group.subject ?? jid;
    const participants = (group.participants ?? [])
      .filter((p) => p.id)
      .map((p) => ({ jid: p.id, admin: p.admin ?? null }));

    const customerUpsertArgs = {
      where: { phoneNumber_sourceAccountId: { phoneNumber: jid, sourceAccountId: accountId } },
      update: { name: subject },
      create: {
        name: subject,
        phoneNumber: jid,
        sourceAccountId: accountId,
        assignedAdminId: account.assignedAdminId,
      },
    };
    let customer;
    try {
      customer = await this.prisma.customer.upsert(customerUpsertArgs);
    } catch (err) {
      // Same group can be touched by two concurrent history-sync/event paths
      // racing on this upsert; retry once now that the winner's row exists.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        customer = await this.prisma.customer.upsert(customerUpsertArgs);
      } else {
        throw err;
      }
    }

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

    let conversation;
    try {
      conversation = await this.prisma.conversation.create({ data });
    } catch (err) {
      // Two concurrent group-metadata events for the same group can both miss
      // the `existing` lookup above and race to create the conversation; the
      // loser re-reads what the winner created instead of throwing.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        conversation = await this.prisma.conversation.findUniqueOrThrow({
          where: { whatsappAccountId_chatJid: { whatsappAccountId: accountId, chatJid: jid } },
        });
      } else {
        throw err;
      }
    }
    this.events.emitToAccount(accountId, 'conversation:updated', {
      conversationId: conversation.id,
      isGroup: true,
      groupSubject: subject,
    });
    return conversation;
  }

  async applyGroupMetadata(
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

  async applyGroupParticipantUpdate(
    accountId: string,
    update: { id?: string; author?: string; participants?: string[]; action?: string },
  ) {
    if (!update.id || !isGroupJid(update.id)) return;
    let conversation = await this.ensureGroupConversation(accountId, { id: update.id });
    const metadata = await this.gateway.getGroupInfo(accountId, update.id);
    if (metadata) conversation = await this.ensureGroupConversation(accountId, metadata);
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
      { action: update.action ?? null, author: update.author ?? null, participants },
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
    this.events.emitToAccount(accountId, 'conversation:updated', { conversationId, lastMessage: content, lastMessageAt: message.createdAt });
  }

  async applyChatMirrorState(
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
      await this.prisma.conversation.update({ where: { id: conversation.id }, data: data as never });
      this.events.emitToAccount(accountId, 'conversation:updated', { conversationId: conversation.id, ...data });
    }
  }

  async applyBlocklist(accountId: string, blocklist: string[], blocked: boolean) {
    for (const jid of blocklist) {
      const conversations = await this.conversationsForJid(accountId, jid);
      for (const conversation of conversations) {
        await this.prisma.conversation.update({ where: { id: conversation.id }, data: { isBlocked: blocked } });
        this.events.emitToAccount(accountId, 'conversation:updated', { conversationId: conversation.id, isBlocked: blocked });
      }
    }
  }

  async applyEdit(accountId: string, externalId: string, newText: string) {
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

  async applyRevoke(accountId: string, externalId: string) {
    const message = await this.prisma.message.findFirst({
      where: { externalId, conversation: { whatsappAccountId: accountId } },
      select: { id: true, conversationId: true },
    });
    if (!message) return;
    await this.prisma.message.update({ where: { id: message.id }, data: { deletedAt: new Date() } });
    this.events.emitToAccount(accountId, 'message:deleted', { conversationId: message.conversationId, messageId: message.id });
  }

  async applyReaction(accountId: string, externalId: string, emoji: string, reactor: string) {
    const message = await this.prisma.message.findFirst({
      where: { externalId, conversation: { whatsappAccountId: accountId } },
      select: { id: true, conversationId: true, reactions: true },
    });
    if (!message) return;
    const map: Record<string, string[]> = (message.reactions as Record<string, string[]>) ?? {};
    for (const key of Object.keys(map)) {
      map[key] = (map[key] ?? []).filter((p) => p !== reactor);
      if (map[key].length === 0) delete map[key];
    }
    if (emoji) map[emoji] = [...(map[emoji] ?? []), reactor];
    const updated = await this.prisma.message.update({ where: { id: message.id }, data: { reactions: map as never } });
    this.events.emitToAccount(accountId, 'message:reaction', {
      conversationId: message.conversationId,
      messageId: message.id,
      reactions: updated.reactions,
    });
  }

  async applyReceipt(accountId: string, externalId: string, waStatus: number | string) {
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
    if (message.status === MessageStatus.read) return;
    await this.prisma.message.update({ where: { id: message.id }, data: { status } });
    this.events.emitToAccount(accountId, 'message:status', {
      conversationId: message.conversationId,
      messageId: message.id,
      status,
    });
  }

  async applyReceiptDetail(
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
    this.events.emitToAccount(accountId, 'message:updated', { conversationId: message.conversationId, message: updated });
  }

  async logCall(accountId: string, fromJid: string, isVideo: boolean) {
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

  // >>> ANGGA: dua penerus kosong (`syncContacts`, `resolveLidPhone`) dihapus
  // di sini. Keduanya cuma meneruskan ke ContactSyncService dan TIDAK dipanggil
  // siapa pun — `grep -rn "waMirror.syncContacts\|Mirror.*resolveLidPhone"` = 0.
  // Pintu kedua ke resolver @lid persis yang bikin aturannya gampang bercabang
  // diam-diam. Panggil ContactSyncService langsung.
}
