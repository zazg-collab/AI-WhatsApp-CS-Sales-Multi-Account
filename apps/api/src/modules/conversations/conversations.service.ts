import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiMode,
  MessageType,
  Prisma,
  SenderType,
  TakeoverStatus,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { WaService } from '../wa/wa.service';
import { assertSafeMediaUrl } from '../../common/media-url.util';

interface ListFilters {
  accountId?: string;
  aiMode?: AiMode;
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
  ) {}

  async list(filters: ListFilters) {
    const { accountId, aiMode, search, needsAttention, page = 1, limit = 50 } = filters;
    const where: Prisma.ConversationWhereInput = {};

    if (accountId) where.whatsappAccountId = accountId;
    if (aiMode) where.aiMode = aiMode;
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
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, senderType: true, createdAt: true, status: true } },
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  async get(id: string, messagePage = 1, messageLimit = 100) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
        bot: { select: { id: true, botName: true, defaultAiMode: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          skip: (messagePage - 1) * messageLimit,
          take: messageLimit,
        },
        hermesReviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  /** Manual reply sent by an admin through the account's WhatsApp connection. */
  async send(id: string, adminId: string, text: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const externalId = await this.wa.sendText(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      text,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.admin,
        senderId: adminId,
        content: text,
        status: 'sent',
        externalId,
      },
    });

    await this.prisma.conversation.update({
      where: { id },
      data: { lastMessage: text, lastMessageAt: new Date() },
    });

    this.events.emit('message:new', { conversationId: id, message });
    return message;
  }

  /** Admin takes over: AI stops replying to this conversation. */
  takeover(id: string, adminId: string) {
    return this.prisma.conversation.update({
      where: { id },
      data: {
        takeoverStatus: TakeoverStatus.admin_takeover,
        aiMode: AiMode.ai_off,
        assignedAdminId: adminId,
      },
    });
  }

  returnToAi(id: string) {
    return this.prisma.conversation.update({
      where: { id },
      data: {
        takeoverStatus: TakeoverStatus.returned_to_ai,
        aiMode: AiMode.ai_on,
      },
    });
  }

  setAiMode(id: string, aiMode: AiMode) {
    return this.prisma.conversation.update({
      where: { id },
      data: { aiMode },
    });
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

    this.events.emit('message:new', { conversationId: id, message });
    return message;
  }

  async update(id: string, data: { aiMode?: AiMode; takeoverStatus?: TakeoverStatus }) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.prisma.conversation.update({ where: { id }, data });
  }
}
