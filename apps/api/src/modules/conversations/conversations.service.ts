import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AiMode,
  ConversationStatus,
  MessageType,
  Prisma,
  SenderType,
  TakeoverStatus,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { WaService } from '../wa/wa.service';
import { MediaStorageService } from '../media/media-storage.service';
import { extForMimetype } from '../wa/wa.util';
import { assertSafeMediaUrl } from '../../common/media-url.util';

/** Map an upload mimetype to a WhatsApp media category. */
function mediaTypeForMime(mime: string): 'image' | 'document' | 'audio' | 'video' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

interface ListFilters {
  accountId?: string;
  aiMode?: AiMode;
  status?: ConversationStatus;
  assignedAdminId?: string;
  search?: string;
  needsAttention?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
    private readonly storage: MediaStorageService,
  ) {}

  async list(filters: ListFilters) {
    const { accountId, aiMode, status, assignedAdminId, search, needsAttention, page = 1, limit = 50 } = filters;
    const where: Prisma.ConversationWhereInput = {};

    if (accountId) where.whatsappAccountId = accountId;
    if (aiMode) where.aiMode = aiMode;
    if (status) where.status = status;
    if (assignedAdminId) where.assignedAdminId = assignedAdminId;
    if (needsAttention) {
      where.OR = [
        { takeoverStatus: TakeoverStatus.waiting_admin },
        { aiMode: AiMode.ai_paused },
      ];
    }
    if (search) {
      where.customer = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phoneNumber: { contains: search } },
        ],
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phoneNumber: true, leadScore: true, leadStage: true, tags: true } },
          whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
          assignedAdmin: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, senderType: true, createdAt: true, status: true } },
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  async get(id: string, messageLimit = 100) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
        bot: { select: { id: true, botName: true, defaultAiMode: true } },
        assignedAdmin: { select: { id: true, name: true } },
        hermesReviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    // Load the *most recent* page of messages (chat opens at the bottom).
    // Older messages are fetched on demand via getMessages (infinite scroll).
    const { messages, hasMore, oldestCursor } = await this.getMessages(id, { limit: messageLimit });
    return { ...conversation, messages, hasMoreMessages: hasMore, oldestCursor };
  }

  /**
   * Cursor-paginated message history, newest-first window returned in
   * chronological order. Pass `before` (an ISO timestamp, the previous page's
   * oldestCursor) to load older messages for infinite scroll.
   */
  async getMessages(id: string, opts: { before?: string; limit?: number } = {}) {
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const before = opts.before ? new Date(opts.before) : null;

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // one extra row tells us whether an older page exists
      include: {
        quotedMessage: { select: { id: true, content: true, senderType: true, messageType: true } },
      },
    });

    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse(); // chronological (asc) for display
    const oldestCursor = page.length ? page[0].createdAt : null;
    return { messages: page, hasMore, oldestCursor };
  }

  /** Manual reply sent by an admin through the account's WhatsApp connection. */
  async send(id: string, adminId: string, text: string, quotedMessageId?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    // Reply/quote: the quoted message must belong to this conversation and
    // have a WhatsApp id we can reference. Otherwise send as a plain message.
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

    const externalId = await this.wa.sendText(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      text,
      quoted,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.admin,
        senderId: adminId,
        content: text,
        status: 'sent',
        externalId,
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

    this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', { conversationId: id, message });
    return message;
  }

  /**
   * Approve a supervised/draft AI message: send the (possibly edited) text to
   * the customer and flip the stored draft from pending → sent. The draft row
   * is updated in place so it keeps its position in the timeline.
   */
  async approveDraft(id: string, messageId: string, adminId: string, editedText?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const draft = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: id, senderType: SenderType.ai, status: 'pending' },
    });
    if (!draft) throw new NotFoundException('Draft not found or already handled');

    const text = (editedText ?? draft.content ?? '').trim();
    if (!text) throw new NotFoundException('Draft has no content to send');

    const externalId = await this.wa.sendText(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      text,
    );

    const message = await this.prisma.message.update({
      where: { id: draft.id },
      data: { content: text, status: 'sent', externalId, senderId: adminId },
    });

    await this.prisma.conversation.update({
      where: { id },
      data: { lastMessage: text, lastMessageAt: new Date() },
    });

    this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', { conversationId: id, message });
    return message;
  }

  /** Block/discard a supervised draft: mark it failed so it is never sent. */
  async blockDraft(id: string, messageId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { whatsappAccountId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const draft = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: id, senderType: SenderType.ai, status: 'pending' },
    });
    if (!draft) throw new NotFoundException('Draft not found or already handled');

    const message = await this.prisma.message.update({
      where: { id: draft.id },
      data: { status: 'failed' },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:draft-removed', {
      conversationId: id,
      messageId: draft.id,
    });
    return message;
  }

  /** Admin takes over: AI stops replying to this conversation. */
  async takeover(id: string, adminId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { aiMode: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.prisma.conversation.update({
      where: { id },
      data: {
        takeoverStatus: TakeoverStatus.admin_takeover,
        // DR1: remember the pre-takeover mode (unless already off) so
        // return-to-AI can restore it rather than forcing ai_on.
        previousAiMode:
          conversation.aiMode === AiMode.ai_off ? undefined : conversation.aiMode,
        aiMode: AiMode.ai_off,
        assignedAdminId: adminId,
      },
    });
  }

  async returnToAi(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { previousAiMode: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    // DR1: restore the mode that was active before takeover. Falling back to
    // ai_draft (not ai_on) avoids silently re-enabling unsupervised auto-reply.
    const restored = conversation.previousAiMode ?? AiMode.ai_draft;
    return this.prisma.conversation.update({
      where: { id },
      data: {
        takeoverStatus: TakeoverStatus.returned_to_ai,
        aiMode: restored,
        previousAiMode: null,
      },
    });
  }

  setAiMode(id: string, aiMode: AiMode) {
    return this.prisma.conversation.update({
      where: { id },
      data: { aiMode },
    });
  }

  /** Set the workflow status (open/pending/resolved) of a conversation. */
  async setStatus(id: string, status: ConversationStatus) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { whatsappAccountId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { status },
      include: { assignedAdmin: { select: { id: true, name: true } } },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      status: updated.status,
      assignedAdmin: updated.assignedAdmin,
    });
    return updated;
  }

  /** Assign a conversation to an admin (or unassign with adminId = null). */
  async assign(id: string, adminId: string | null) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { whatsappAccountId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (adminId) {
      const admin = await this.prisma.user.findFirst({
        where: { id: adminId, deletedAt: null },
        select: { id: true },
      });
      if (!admin) throw new BadRequestException('Admin not found');
    }

    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { assignedAdminId: adminId },
      include: { assignedAdmin: { select: { id: true, name: true } } },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      status: updated.status,
      assignedAdmin: updated.assignedAdmin,
    });
    return updated;
  }

  /** Full-text search within one conversation's messages (most recent first). */
  async searchMessages(id: string, query: string, limit = 50) {
    const q = query.trim();
    if (!q) return { items: [] };
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const items = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: { id: true, content: true, senderType: true, messageType: true, createdAt: true },
    });
    return { items };
  }

  async exportList(filters: { accountId?: string; aiMode?: AiMode; from?: string; to?: string }) {
    const where: Prisma.ConversationWhereInput = {};
    if (filters.accountId) where.whatsappAccountId = filters.accountId;
    if (filters.aiMode) where.aiMode = filters.aiMode;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    return this.prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 10000,
      include: {
        customer: { select: { name: true, phoneNumber: true, leadStage: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  /** Send a media message (image/document/audio/video) via WhatsApp. */
  async sendMedia(
    id: string,
    adminId: string,
    mediaType: 'image' | 'document' | 'audio' | 'video',
    url: string,
    caption?: string,
  ) {
    // SSRF guard (M2): the gateway fetches this URL server-side.
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

  /**
   * Send a media file uploaded from the admin's device. The bytes are sent
   * straight to WhatsApp and stored (so they re-render in the UI); no
   * admin-supplied URL is involved, so this path needs no SSRF guard.
   */
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

  /**
   * Mark the customer's recent inbound messages as read in WhatsApp when an
   * admin opens the chat. Sends blue ticks for the most recent customer
   * messages that have an external id.
   */
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
    // Clear the unread badge now that an admin has the chat open.
    await this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
    return { marked: externalIds.length };
  }

  async update(id: string, data: { aiMode?: AiMode; takeoverStatus?: TakeoverStatus }) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.prisma.conversation.update({ where: { id }, data });
  }
}
