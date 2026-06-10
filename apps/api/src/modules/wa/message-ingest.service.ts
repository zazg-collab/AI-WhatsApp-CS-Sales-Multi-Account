import { Injectable, Logger } from '@nestjs/common';
import { MessageType, SenderType, Prisma } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { jidToPhone } from './wa.util';

interface IncomingMessage {
  accountId: string;
  remoteJid: string;
  externalId: string;
  pushName?: string;
  text: string;
  type: MessageType;
  mediaUrl?: string;
}

/**
 * Turns a raw inbound WhatsApp message into CRM + chat records:
 * upserts the customer, finds/creates an open conversation, stores the
 * message, and pushes a live event to the dashboard.
 */
@Injectable()
export class MessageIngestService {
  private readonly logger = new Logger(MessageIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async ingest(msg: IncomingMessage) {
    const phone = jidToPhone(msg.remoteJid);

    const account = await this.prisma.whatsappAccount.findUnique({
      where: { id: msg.accountId },
    });
    if (!account) {
      this.logger.warn(`Ingest for unknown account ${msg.accountId}`);
      return;
    }

    const customer = await this.prisma.customer.upsert({
      where: {
        phoneNumber_sourceAccountId: {
          phoneNumber: phone,
          sourceAccountId: account.id,
        },
      },
      update: {
        lastMessageAt: new Date(),
        ...(msg.pushName ? { name: msg.pushName } : {}),
      },
      create: {
        name: msg.pushName ?? null,
        phoneNumber: phone,
        sourceAccountId: account.id,
        assignedAdminId: account.assignedAdminId,
        lastMessageAt: new Date(),
      },
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: { customerId: customer.id, whatsappAccountId: account.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          customerId: customer.id,
          whatsappAccountId: account.id,
          botId: account.assignedBotId,
          aiMode: account.aiMode,
        },
      });
    }

    // Idempotency (H1): WhatsApp may redeliver the same message. Skip if we
    // have already ingested this external id for this conversation, so we never
    // double-store or trigger a duplicate auto-reply.
    if (msg.externalId) {
      const existing = await this.prisma.message.findUnique({
        where: {
          conversationId_externalId: {
            conversationId: conversation.id,
            externalId: msg.externalId,
          },
        },
      });
      if (existing) {
        this.logger.warn(
          `Duplicate inbound message ${msg.externalId} for conversation ${conversation.id}, skipping`,
        );
        return null;
      }
    }

    let message;
    try {
      message = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: SenderType.customer,
          senderId: customer.id,
          messageType: msg.type,
          content: msg.text,
          mediaUrl: msg.mediaUrl,
          externalId: msg.externalId || null,
          status: 'delivered',
        },
      });
    } catch (err) {
      // Unique violation = concurrent duplicate delivery; treat as no-op.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.warn(
          `Concurrent duplicate inbound message ${msg.externalId}, skipping`,
        );
        return null;
      }
      throw err;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      // Inbound is always from the customer → bump the unread badge.
      data: {
        lastMessage: msg.text,
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    this.events.emitToAccount(account.id, 'message:new', {
      conversationId: conversation.id,
      message,
    });

    return { conversation, message, customer };
  }
}
