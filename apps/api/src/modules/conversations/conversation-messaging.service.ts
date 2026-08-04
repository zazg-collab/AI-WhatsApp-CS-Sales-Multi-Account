import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageStatus, MessageType, SenderType } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { WaService } from '../wa/wa.service';
import { MediaStorageService } from '../media/media-storage.service';
import { extForMimetype, normalizePhone } from '../wa/wa.util';
import { assertSafeMediaUrl } from '../../common/media-url.util';
import { logAudit } from '../../common/audit.util';
import { assertConversationScope, type ScopedUser } from '../../common/account-scope.util';

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

  private async conversationRoute(id: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: { select: { phoneNumber: true, name: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async messageWithRoute(conversationId: string, messageId: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, conversationId, user);
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

  async send(id: string, adminId: string, text: string, quotedMessageId?: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
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

  async approveDraft(id: string, messageId: string, adminId: string, editedText?: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const draft = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: id, status: MessageStatus.pending },
    });
    if (!draft) throw new NotFoundException('Draft message not found or already sent');

    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): gerbang uang menahan
    // draft ini karena isinya BELUM diverifikasi (mis. model menulis angka
    // rupiah sendiri di luar penanda) — jangan biarkan approve langsung
    // mengirim apa adanya ke pelanggan. Wajib lewat Edit (editedText terisi)
    // dulu; UI (DraftControls.tsx) sudah mematikan tombol Approve untuk draft
    // begini, penjagaan di sini supaya tetap berlaku walau dipanggil lewat
    // jalur lain (API langsung, dsb — bukan cuma UI).
    if (draft.moneyGateIssues?.length && !editedText?.trim()) {
      throw new BadRequestException(
        'Draft ini ditahan gerbang uang — edit isinya dulu sebelum disetujui, jangan approve langsung.',
      );
    }

    const text = editedText?.trim() || draft.content || '';
    if (!text) throw new BadRequestException('Draft text is empty');

    // A segmented draft quotes the customer message it answers; preserve that
    // quote on send so the customer sees which message each reply addresses.
    let quoted: { externalId: string; content: string | null; fromMe: boolean } | undefined;
    if (draft.quotedMessageId) {
      const quotedMsg = await this.prisma.message.findFirst({
        where: { id: draft.quotedMessageId, conversationId: id },
        select: { externalId: true, content: true, senderType: true },
      });
      if (quotedMsg?.externalId) {
        quoted = {
          externalId: quotedMsg.externalId,
          content: quotedMsg.content,
          fromMe: quotedMsg.senderType !== SenderType.customer,
        };
      }
    }

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
        quoted,
      );

      let updated;
      try {
        updated = await this.prisma.message.update({
          where: { id: messageId },
          data: { content: text, externalId, ...(editedText ? { editedAt: new Date() } : {}) },
        });
      } catch (updateErr: any) {
        // H4: If update fails with P2002 (unique constraint on conversationId+externalId),
        // the message was already sent and persisted in a prior attempt (or send returned
        // a duplicate externalId). Don't rollback — just fetch the current state and proceed.
        if (updateErr.code === 'P2002') {
          updated = await this.prisma.message.findUnique({ where: { id: messageId } });
          if (!updated) throw new NotFoundException('Message disappeared after send');
        } else {
          throw updateErr;
        }
      }

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
      // (But NOT if send succeeded; rollback is only for pre-send failures.)
      await this.prisma.message.update({ where: { id: messageId }, data: { status: MessageStatus.pending } });
      throw err;
    }
  }

  async blockDraft(id: string, messageId: string, actorId?: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
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
    user?: ScopedUser,
  ) {
    assertSafeMediaUrl(url);
    await assertConversationScope(this.prisma, id, user);

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
    user?: ScopedUser,
    asSticker = false,
    viewOnce = false,
  ) {
    await assertConversationScope(this.prisma, id, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const mediaType = asSticker && file.mimetype.startsWith('image/') ? 'sticker' : mediaTypeForMime(file.mimetype);
    // We store the original (pre-webp-conversion) bytes for our own record/thumbnail —
    // the sticker-specific webp conversion only happens on the buffer sent to Baileys.
    const { url } = await this.storage.save(file.buffer, extForMimetype(file.mimetype));

    const externalId = await this.wa.sendMediaBuffer(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      mediaType,
      file.buffer,
      file.mimetype,
      caption,
      file.originalname,
      viewOnce,
    );

    const typeMap: Record<string, MessageType> = {
      image: MessageType.image,
      document: MessageType.document,
      audio: MessageType.audio,
      video: MessageType.video,
      sticker: MessageType.sticker,
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

  async markRead(id: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
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
    // Tell every other connected admin the unread badge is cleared — without
    // this, a conversation read on one screen still shows unread elsewhere
    // until a full list reload.
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      unreadCount: 0,
    });
    return { marked: externalIds.length };
  }

  async reactToMessage(id: string, messageId: string, emoji: string, adminId: string, user?: ScopedUser) {
    const { conversation, message } = await this.messageWithRoute(id, messageId, user);
    if (message.externalId) {
      const fromMe = message.senderType !== SenderType.customer;
      await this.wa.sendReaction(conversation.whatsappAccountId, conversation.customer.phoneNumber, message.externalId, emoji, fromMe);
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

  async editMessage(id: string, messageId: string, newText: string, adminId: string, user?: ScopedUser) {
    const { conversation, message } = await this.messageWithRoute(id, messageId, user);
    if (message.senderType === SenderType.customer) throw new BadRequestException('Tidak bisa mengedit pesan customer');
    if (message.externalId) {
      await this.wa.editMessage(conversation.whatsappAccountId, conversation.customer.phoneNumber, message.externalId, newText);
    }
    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { content: newText, editedAt: new Date() } });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:edited', { conversationId: id, messageId, content: newText });
    await logAudit(this.prisma, { userId: adminId, action: 'message_edit', entityType: 'message', entityId: messageId });
    return updated;
  }

  async deleteMessage(id: string, messageId: string, adminId: string, user?: ScopedUser) {
    const { conversation, message } = await this.messageWithRoute(id, messageId, user);
    const fromMe = message.senderType !== SenderType.customer;
    if (message.externalId) {
      await this.wa.deleteMessage(conversation.whatsappAccountId, conversation.customer.phoneNumber, message.externalId, fromMe);
    }
    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:deleted', { conversationId: id, messageId });
    await logAudit(this.prisma, { userId: adminId, action: 'message_delete', entityType: 'message', entityId: messageId });
    return updated;
  }

  async sendLocation(id: string, adminId: string, latitude: number, longitude: number, name?: string, user?: ScopedUser) {
    const conversation = await this.conversationRoute(id, user);
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

  async sendPoll(id: string, adminId: string, question: string, options: string[], selectableCount = 1, user?: ScopedUser) {
    const conversation = await this.conversationRoute(id, user);
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

  async sendContacts(id: string, adminId: string, contacts: { name: string; phone: string }[], user?: ScopedUser) {
    const conversation = await this.conversationRoute(id, user);
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

  async forwardMessage(id: string, messageId: string, toPhone: string, adminId: string, user?: ScopedUser) {
    const { conversation, message } = await this.messageWithRoute(id, messageId, user);
    const digits = normalizePhone(toPhone);
    // Guard against malformed targets: normalizePhone strips non-digits, so a
    // value like "abc" collapses to "" and would otherwise build an empty JID
    // ("@s.whatsapp.net") and send to nowhere. WA numbers are well over 8 digits.
    if (digits.length < 8) {
      throw new BadRequestException('A valid destination phone number is required');
    }
    // Respect opt-out: if the destination matches a known customer who has
    // opted out of messaging, refuse the forward (mirrors the campaign gate).
    const optedOut = await this.prisma.customer.findFirst({
      where: { phoneNumber: digits, optedOut: true },
      select: { id: true },
    });
    if (optedOut) {
      throw new BadRequestException('This number has opted out of messages and cannot be contacted');
    }

    // A media message must be forwarded with its media — sending only
    // `message.content` silently dropped images/docs/audio/video, delivering an
    // empty (or text-only) message to the recipient. Re-send the media when the
    // original carried a media URL; fall back to text otherwise.
    const MEDIA_TYPES: Record<string, 'image' | 'document' | 'audio' | 'video'> = {
      [MessageType.image]: 'image',
      [MessageType.video]: 'video',
      [MessageType.audio]: 'audio',
      [MessageType.voice]: 'audio',
      [MessageType.document]: 'document',
      [MessageType.sticker]: 'document',
    };
    const mediaType = MEDIA_TYPES[message.messageType];

    let externalId: string | null;
    if (mediaType && message.mediaUrl) {
      externalId = await this.wa.sendMedia(
        conversation.whatsappAccountId,
        digits,
        mediaType,
        message.mediaUrl,
        message.content ?? undefined,
      );
    } else {
      externalId = await this.wa.forwardMessage(
        conversation.whatsappAccountId,
        digits,
        message.content ?? '',
      );
    }
    await logAudit(this.prisma, {
      userId: adminId,
      action: 'message_forward',
      entityType: 'message',
      entityId: messageId,
      newValue: { toPhone: digits, externalId, mediaForwarded: Boolean(mediaType && message.mediaUrl) },
    });
    return { success: true, externalId };
  }

  async setMessageStarred(id: string, messageId: string, starred: boolean, adminId: string, user?: ScopedUser) {
    const { conversation, message } = await this.messageWithRoute(id, messageId, user);
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

  async setMessagePinned(id: string, messageId: string, pinned: boolean, adminId: string, user?: ScopedUser) {
    const { conversation, message } = await this.messageWithRoute(id, messageId, user);
    if (message.externalId) {
      await this.wa.pinMessage(
        conversation.whatsappAccountId,
        conversation.customer.phoneNumber,
        message.externalId,
        !pinned,
      );
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: pinned },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:updated', {
      conversationId: id,
      message: updated,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: pinned ? 'message_pin' : 'message_unpin',
      entityType: 'message',
      entityId: messageId,
    });
    return updated;
  }
}
