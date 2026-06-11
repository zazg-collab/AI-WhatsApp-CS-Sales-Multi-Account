import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageType, SenderType, Prisma } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { AutoAssignService } from './auto-assign.service';
import { isOptOutMessage, jidToPhone } from './wa.util';

interface IncomingMessage {
  accountId: string;
  remoteJid: string;
  externalId: string;
  pushName?: string;
  text: string;
  type: MessageType;
  mediaUrl?: string;
  /** WhatsApp id of the message the customer replied to, if any. */
  quotedExternalId?: string;
}

/**
 * Turns a raw inbound WhatsApp message into CRM + chat records:
 * upserts the customer, finds/creates an open conversation, stores the
 * message, and pushes a live event to the dashboard.
 */
@Injectable()
export class MessageIngestService {
  private readonly logger = new Logger(MessageIngestService.name);

  private readonly csatWindowHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly autoAssign: AutoAssignService,
    config: ConfigService,
  ) {
    const h = Number(config.get('CSAT_WINDOW_HOURS'));
    this.csatWindowHours = Number.isFinite(h) && h > 0 ? h : 24;
  }

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
      // Auto-assignment: prefer the account's fixed admin, else pick one by the
      // configured strategy (round-robin / least-busy). No-op when disabled.
      const assignedAdminId =
        account.assignedAdminId ?? (await this.autoAssign.pickAdmin(account.id));
      conversation = await this.prisma.conversation.create({
        data: {
          customerId: customer.id,
          whatsappAccountId: account.id,
          botId: account.assignedBotId,
          aiMode: account.aiMode,
          assignedAdminId,
        },
      });
    } else if (this.autoAssign.enabled && !conversation.assignedAdminId) {
      // Existing chat that nobody owns yet → assign on this inbound.
      const adminId = await this.autoAssign.pickAdmin(account.id);
      if (adminId) {
        const updated = await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { assignedAdminId: adminId },
          include: { assignedAdmin: { select: { id: true, name: true } } },
        });
        conversation = updated;
        this.events.emitToAccount(account.id, 'conversation:updated', {
          conversationId: conversation.id,
          status: conversation.status,
          assignedAdmin: updated.assignedAdmin,
        });
      }
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

    // Resolve a customer reply/quote to the original stored message, if we
    // have it. Best-effort: an unknown stanzaId just means no quote link.
    let quotedMessageId: string | null = null;
    if (msg.quotedExternalId) {
      const quoted = await this.prisma.message.findUnique({
        where: {
          conversationId_externalId: {
            conversationId: conversation.id,
            externalId: msg.quotedExternalId,
          },
        },
        select: { id: true },
      });
      quotedMessageId = quoted?.id ?? null;
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
          quotedMessageId,
          status: 'delivered',
        },
        include: {
          quotedMessage: { select: { id: true, content: true, senderType: true, messageType: true } },
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

    // CSAT capture: if we asked this customer to rate (after resolving) and they
    // reply with a number 1–5 within the window, record it as the score.
    await this.maybeCaptureCsat(conversation, msg.text).catch((err) =>
      this.logger.warn(`CSAT capture failed: ${err}`),
    );

    if (!customer.optedOut && isOptOutMessage(msg.text)) {
      try {
        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { optedOut: true, optedOutAt: new Date() },
        });
        this.logger.log(`Customer ${customer.id} auto opted-out via keyword`);
      } catch (err) {
        this.logger.warn(`Failed to mark customer ${customer.id} opted-out: ${err}`);
      }
    }

    return { conversation, message, customer, account };
  }

  private async maybeCaptureCsat(
    conversation: { id: string; whatsappAccountId: string; csatScore: number | null; csatRequestedAt: Date | null },
    text: string,
  ) {
    if (conversation.csatScore !== null || !conversation.csatRequestedAt) return;
    const ageMs = Date.now() - conversation.csatRequestedAt.getTime();
    if (ageMs > this.csatWindowHours * 60 * 60 * 1000) return;

    const m = /^\s*([1-5])\s*$/.exec(text ?? '');
    if (!m) return;
    const score = parseInt(m[1], 10);

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { csatScore: score, csatRespondedAt: new Date() },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: conversation.id,
      csatScore: score,
    });
  }
}
