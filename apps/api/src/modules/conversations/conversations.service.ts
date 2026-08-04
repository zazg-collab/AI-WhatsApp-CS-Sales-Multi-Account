import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiMode,
  ConversationStatus,
  Prisma,
  SenderType,
  TakeoverStatus,
} from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { WaService } from '../wa/wa.service';
import { LearningMinerService } from '../learning/learning-miner.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { logAudit } from '../../common/audit.util';
import { allowedAccountIds, accountFilter, assertConversationScope, type ScopedUser } from '../../common/account-scope.util';
import { MAX_EXPORT_ROWS } from '../../common/export-limits';

const DEFAULT_CSAT_MESSAGE =
  'Terima kasih sudah menghubungi kami 🙏 Boleh bantu beri nilai layanan kami? Balas angka 1–5 (1 = kurang, 5 = sangat puas).';

// Manual sends are persisted with status: MessageStatus.pending before gateway delivery (see conversation-messaging.service).
// Failed sends are audited as message_send_failed and can be retried without data loss.

interface ListFilters {
  accountId?: string;
  aiMode?: AiMode;
  status?: ConversationStatus;
  assignedAdminId?: string;
  label?: string;
  search?: string;
  needsAttention?: boolean;
  excludeGroups?: boolean;
  page?: number;
  limit?: number;
  user?: ScopedUser;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly csatEnabled: boolean;
  private readonly csatMessage: string;
  private readonly autoLearnEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
    private readonly learningMiner: LearningMinerService,
    @Optional() private readonly webhooks: WebhooksService | undefined,
    config: ConfigService,
  ) {
    this.csatEnabled = String(config.get('CSAT_ENABLED') ?? '').toLowerCase() === 'true';
    this.csatMessage = config.get<string>('CSAT_MESSAGE') || DEFAULT_CSAT_MESSAGE;
    // Opt-in: Sentinel mines a conversation for KB/customer-memory proposals when
    // it is resolved. All proposals stay pending (human-reviewed). Default off.
    this.autoLearnEnabled = String(config.get('AI_AUTOLEARN') ?? '').toLowerCase() === 'true';
  }

  async list(filters: ListFilters) {
    return this.runList(filters);
  }

  async unreadCount(user?: ScopedUser) {
    const scope = await allowedAccountIds(this.prisma, user);
    const where: Prisma.ConversationWhereInput = {};
    const acct = accountFilter(scope, undefined);
    if (acct !== undefined) where.whatsappAccountId = acct;
    where.unreadCount = { gt: 0 };
    const count = await this.prisma.conversation.count({ where });
    return { count };
  }

  private waName(contacts: { name: string | null; notify: string | null; verifiedName: string | null }[]): string | null {
    const c = contacts?.[0];
    return c?.name ?? c?.notify ?? c?.verifiedName ?? null;
  }

  async get(id: string, messageLimit = 100, user?: ScopedUser) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            whatsappContacts: {
              select: { name: true, notify: true, verifiedName: true, avatarUrl: true },
              take: 1,
            },
          },
        },
        whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true, sessionStatus: true } },
        bot: {
          select: {
            id: true,
            botName: true,
            defaultAiMode: true,
            persona: { select: { id: true, name: true } },
          },
        },
        assignedAdmin: { select: { id: true, name: true } },
        sentinelReviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const scope = await allowedAccountIds(this.prisma, user);
    if (scope !== null && !scope.includes(conversation.whatsappAccountId)) {
      throw new NotFoundException('Conversation not found');
    }

    const { messages, hasMore, oldestCursor } = await this.getMessages(id, { limit: messageLimit });
    const wac = conversation.customer.whatsappContacts?.[0];
    const waName = this.waName(conversation.customer.whatsappContacts ?? []);
    const customer = {
      ...conversation.customer,
      whatsappContacts: undefined,
      waName,
      avatarUrl: conversation.customer.avatarUrl ?? wac?.avatarUrl ?? null,
    };
    return { ...conversation, customer, messages, hasMoreMessages: hasMore, oldestCursor };
  }

  async getMessages(id: string, opts: { before?: string; limit?: number } = {}, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const before = opts.before ? new Date(opts.before) : null;

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      include: {
        quotedMessage: { select: { id: true, content: true, senderType: true, messageType: true } },
        // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): review Sentinel
        // MILIK PESAN INI, bukan review terakhir se-percakapan. Sebelumnya
        // kartu review di web cuma baca `conversation.sentinelReviews[0]`,
        // yang bisa jadi review untuk topik/draft lain sama sekali. Skema
        // `Message.sentinelReviewId` sudah ada & sudah diisi sejak awal
        // (wa-inbound.service.ts) — yang kurang cuma tarikan di sini.
        sentinelReview: {
          select: {
            id: true,
            decision: true,
            confidenceScore: true,
            riskScore: true,
            riskLevel: true,
            reason: true,
            recommendation: true,
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse();
    const oldestCursor = page.length ? page[0].createdAt : null;
    return { messages: page, hasMore, oldestCursor };
  }

  async searchMessages(id: string, query: string, limit = 50, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const q = query.trim().slice(0, 200);
    if (!q) return { items: [] };

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

  async exportList(filters: { accountId?: string; aiMode?: AiMode; from?: string; to?: string; user?: ScopedUser }) {
    const where: Prisma.ConversationWhereInput = {};
    const scope = await allowedAccountIds(this.prisma, filters.user);
    const acct = accountFilter(scope, filters.accountId);
    if (acct !== undefined) where.whatsappAccountId = acct;
    if (filters.aiMode) where.aiMode = filters.aiMode;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: MAX_EXPORT_ROWS,
      include: {
        customer: { select: { name: true, phoneNumber: true, leadStage: true } },
        _count: { select: { messages: true } },
      },
    });
    if (rows.length === MAX_EXPORT_ROWS) {
      this.logger.warn(
        `Conversation export hit the ${MAX_EXPORT_ROWS}-row cap; narrow the date range to get a complete export.`,
      );
    }
    return rows;
  }

  async setAiMode(id: string, aiMode: AiMode, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    // >>> ANGGA — melanjutkan AI harus ikut menurunkan benderanya.
    //
    // Sentinel menjeda dengan menyetel DUA hal sekaligus:
    //   { aiMode: 'ai_paused', takeoverStatus: 'waiting_admin' }
    // tapi dulu di sini cuma `aiMode` yang dikembalikan. Akibatnya percakapan
    // yang sudah dilanjutkan tetap berlabel "Needs review" selamanya (badge itu
    // dibaca dari `takeoverStatus === 'waiting_admin'`) dan terus nongkrong di
    // filter "perlu perhatian" — padahal sudah tidak perlu diperhatikan.
    //
    // Baru ketahuan sekarang karena sebelum radio `ai_paused` diperbaiki,
    // jalur ini memang tidak pernah bisa dilewati dari UI.
    //
    // Hanya berlaku untuk transisi KELUAR dari jeda; perpindahan mode biasa
    // sengaja tidak menyentuh status takeover sama sekali.
    const current = await this.prisma.conversation.findUnique({
      where: { id },
      select: { aiMode: true, takeoverStatus: true },
    });
    const keluarDariJeda =
      current?.aiMode === AiMode.ai_paused &&
      aiMode !== AiMode.ai_paused &&
      current?.takeoverStatus === TakeoverStatus.waiting_admin;

    return this.prisma.conversation.update({
      where: { id },
      data: {
        aiMode,
        ...(keluarDariJeda ? { takeoverStatus: TakeoverStatus.returned_to_ai } : {}),
      },
    });
  }

  async setBot(id: string, botId: string | null, actorId?: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { whatsappAccountId: true, botId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (botId) {
      const bot = await this.prisma.bot.findUnique({ where: { id: botId }, select: { id: true } });
      if (!bot) throw new NotFoundException('Bot not found');
    }

    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { botId },
      include: { bot: { select: { id: true, botName: true, persona: { select: { id: true, name: true } } } } },
    });

    await logAudit(this.prisma, {
      userId: actorId,
      action: 'conversation_set_bot',
      entityType: 'conversation',
      entityId: id,
      oldValue: { botId: conversation.botId },
      newValue: { botId },
    });

    this.events.emitToAccount(updated.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      bot: updated.bot,
    });
    return updated;
  }

  async setStatus(id: string, status: ConversationStatus, actorId?: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { whatsappAccountId: true, status: true, csatRequestedAt: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const justResolved = status === ConversationStatus.resolved && conversation.status !== ConversationStatus.resolved;
    const data: Prisma.ConversationUpdateInput & Record<string, any> = { status };
    if (justResolved) {
      (data as any).resolvedAt = new Date();
      if (this.csatEnabled) {
        data.csatRequestedAt = new Date();
        data.csatRespondedAt = null;
        data.csatScore = null;
      }
    }
    if (status !== ConversationStatus.resolved) {
      (data as any).resolvedAt = null;
    }

    const updated = await this.prisma.conversation.update({
      where: { id },
      data,
      include: {
        assignedAdmin: { select: { id: true, name: true } },
        customer: { select: { phoneNumber: true } },
      },
    });

    // Sentinel auto-learn (P1): on first resolve, mine this conversation for KB /
    // customer-memory proposals. Fire-and-forget — never blocks the resolve;
    // idempotent via conversation.learnedAt; opt-in via AI_AUTOLEARN.
    if (justResolved && this.autoLearnEnabled) {
      this.learningMiner
        .mineConversation(id)
        .catch(() => undefined);
    }

    if (justResolved) {
      this.webhooks?.deliver('conversation.resolved', {
        conversationId: id,
        customerId: updated.customer ? (updated as { customer?: { phoneNumber: string } }).customer?.phoneNumber : undefined,
        whatsappAccountId: updated.whatsappAccountId,
        resolvedBy: actorId,
      }).catch(() => undefined);
    }

    if (justResolved && this.csatEnabled) {
      this.wa
        .sendText(updated.whatsappAccountId, updated.customer.phoneNumber, this.csatMessage)
        .then(async (externalId) => {
          const message = await this.prisma.message.create({
            data: {
              conversationId: id,
              senderType: SenderType.system,
              content: this.csatMessage,
              status: 'sent',
              externalId,
            },
          });
          await this.prisma.conversation.update({
            where: { id },
            data: { lastMessage: this.csatMessage, lastMessageAt: new Date() },
          });
          this.events.emitToAccount(updated.whatsappAccountId, 'message:new', {
            conversationId: id,
            message,
          });
        })
        .catch(() => undefined);
    }

    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      status: updated.status,
      assignedAdmin: updated.assignedAdmin,
    });
    await logAudit(this.prisma, {
      userId: actorId,
      action: 'status_change',
      entityType: 'conversation',
      entityId: id,
      oldValue: { status: conversation.status },
      newValue: { status },
    });
    return updated;
  }

  async setLabels(id: string, labels: string[], actorId?: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { whatsappAccountId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const clean = Array.from(
      new Set(
        (labels ?? [])
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && l.length <= 40),
      ),
    ).slice(0, 20);

    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { labels: clean },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'conversation:updated', {
      conversationId: id,
      labels: updated.labels,
    });
    await logAudit(this.prisma, {
      userId: actorId,
      action: 'labels_change',
      entityType: 'conversation',
      entityId: id,
      newValue: { labels: clean },
    });
    return updated;
  }

  async assign(id: string, adminId: string | null, actorId?: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
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
    await logAudit(this.prisma, {
      userId: actorId,
      action: 'conversation_assign',
      entityType: 'conversation',
      entityId: id,
      newValue: { assignedAdminId: adminId },
    });
    return updated;
  }

  async update(id: string, dto: { aiMode?: AiMode; takeoverStatus?: TakeoverStatus }, user?: ScopedUser) {
    await assertConversationScope(this.prisma, id, user);
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const data: Prisma.ConversationUpdateInput = {
      ...(dto.aiMode !== undefined ? { aiMode: dto.aiMode } : {}),
      ...(dto.takeoverStatus !== undefined ? { takeoverStatus: dto.takeoverStatus } : {}),
    };
    return this.prisma.conversation.update({ where: { id }, data });
  }

  private async runList(filters: ListFilters) {
    const { accountId, aiMode, status, assignedAdminId, label, search, needsAttention, excludeGroups, page = 1, limit = 50, user } = filters;
    const where: Prisma.ConversationWhereInput = {};

    const scope = await allowedAccountIds(this.prisma, user);
    const acct = accountFilter(scope, accountId);
    if (acct !== undefined) where.whatsappAccountId = acct;
    if (aiMode) where.aiMode = aiMode;
    if (status) where.status = status;
    if (assignedAdminId) where.assignedAdminId = assignedAdminId;
    if (label) where.labels = { has: label };
    if (excludeGroups) where.chatJid = { not: { endsWith: '@g.us' } };
    if (needsAttention) {
      where.OR = [
        { takeoverStatus: TakeoverStatus.waiting_admin },
        { aiMode: AiMode.ai_paused },
      ];
    }
    if (search) {
      const searchOr: Prisma.ConversationWhereInput[] = [
        { groupSubject: { contains: search, mode: 'insensitive' } },
        { chatJid: { contains: search } },
        {
          customer: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
            ],
          },
        },
      ];
      if (where.OR) {
        const attentionOr = where.OR;
        delete where.OR;
        where.AND = [{ OR: attentionOr }, { OR: searchOr }];
      } else {
        where.OR = searchOr;
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { lastMessageAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: {
            select: {
              id: true, name: true, phoneNumber: true, leadScore: true, leadStage: true, tags: true, avatarUrl: true,
              whatsappContacts: { select: { name: true, notify: true, verifiedName: true, avatarUrl: true }, take: 1 },
            },
          },
          whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true, sessionStatus: true } },
          assignedAdmin: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, senderType: true, senderName: true, createdAt: true, status: true, externalId: true } as any },
        },
      }),
    ]);

    const mapped = items.map(conv => {
      const { whatsappContacts, ...rest } = conv.customer;
      const waName = this.waName(whatsappContacts ?? []);
      const wac = whatsappContacts?.[0];
      const lastMsg = conv.messages?.[0];
      return {
        ...conv,
        customer: { ...rest, waName, avatarUrl: rest.avatarUrl ?? wac?.avatarUrl ?? null },
        lastSenderType: lastMsg?.senderType ?? null,
        lastSenderName: (lastMsg as any)?.senderName ?? null,
      };
    });

    return { total, page, limit, items: mapped };
  }
}
