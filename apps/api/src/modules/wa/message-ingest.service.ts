import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMode, MessageStatus, MessageType, SenderType, TakeoverStatus, Prisma } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { AutoAssignService } from './auto-assign.service';
import { ContactSyncService } from './contact-sync.service';
import { logAudit } from '../../common/audit.util';
import { isGroupJid, isOptOutMessage, jidToPhone } from './wa.util';

interface IncomingMessage {
  accountId: string;
  remoteJid: string;
  /**
   * Real phone-number JID surfaced by Baileys on the message key (senderPn /
   * participantPn) when the chat is addressed by @lid. Lets us resolve the
   * privacy identifier to an actual number.
   */
  senderPn?: string;
  externalId: string;
  pushName?: string;
  text: string;
  type: MessageType;
  mediaUrl?: string;
  /** WhatsApp id of the message this message replied to, if any. */
  quotedExternalId?: string;
  /** True when WhatsApp says the message came from the linked phone/account. */
  fromMe?: boolean;
  /** Original WhatsApp timestamp, used for phone/history sync ordering. */
  occurredAt?: Date;
  /** Do not trigger AI/away/CSAT side effects for history backfills. */
  suppressAutomation?: boolean;
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
    private readonly contactSync: ContactSyncService,
    config: ConfigService,
  ) {
    const h = Number(config.get('CSAT_WINDOW_HOURS'));
    this.csatWindowHours = Number.isFinite(h) && h > 0 ? h : 24;
  }

  async ingest(msg: IncomingMessage) {
    const groupChat = isGroupJid(msg.remoteJid);
    let phone = groupChat ? msg.remoteJid : jidToPhone(msg.remoteJid);

    // Resolve @lid JIDs to real phone numbers. Prefer the phone Baileys put on
    // the message key (senderPn); fall back to the contact-sync mapping table.
    if (!groupChat && phone.endsWith('@lid')) {
      const fromKey = msg.senderPn ? jidToPhone(msg.senderPn) : '';
      if (fromKey && !fromKey.endsWith('@lid')) {
        phone = fromKey;
        // Persist the lid → phone mapping so later lookups (and the WA Contacts
        // page) resolve without needing the key again.
        await this.contactSync
          .recordLidMapping(msg.accountId, msg.remoteJid, phone)
          .catch((err) => this.logger.warn(`LID mapping persist failed: ${err}`));
      } else {
        phone = await this.contactSync.resolveLidPhone(msg.accountId, phone);
      }
    }

    const fromMe = msg.fromMe === true;
    const occurredAt = msg.occurredAt ?? new Date();

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
        ...(msg.suppressAutomation ? {} : { lastMessageAt: occurredAt }),
        ...(!groupChat && !fromMe && msg.pushName ? { name: msg.pushName } : {}),
      },
      create: {
        name: groupChat ? msg.pushName ?? msg.remoteJid : !fromMe ? msg.pushName ?? null : null,
        phoneNumber: phone,
        sourceAccountId: account.id,
        assignedAdminId: account.assignedAdminId,
        lastMessageAt: occurredAt,
      },
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: groupChat
        ? { whatsappAccountId: account.id, chatJid: msg.remoteJid }
        : { customerId: customer.id, whatsappAccountId: account.id },
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
          aiMode: groupChat ? AiMode.ai_off : account.aiMode,
          assignedAdminId,
          chatJid: msg.remoteJid,
          isGroup: groupChat,
          groupSubject: groupChat ? msg.pushName ?? null : null,
        },
      });
    } else if (!fromMe && this.autoAssign.enabled && !conversation.assignedAdminId) {
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
          senderType: fromMe ? SenderType.admin : SenderType.customer,
          senderId: fromMe ? account.assignedAdminId ?? null : customer.id,
          messageType: msg.type,
          content: msg.text,
          mediaUrl: msg.mediaUrl,
          externalId: msg.externalId || null,
          quotedMessageId,
          status: fromMe ? MessageStatus.sent : MessageStatus.delivered,
          createdAt: occurredAt,
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

    const conversationData: Prisma.ConversationUpdateInput = {};
    const shouldRefreshLastMessage =
      !conversation.lastMessageAt || occurredAt >= conversation.lastMessageAt;
    if (shouldRefreshLastMessage) {
      conversationData.lastMessage = msg.text;
      conversationData.lastMessageAt = occurredAt;
    }
    if (!fromMe && !msg.suppressAutomation) {
      conversationData.unreadCount = { increment: 1 };
    }
    if (Object.keys(conversationData).length > 0) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: conversationData,
      });
      this.events.emitToAccount(account.id, 'conversation:updated', {
        conversationId: conversation.id,
        ...('lastMessage' in conversationData ? { lastMessage: msg.text, lastMessageAt: occurredAt } : {}),
        ...(!fromMe && !msg.suppressAutomation ? { unreadCountDelta: 1 } : {}),
      });
    }

    this.events.emitToAccount(account.id, 'message:new', {
      conversationId: conversation.id,
      message,
    });

    let csatCaptured = false;
    if (!fromMe && !msg.suppressAutomation) {
      // CSAT capture: if we asked this customer to rate (after resolving) and they
      // reply with a number 1-5 within the window, record it as the score. A4: the
      // flag lets the caller skip auto-reply/auto-away for a bare rating reply.
      csatCaptured = await this.maybeCaptureCsat(conversation, msg.text).catch((err) => {
        this.logger.warn(`CSAT capture failed: ${err}`);
        return false;
      });

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
    }

    if (fromMe) {
      await logAudit(this.prisma, {
        userId: account.assignedAdminId ?? undefined,
        action: 'phone_message_sync',
        entityType: 'conversation',
        entityId: conversation.id,
        newValue: { messageId: message.id, externalId: msg.externalId || null },
      });

      // Implicit human takeover: this fromMe message survived the idempotency
      // check, so it is NOT an echo of an AI/dashboard send (those are stored
      // with their externalId first and deduped above) — a human typed it
      // directly on the phone. While a human handles the chat the bot must stay
      // silent, so pause AI like a dashboard takeover. Skipped for history
      // backfills and chats already under takeover / not AI-driven.
      const automated =
        conversation.aiMode === AiMode.ai_on ||
        conversation.aiMode === AiMode.ai_draft ||
        conversation.aiMode === AiMode.ai_supervised;
      if (
        !msg.suppressAutomation &&
        !groupChat &&
        automated &&
        conversation.takeoverStatus !== TakeoverStatus.admin_takeover
      ) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            takeoverStatus: TakeoverStatus.admin_takeover,
            previousAiMode: conversation.aiMode,
            aiMode: AiMode.ai_off,
          },
        });
        await logAudit(this.prisma, {
          userId: account.assignedAdminId ?? undefined,
          action: 'auto_takeover_phone_reply',
          entityType: 'conversation',
          entityId: conversation.id,
          newValue: { previousAiMode: conversation.aiMode },
        });
        this.events.emitToAccount(account.id, 'conversation:updated', {
          conversationId: conversation.id,
          aiMode: AiMode.ai_off,
          takeoverStatus: TakeoverStatus.admin_takeover,
        });
      }
    }

    return {
      conversation,
      message,
      customer,
      account,
      csatCaptured,
      fromMe,
      suppressAutomation: msg.suppressAutomation === true,
    };
  }

  /** Returns true when the inbound text was consumed as a CSAT rating. */
  private async maybeCaptureCsat(
    conversation: { id: string; whatsappAccountId: string; csatScore: number | null; csatRequestedAt: Date | null },
    text: string,
  ): Promise<boolean> {
    if (conversation.csatScore !== null || !conversation.csatRequestedAt) return false;
    const ageMs = Date.now() - conversation.csatRequestedAt.getTime();
    if (ageMs > this.csatWindowHours * 60 * 60 * 1000) return false;

    const m = /^\s*([1-5])\s*$/.exec(text ?? '');
    if (!m) return false;
    const score = parseInt(m[1], 10);

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { csatScore: score, csatRespondedAt: new Date() },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: conversation.id,
      csatScore: score,
    });
    return true;
  }
}
