import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiMode,
  SenderType,
  TakeoverStatus,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { WaService } from '../wa/wa.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
  ) {}

  list(accountId?: string) {
    return this.prisma.conversation.findMany({
      where: accountId ? { whatsappAccountId: accountId } : undefined,
      orderBy: { lastMessageAt: 'desc' },
      include: { customer: true, whatsappAccount: true },
      take: 100,
    });
  }

  async get(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 200 },
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
}
