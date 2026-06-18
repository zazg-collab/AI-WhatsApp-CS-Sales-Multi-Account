import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiMode, TakeoverStatus } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { WaService } from '../wa/wa.service';
import { logAudit } from '../../common/audit.util';

@Injectable()
export class ConversationChatOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
  ) {}

  private async conversationRoute(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: { select: { phoneNumber: true, name: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async startConversation(
    accountId: string,
    phoneNumber: string,
    name: string | undefined,
    adminId: string,
  ) {
    let digits = phoneNumber.replace(/[^\d]/g, '');
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    if (digits.length < 8 || digits.length > 15) {
      throw new BadRequestException('Nomor telepon tidak valid (8–15 digit)');
    }

    const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('WhatsApp account not found');

    const customer = await this.prisma.customer.upsert({
      where: { phoneNumber_sourceAccountId: { phoneNumber: digits, sourceAccountId: accountId } },
      update: { ...(name ? { name } : {}) },
      create: {
        name: name ?? null,
        phoneNumber: digits,
        sourceAccountId: accountId,
        assignedAdminId: account.assignedAdminId ?? adminId,
      },
    });

    let conversation = await this.prisma.conversation.findFirst({
      where: { customerId: customer.id, whatsappAccountId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          customerId: customer.id,
          whatsappAccountId: accountId,
          botId: account.assignedBotId,
          aiMode: AiMode.ai_off,
          assignedAdminId: adminId,
        },
      });
      this.events.emitToAccount(accountId, 'conversation:updated', {
        conversationId: conversation.id,
        status: conversation.status,
        assignedAdmin: null,
      });
    }

    if (!customer.avatarUrl) {
      this.wa
        .fetchAvatar(accountId, digits)
        .then(async (url) => {
          if (url) await this.prisma.customer.update({ where: { id: customer.id }, data: { avatarUrl: url } });
        })
        .catch(() => undefined);
    }

    await logAudit(this.prisma, {
      userId: adminId,
      action: 'conversation_start',
      entityType: 'conversation',
      entityId: conversation.id,
      newValue: { phoneNumber: digits },
    });
    return { id: conversation.id, customerId: customer.id };
  }

  async validateNumber(accountId: string, phoneNumber: string) {
    let digits = phoneNumber.replace(/[^\d]/g, '');
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    const exists = await this.wa.isOnWhatsApp(accountId, digits);
    return { phoneNumber: digits, exists };
  }

  async takeover(id: string, adminId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { aiMode: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        takeoverStatus: TakeoverStatus.admin_takeover,
        previousAiMode:
          conversation.aiMode === AiMode.ai_off ? undefined : conversation.aiMode,
        aiMode: AiMode.ai_off,
        assignedAdminId: adminId,
      },
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: 'takeover',
      entityType: 'conversation',
      entityId: id,
    });
    return updated;
  }

  async returnToAi(id: string, actorId?: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { previousAiMode: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const restored = conversation.previousAiMode ?? AiMode.ai_draft;
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        takeoverStatus: TakeoverStatus.returned_to_ai,
        aiMode: restored,
        previousAiMode: null,
      },
    });
    await logAudit(this.prisma, {
      userId: actorId,
      action: 'return_to_ai',
      entityType: 'conversation',
      entityId: id,
      newValue: { aiMode: restored },
    });
    return updated;
  }

  async sendTyping(id: string, typing: boolean) {
    const conversation = await this.conversationRoute(id);
    await this.wa.sendTyping(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      typing,
    );
    return { success: true, typing };
  }

  async setContactBlocked(id: string, blocked: boolean, adminId: string) {
    const conversation = await this.conversationRoute(id);
    await this.wa.setContactBlocked(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      blocked,
    );
    await this.prisma.conversation.update({
      where: { id },
      data: { isBlocked: blocked },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      isBlocked: blocked,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: blocked ? 'contact_block' : 'contact_unblock',
      entityType: 'conversation',
      entityId: id,
    });
    return { success: true, blocked };
  }

  async setChatMuted(id: string, muted: boolean, adminId: string) {
    const conversation = await this.conversationRoute(id);
    const muteUntil = muted ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null;
    await this.wa.setChatMuted(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      muted,
    );
    await this.prisma.conversation.update({
      where: { id },
      data: { isMuted: muted, muteUntil },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      isMuted: muted,
      muteUntil,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: muted ? 'chat_mute' : 'chat_unmute',
      entityType: 'conversation',
      entityId: id,
    });
    return { success: true, muted };
  }

  async setDisappearingMessages(id: string, enabled: boolean, adminId: string, duration?: number) {
    const conversation = await this.conversationRoute(id);
    const nextDuration = enabled ? duration ?? 7 * 24 * 60 * 60 : null;
    const setAt = enabled ? new Date() : null;
    await this.wa.setDisappearingMessages(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      enabled,
      duration,
    );
    await this.prisma.conversation.update({
      where: { id },
      data: {
        disappearingDuration: nextDuration,
        disappearingSetAt: setAt,
      },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      disappearingDuration: nextDuration,
      disappearingSetAt: setAt,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: enabled ? 'disappearing_messages_enable' : 'disappearing_messages_disable',
      entityType: 'conversation',
      entityId: id,
      newValue: { duration },
    });
    return { success: true, enabled, duration: enabled ? duration ?? 7 * 24 * 60 * 60 : 0 };
  }

  async setChatArchived(id: string, archived: boolean, adminId: string) {
    const conversation = await this.conversationRoute(id);
    await this.wa.setChatArchived(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      archived,
    );
    await this.prisma.conversation.update({ where: { id }, data: { isArchived: archived } });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      isArchived: archived,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: archived ? 'chat_archive' : 'chat_unarchive',
      entityType: 'conversation',
      entityId: id,
    });
    return { success: true, archived };
  }

  async setChatPinned(id: string, pinned: boolean, adminId: string) {
    const conversation = await this.conversationRoute(id);
    await this.wa.setChatPinned(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      pinned,
    );
    await this.prisma.conversation.update({ where: { id }, data: { isPinned: pinned } });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      isPinned: pinned,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: pinned ? 'chat_pin' : 'chat_unpin',
      entityType: 'conversation',
      entityId: id,
    });
    return { success: true, pinned };
  }
}
