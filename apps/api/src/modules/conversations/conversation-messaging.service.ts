import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageStatus, MessageType, Prisma, SenderType } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { WaService } from '../wa/wa.service';
import { MediaStorageService } from '../media/media-storage.service';
import { extForMimetype } from '../wa/wa.util';
import { assertSafeMediaUrl } from '../../common/media-url.util';
import { logAudit } from '../../common/audit.util';

function mediaTypeForMime(mime: string): 'image' | 'document' | 'audio' | 'video' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

@Injectable()
export class ConversationMessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
    private readonly storage: MediaStorageService,
  ) {}

  private async conversationRoute(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: { select: { phoneNumber: true, name: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async messageWithRoute(conversationId: string, messageId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: { select: { phoneNumber: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!message) throw new NotFoundException('Message not found');
    return { conversation, message };
  }

  private async createAdminWaMessage(
    conversation: { id: string; whatsappAccountId: string },
    adminId: string,
    data: {
      content: string | null;
      messageType?: MessageType;
      mediaUrl?: string | null;
      externalId?: string | null;
      lastMessage?: string;
    },
  ) {
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.admin,
        senderId: adminId,
        messageType: data.messageType ?? MessageType.text,
        content: data.content,
        mediaUrl: data.mediaUrl ?? null,
        status: MessageStatus.sent,
        externalId: data.externalId ?? null,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessage: data.lastMessage ?? data.content,
        lastMessageAt: new Date(),
      },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', {
      conversationId: conversation.id,
      message,
    });
    return message;
  }

  async send(id: string, adminId: string, text: string, quotedMessageId?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    let quoted: { externalId: string; content: string | null; fromMe: boolean } | undefined;
    if (quotedMessageId) {
      const quotedMsg = await this.prisma.message.findFirst({
        where: { id: quotedMessageId, conversationId: id },
        select: { externalId: true, content: true, senderType: true },
      });
      if (!quotedMsg) throw new BadRequestException('Quoted message not found in this conversation');
      if (quotedMsg.externalId) {
        quoted = {
          externalId: quotedMsg.externalId,
          content: quotedMsg.content,
          fromMe: quotedMsg.senderType !== SenderType.customer,
        };
      }
    }

    const pendingMessage = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.admin,
        senderId: adminId,
        content: text,
        status: MessageStatus.pending,
        quotedMessageId: quotedMessageId ?? null,
      },
      include: {
        quotedMessage: { select: { id: true, content: true, senderType: true, messageType: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id },
      data: { lastMessage: text, lastMessageAt: new Date() },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', { conversationId: id, message: pendingMessage });

    try {
      const externalId = await this.wa.sendText(
        conversation.whatsappAccountId,
        conversation.customer.phoneNumber,
        text,
        quoted,
      );

      const message = await this.prisma.message.update({
        where: { id: pendingMessage.id },
        data: { status: MessageStatus.sent, externalId },
        include: {
          quotedMessage: { select: { id: true, content: true, senderType: true, messageType: true } },
        },
      });
      this.events.emitToAccount(conversation.whatsappAccountId, 'message:status', {
        conversationId: id,
        messageId: message.id,
        status: message.status,
      });
      await logAudit(this.prisma, {
        userId: adminId,
        action: 'message_send',
        entityType: 'conversation',
        entityId: id,
        newValue: { messageId: message.id, status: message.status },
      });
      return message;
    } catch (err) {
      const failed = await this.prisma.message.update({
        where: { id: pendingMessage.id },
        data: { status: MessageStatus.failed },
      });
      this.events.emitToAccount(conversation.whatsappAccountId, 'message:status', {
        conversationId: id,
        messageId: failed.id,
        status: failed.status,
      });
      await logAudit(this.prisma, {
        userId: adminId,
        action: 'message_send_failed',
        entityType: 'conversation',
        entityId: id,
        newValue: { messageId: failed.id, error: err instanceof Error ? err.message : 'Unknown send error' },
      });
      throw err;
    }
  }

  async approveDraft(id: string, messageId: string, adminId: string, editedText?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const draft = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: id, status: MessageStatus.pending },
    });
    if (!draft) throw new NotFoundException('Draft message not found or already sent');

    const text = editedText?.trim() || draft.content || '';
    if (!text) throw new BadRequestException('Draft text is empty');

    // A2: atomic claim — set to sent BEFORE sending so a concurrent approve
    // sees count=0 and bails out rather than double-sending.
    const claimed = await this.prisma.message.updateMany({
      where: { id: messageId, status: MessageStatus.pending },
      data: { status: MessageStatus.sent },
    });
    if (claimed.count === 0) throw new NotFoundException('Draft already claimed by a concurrent approve');

    try {
      const externalId = await this.wa.sendText(
        conversation.whatsappAccountId,
        conversation.customer.phoneNumber,
        text,
      );

      const updated = await this.prisma.message.update({
        where: { id: messageId },
        data: { content: text, externalId, ...(editedText ? { editedAt: new Date() } : {}) },
      });

      await this.prisma.conversation.update({
        where: { id },
        data: { lastMessage: text, lastMessageAt: new Date() },
      });
      this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', { conversationId: id, message: updated });
      await logAudit(this.prisma, {
        userId: adminId,
        action: 'draft_approve',
        entityType: 'conversation',
        entityId: id,
        newValue: { messageId, edited: !!editedText },
      });
      return updated;
    } catch (err) {
      // A2 rollback: put the draft back to pending so the admin can retry.
      await this.prisma.message.update({ where: { id: messageId }, data: { status: MessageStatus.pending } });
      throw err;
    }
  }

  async blockDraft(id: string, messageId: string, actorId?: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const draft = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: id, status: MessageStatus.pending },
    });
    if (!draft) throw new NotFoundException('Draft not found or already processed');

    // A2: atomic claim — prevent a concurrent approve from also claiming it.
    const claimed = await this.prisma.message.updateMany({
      where: { id: messageId, status: MessageStatus.pending },
      data: { status: MessageStatus.failed },
    });
    if (claimed.count === 0) throw new NotFoundException('Draft already claimed by a concurrent approve');

    this.events.emitToAccount(conversation.whatsappAccountId, 'message:draft-removed', { conversationId: id, messageId });
    await logAudit(this.prisma, {
      userId: actorId,
      action: 'draft_block',
      entityType: 'conversation',
      entityId: id,
      newValue: { messageId },
    });
    return { success: true, messageId };
  }

  async sendMedia(
    id: string,
    adminId: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    url: string,
    caption?: string,
  ) {
    assertSafeMediaUrl(url);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const externalId = await this.wa.sendMedia(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      mediaType,
      url,
      caption,
    );

    const typeMap: Record<string, MessageType> = {
      image: MessageType.image,
      document: MessageType.document,
      audio: MessageType.audio,
      video: MessageType.video,
    };

    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.admin,
        senderId: adminId,
        messageType: typeMap[mediaType] ?? MessageType.document,
        content: caption ?? null,
        mediaUrl: url,
        status: 'sent',
        externalId,
      },
    });

    await this.prisma.conversation.update({
      where: { id },
      data: { lastMessage: `[${mediaType}] ${caption ?? ''}`, lastMessageAt: new Date() },
    });

    this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', { conversationId: id, message });
    return message;
  }

  async sendUploadedMedia(
    id: string,
    adminId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
    caption?: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const mediaType = mediaTypeForMime(file.mimetype);
    const { url } = await this.storage.save(file.buffer, extForMimetype(file.mimetype));

    const externalId = await this.wa.sendMediaBuffer(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      mediaType,
      file.buffer,
      file.mimetype,
      caption,
      file.originalname,
    );

    const typeMap: Record<string, MessageType> = {
      image: MessageType.image,
      document: MessageType.document,
      audio: MessageType.audio,
      video: MessageType.video,
    };

    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.admin,
        senderId: adminId,
        messageType: typeMap[mediaType] ?? MessageType.document,
        content: caption ?? null,
        mediaUrl: url,
        status: 'sent',
        externalId,
      },
    });

    await this.prisma.conversation.update({
      where: { id },
      data: { lastMessage: `[${mediaType}] ${caption ?? ''}`, lastMessageAt: new Date() },
    });

    this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', { conversationId: id, message });
    return message;
  }

  async markRead(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: { select: { phoneNumber: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const inbound = await this.prisma.message.findMany({
      where: { conversationId: id, senderType: SenderType.customer, externalId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { externalId: true },
    });
    const externalIds = inbound.map((m) => m.externalId!).filter(Boolean);
    await this.wa.markRead(conversation.whatsappAccountId, conversation.customer.phoneNumber, externalIds);
    await this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
    return { marked: externalIds.length };
  }

  async reactToMessage(id: string, messageId: string, emoji: string, adminId: string) {
    const { conversation, message } = await this.messageWithRoute(id, messageId);
    if (message.externalId) {
      await this.wa.sendReaction(conversation.whatsappAccountId, conversation.customer.phoneNumber, message.externalId, emoji);
    }
    const map: Record<string, string[]> = (message.reactions as Record<string, string[]>) ?? {};
    for (const key of Object.keys(map)) {
      map[key] = (map[key] ?? []).filter((p) => p !== 'me');
      if (map[key].length === 0) delete map[key];
    }
    if (emoji) map[emoji] = [...(map[emoji] ?? []), 'me'];
    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { reactions: map as never } });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:reaction', { conversationId: id, messageId, reactions: updated.reactions });
    await logAudit(this.prisma, { userId: adminId, action: 'message_react', entityType: 'message', entityId: messageId, newValue: { emoji } });
    return updated;
  }

  async editMessage(id: string, messageId: string, newText: string, adminId: string) {
    const { conversation, message } = await this.messageWithRoute(id, messageId);
    if (message.senderType === SenderType.customer) throw new BadRequestException('Tidak bisa mengedit pesan customer');
    if (message.externalId) {
      await this.wa.editMessage(conversation.whatsappAccountId, conversation.customer.phoneNumber, message.externalId, newText);
    }
    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { content: newText, editedAt: new Date() } });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:edited', { conversationId: id, messageId, content: newText });
    await logAudit(this.prisma, { userId: adminId, action: 'message_edit', entityType: 'message', entityId: messageId });
    return updated;
  }

  async deleteMessage(id: string, messageId: string, adminId: string) {
    const { conversation, message } = await this.messageWithRoute(id, messageId);
    const fromMe = message.senderType !== SenderType.customer;
    if (message.externalId) {
      await this.wa.deleteMessage(conversation.whatsappAccountId, conversation.customer.phoneNumber, message.externalId, fromMe);
    }
    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:deleted', { conversationId: id, messageId });
    await logAudit(this.prisma, { userId: adminId, action: 'message_delete', entityType: 'message', entityId: messageId });
    return updated;
  }

  async sendLocation(id: string, adminId: string, latitude: number, longitude: number, name?: string) {
    const conversation = await this.conversationRoute(id);
    const externalId = await this.wa.sendLocation(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      latitude,
      longitude,
      name,
    );
    const content = name ? `${name}\n${latitude}, ${longitude}` : `${latitude}, ${longitude}`;
    const message = await this.createAdminWaMessage(conversation, adminId, {
      content,
      messageType: MessageType.location,
      externalId,
      lastMessage: `[location] ${name ?? content}`,
    });
    await logAudit(this.prisma, { userId: adminId, action: 'message_location_send', entityType: 'conversation', entityId: id });
    return message;
  }

  async sendPoll(id: string, adminId: string, question: string, options: string[], selectableCount = 1) {
    const conversation = await this.conversationRoute(id);
    const externalId = await this.wa.sendPoll(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      question,
      options,
      selectableCount,
    );
    const content = `${question}\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`;
    const message = await this.createAdminWaMessage(conversation, adminId, {
      content,
      externalId,
      lastMessage: `[poll] ${question}`,
    });
    await logAudit(this.prisma, { userId: adminId, action: 'message_poll_send', entityType: 'conversation', entityId: id });
    return message;
  }

  async sendContacts(id: string, adminId: string, contacts: { name: string; phone: string }[]) {
    const conversation = await this.conversationRoute(id);
    const externalId = await this.wa.sendContacts(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      contacts,
    );
    const content = contacts.map((contact) => `${contact.name} - ${contact.phone}`).join('\n');
    const message = await this.createAdminWaMessage(conversation, adminId, {
      content,
      externalId,
      lastMessage: `[contact] ${contacts[0]?.name ?? 'contact'}`,
    });
    await logAudit(this.prisma, { userId: adminId, action: 'message_contact_send', entityType: 'conversation', entityId: id });
    return message;
  }

  async forwardMessage(id: string, messageId: string, toPhone: string, adminId: string) {
    const { conversation, message } = await this.messageWithRoute(id, messageId);
    const digits = toPhone.replace(/[^\d]/g, '').replace(/^0/, '62');
    const externalId = await this.wa.forwardMessage(
      conversation.whatsappAccountId,
      digits,
      message.content ?? '',
    );
    await logAudit(this.prisma, {
      userId: adminId,
      action: 'message_forward',
      entityType: 'message',
      entityId: messageId,
      newValue: { toPhone: digits, externalId },
    });
    return { success: true, externalId };
  }

  async setMessageStarred(id: string, messageId: string, starred: boolean, adminId: string) {
    const { conversation, message } = await this.messageWithRoute(id, messageId);
    if (message.externalId) {
      await this.wa.setMessageStarred(
        conversation.whatsappAccountId,
        conversation.customer.phoneNumber,
        message.externalId,
        message.senderType !== SenderType.customer,
        starred,
      );
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { isStarred: starred },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:updated', {
      conversationId: id,
      message: updated,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: starred ? 'message_star' : 'message_unstar',
      entityType: 'message',
      entityId: messageId,
    });
    return updated;
  }
}
