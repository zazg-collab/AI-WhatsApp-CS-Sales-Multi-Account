import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  LeadStage,
  Prisma,
  SenderType,
  TakeoverStatus,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { AuditService } from '../audit/audit.service';
import { WaService } from '../wa/wa.service';
import { CreateCampaignDto, CampaignTargetFilterDto, UpdateCampaignDto } from './dto/campaigns.dto';

const BLOCKED_TAGS = ['opt_out', 'blocked', 'do_not_contact'];
const MAX_RECIPIENTS = 1000;

export interface CandidateTarget {
  customerId: string;
  conversationId: string;
  phoneNumber: string;
  name?: string | null;
  tags: string[];
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
    @InjectQueue('campaigns') private readonly campaignsQueue: Queue,
  ) {}

  async list(status?: string) {
    if (status && !this.isCampaignStatus(status)) {
      throw new BadRequestException(`Invalid campaign status: ${status}`);
    }
    const where = status ? { status: status as CampaignStatus } : {};
    const campaigns = await this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { recipients: true } },
      },
      take: 100,
    });

    const stats = await this.recipientStats(campaigns.map((campaign) => campaign.id));
    return campaigns.map((campaign) => ({
      ...campaign,
      recipientStats: stats[campaign.id] ?? {},
    }));
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        recipients: {
          orderBy: { createdAt: 'asc' },
          take: 250,
          include: { customer: { select: { id: true, name: true, phoneNumber: true, tags: true } } },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const stats = await this.recipientStats([id]);
    return { ...campaign, recipientStats: stats[id] ?? {} };
  }

  async preview(whatsappAccountId: string, targetFilter: CampaignTargetFilterDto) {
    await this.assertWhatsappAccount(whatsappAccountId);
    const { targets, skipped } = await this.buildTargets(whatsappAccountId, targetFilter);
    return {
      eligibleCount: targets.length,
      skipped,
      sample: targets.slice(0, 25),
    };
  }

  async create(dto: CreateCampaignDto, userId: string) {
    this.assertDelayConfig(dto.humanDelayMinMs, dto.humanDelayMaxMs);
    await this.assertWhatsappAccount(dto.whatsappAccountId);
    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        messageTemplate: dto.messageTemplate,
        whatsappAccountId: dto.whatsappAccountId,
        targetFilter: (dto.targetFilter ?? {}) as Prisma.InputJsonValue,
        createdById: userId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        rateLimitPerMinute: dto.rateLimitPerMinute ?? 6,
        humanDelayMinMs: dto.humanDelayMinMs ?? 5000,
        humanDelayMaxMs: dto.humanDelayMaxMs ?? 20000,
      },
    });
    await this.audit.log(userId, 'campaign_created', 'Campaign', campaign.id, { name: campaign.name });
    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, userId: string) {
    const existing = await this.findCampaign(id);
    if (!([CampaignStatus.draft, CampaignStatus.pending_approval] as CampaignStatus[]).includes(existing.status)) {
      throw new BadRequestException('Only draft or pending approval campaigns can be edited');
    }
    this.assertDelayConfig(dto.humanDelayMinMs, dto.humanDelayMaxMs);
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.messageTemplate ? { messageTemplate: dto.messageTemplate } : {}),
        ...(dto.targetFilter ? { targetFilter: dto.targetFilter as Prisma.InputJsonValue } : {}),
        ...(dto.rateLimitPerMinute ? { rateLimitPerMinute: dto.rateLimitPerMinute } : {}),
        ...(dto.humanDelayMinMs ? { humanDelayMinMs: dto.humanDelayMinMs } : {}),
        ...(dto.humanDelayMaxMs ? { humanDelayMaxMs: dto.humanDelayMaxMs } : {}),
        ...(Object.prototype.hasOwnProperty.call(dto, 'scheduledAt')
          ? { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null }
          : {}),
      },
    });
    await this.audit.log(userId, 'campaign_updated', 'Campaign', id, { name: campaign.name });
    return campaign;
  }

  async submit(id: string, userId: string) {
    const campaign = await this.findCampaign(id);
    if (!([CampaignStatus.draft, CampaignStatus.pending_approval] as CampaignStatus[]).includes(campaign.status)) {
      throw new BadRequestException('Only draft campaigns can be submitted');
    }

    const targetFilter = (campaign.targetFilter ?? {}) as CampaignTargetFilterDto;
    const { targets, skipped } = await this.buildTargets(campaign.whatsappAccountId, targetFilter);
    if (targets.length === 0) throw new BadRequestException('No eligible recipients for this campaign');

    await this.prisma.$transaction([
      this.prisma.campaignRecipient.deleteMany({ where: { campaignId: id } }),
      this.prisma.campaignRecipient.createMany({
        data: targets.map((target) => ({
          campaignId: id,
          customerId: target.customerId,
          conversationId: target.conversationId,
          phoneNumber: target.phoneNumber,
          status: CampaignRecipientStatus.pending,
          idempotencyKey: `${id}:${target.customerId}`,
        })),
        skipDuplicates: true,
      }),
      this.prisma.campaign.update({
        where: { id },
        data: { status: CampaignStatus.pending_approval },
      }),
    ]);

    await this.audit.log(userId, 'campaign_submitted', 'Campaign', id, {
      eligibleCount: targets.length,
      skipped,
    });
    return this.get(id);
  }

  async approve(id: string, userId: string) {
    const campaign = await this.findCampaign(id);
    if (campaign.status !== CampaignStatus.pending_approval) {
      throw new BadRequestException('Only pending approval campaigns can be approved');
    }
    // Separation of duties (H4): the creator cannot approve their own campaign.
    if (campaign.createdById && campaign.createdById === userId) {
      throw new BadRequestException(
        'You cannot approve a campaign you created; a different reviewer must approve it',
      );
    }
    // Atomic guard (H4): only flip from pending_approval, so two concurrent
    // approvals cannot both succeed.
    const result = await this.prisma.campaign.updateMany({
      where: { id, status: CampaignStatus.pending_approval },
      data: { status: CampaignStatus.approved, approvedById: userId },
    });
    if (result.count === 0) {
      throw new BadRequestException('Campaign is no longer pending approval');
    }
    const approved = await this.findCampaign(id);
    await this.audit.log(userId, 'campaign_approved', 'Campaign', id, { name: approved.name });
    return approved;
  }

  async start(id: string, userId: string) {
    const campaign = await this.findCampaign(id);
    if (!([CampaignStatus.approved, CampaignStatus.paused, CampaignStatus.scheduled] as CampaignStatus[]).includes(campaign.status)) {
      throw new BadRequestException('Campaign must be approved, scheduled, or paused before start');
    }

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: id, status: { in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.failed] } },
      orderBy: { createdAt: 'asc' },
    });
    if (recipients.length === 0) throw new BadRequestException('No pending recipients to send');

    const baseDelay = campaign.scheduledAt && campaign.scheduledAt > new Date()
      ? campaign.scheduledAt.getTime() - Date.now()
      : 0;
    const minGap = Math.ceil(60_000 / Math.max(1, campaign.rateLimitPerMinute));
    let cumulativeDelay = baseDelay;

    for (const recipient of recipients) {
      cumulativeDelay += Math.max(
        minGap,
        this.randomDelay(campaign.humanDelayMinMs, campaign.humanDelayMaxMs),
      );
      await this.campaignsQueue.add(
        'send-recipient',
        { recipientId: recipient.id },
        { delay: cumulativeDelay, jobId: `campaign-recipient-${recipient.id}` },
      );
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: baseDelay > 0 ? CampaignStatus.scheduled : CampaignStatus.running,
        startedAt: new Date(),
      },
    });
    await this.prisma.campaignRecipient.updateMany({
      where: { id: { in: recipients.map((recipient) => recipient.id) } },
      data: { status: CampaignRecipientStatus.queued, error: null },
    });
    await this.audit.log(userId, 'campaign_started', 'Campaign', id, {
      queuedCount: recipients.length,
      rateLimitPerMinute: campaign.rateLimitPerMinute,
      scheduledAt: campaign.scheduledAt,
    });
    return updated;
  }

  async pause(id: string, userId: string) {
    await this.findCampaign(id);
    await this.removeRecipientJobs(id);
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.paused },
    });
    await this.prisma.campaignRecipient.updateMany({
      where: { campaignId: id, status: CampaignRecipientStatus.queued },
      data: { status: CampaignRecipientStatus.pending },
    });
    await this.audit.log(userId, 'campaign_paused', 'Campaign', id, {});
    return campaign;
  }

  async cancel(id: string, userId: string) {
    await this.findCampaign(id);
    await this.removeRecipientJobs(id);
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.cancelled },
    });
    await this.prisma.campaignRecipient.updateMany({
      where: { campaignId: id, status: { in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.queued] } },
      data: { status: CampaignRecipientStatus.skipped, error: 'Campaign cancelled' },
    });
    await this.audit.log(userId, 'campaign_cancelled', 'Campaign', id, {});
    return campaign;
  }

  async retryFailed(id: string, userId: string) {
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.approved },
    });
    const failed = await this.prisma.campaignRecipient.updateMany({
      where: { campaignId: id, status: CampaignRecipientStatus.failed },
      data: { status: CampaignRecipientStatus.pending, error: null },
    });
    await this.audit.log(userId, 'campaign_retry_failed', 'Campaign', id, { count: failed.count });
    return campaign;
  }

  async processRecipient(recipientId: string) {
    const recipient = await this.prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: { campaign: true, customer: true, conversation: true },
    });
    if (!recipient) throw new NotFoundException('Campaign recipient not found');
    if (recipient.status === CampaignRecipientStatus.sent) return;
    if (recipient.status !== CampaignRecipientStatus.queued) {
      this.logger.warn(`Campaign recipient ${recipient.id} is ${recipient.status}, skipping duplicate/stale job`);
      return;
    }
    if (!([CampaignStatus.running, CampaignStatus.scheduled] as CampaignStatus[]).includes(recipient.campaign.status)) {
      if (recipient.status === CampaignRecipientStatus.queued) {
        await this.prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: CampaignRecipientStatus.pending },
        });
      }
      return;
    }

    // Opt-out re-check (H5): tags/state may have changed between approval and
    // send. Never message a customer who opted out after the campaign snapshot.
    const normalizedTags = (recipient.customer.tags ?? []).map((tag) => tag.toLowerCase());
    const customerOptedOut =
      BLOCKED_TAGS.some((tag) => normalizedTags.includes(tag)) ||
      BLOCKED_TAGS.includes((recipient.customer.status ?? '').toLowerCase());
    if (customerOptedOut) {
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: CampaignRecipientStatus.skipped, error: 'Customer opted out before send' },
      });
      await this.refreshCampaignCompletion(recipient.campaignId);
      return;
    }
    // Don't fire into a conversation that an admin is actively handling.
    if (
      recipient.conversation &&
      (recipient.conversation.takeoverStatus === TakeoverStatus.waiting_admin ||
        recipient.conversation.takeoverStatus === TakeoverStatus.admin_takeover)
    ) {
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: CampaignRecipientStatus.skipped, error: 'Conversation under admin handling' },
      });
      await this.refreshCampaignCompletion(recipient.campaignId);
      return;
    }

    // Atomic claim (H3): flip queued→sending in one statement so a duplicate
    // or stalled-recovery job can never double-claim the same recipient.
    const claim = await this.prisma.campaignRecipient.updateMany({
      where: { id: recipient.id, status: CampaignRecipientStatus.queued },
      data: { status: CampaignRecipientStatus.sending, error: null },
    });
    if (claim.count === 0) {
      this.logger.warn(`Campaign recipient ${recipient.id} already claimed, skipping`);
      return;
    }
    await this.prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { status: CampaignStatus.running },
    });

    // Phase 1: the actual send. A failure here is safe to retry — nothing
    // reached the customer — so mark failed and rethrow.
    let sentMessageId: string | null;
    try {
      sentMessageId = await this.wa.sendText(
        recipient.campaign.whatsappAccountId,
        recipient.phoneNumber,
        recipient.campaign.messageTemplate,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Campaign recipient ${recipient.id} failed: ${message}`);
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: CampaignRecipientStatus.failed, error: message },
      });
      await this.audit.log(recipient.campaign.createdById ?? undefined, 'campaign_recipient_failed', 'CampaignRecipient', recipient.id, {
        campaignId: recipient.campaignId,
        error: message,
      });
      await this.refreshCampaignCompletion(recipient.campaignId);
      throw err;
    }

    // Phase 2 (H3): the message HAS been delivered. From here on we must never
    // mark the recipient failed or rethrow — either would let a retry re-send
    // the same message to the customer. Persistence is best-effort.
    try {
      if (recipient.conversationId) {
        const message = await this.prisma.message.create({
          data: {
            conversationId: recipient.conversationId,
            senderType: SenderType.admin,
            senderId: recipient.campaign.createdById,
            content: recipient.campaign.messageTemplate,
            status: 'sent',
            externalId: sentMessageId,
          },
        });
        await this.prisma.conversation.update({
          where: { id: recipient.conversationId },
          data: {
            lastMessage: recipient.campaign.messageTemplate,
            lastMessageAt: new Date(),
          },
        });
        this.events.emitToAccount(recipient.campaign.whatsappAccountId, 'message:new', { conversationId: recipient.conversationId, message });
      }
    } catch (err) {
      this.logger.error(
        `Campaign recipient ${recipient.id} sent but message persistence failed: ${err}`,
      );
    }

    await this.markRecipientSent(recipient.id, recipient.campaignId, sentMessageId);
  }

  /**
   * Record a successful delivery (H3). Retries the status write a few times;
   * if it still fails the recipient stays in `sending`, which is treated as
   * "possibly delivered" and is never auto-retried — duplicating a customer
   * message is worse than a stale status row.
   */
  private async markRecipientSent(
    recipientId: string,
    campaignId: string,
    sentMessageId: string | null,
  ) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.prisma.campaignRecipient.update({
          where: { id: recipientId },
          data: {
            status: CampaignRecipientStatus.sent,
            sentMessageId,
            sentAt: new Date(),
          },
        });
        await this.refreshCampaignCompletion(campaignId);
        return;
      } catch (err) {
        if (attempt === 3) {
          this.logger.error(
            `Campaign recipient ${recipientId} DELIVERED but could not be marked sent after ${attempt} attempts: ${err}. ` +
              'Recipient remains in `sending`; do NOT re-send it.',
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  private async buildTargets(whatsappAccountId: string, targetFilter: CampaignTargetFilterDto) {
    const where: Prisma.CustomerWhereInput = {};
    if (targetFilter.customerIds?.length) where.id = { in: targetFilter.customerIds };
    if (targetFilter.leadStage) where.leadStage = targetFilter.leadStage;
    if (targetFilter.tag) where.tags = { has: targetFilter.tag };
    if (targetFilter.assignedAdminId) where.assignedAdminId = targetFilter.assignedAdminId;

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        conversations: {
          where: { whatsappAccountId },
          orderBy: { lastMessageAt: 'desc' },
          select: { id: true, aiMode: true, takeoverStatus: true },
          take: 3,
        },
      },
      take: MAX_RECIPIENTS,
    });

    const targets: CandidateTarget[] = [];
    const skipped = { optOut: 0, riskyConversation: 0, noConversation: 0, invalidPhone: 0 };

    for (const customer of customers) {
      const phone = customer.phoneNumber?.trim();
      if (!phone) {
        skipped.invalidPhone += 1;
        continue;
      }
      const normalizedTags = customer.tags.map((tag) => tag.toLowerCase());
      if (BLOCKED_TAGS.some((tag) => normalizedTags.includes(tag)) || BLOCKED_TAGS.includes((customer.status ?? '').toLowerCase())) {
        skipped.optOut += 1;
        continue;
      }
      const safeConversation = customer.conversations.find((conversation) => (
        conversation.takeoverStatus !== TakeoverStatus.waiting_admin && conversation.aiMode !== 'ai_paused'
      ));
      if (!safeConversation) {
        if (customer.conversations.length === 0) skipped.noConversation += 1;
        else skipped.riskyConversation += 1;
        continue;
      }
      targets.push({
        customerId: customer.id,
        conversationId: safeConversation.id,
        phoneNumber: phone,
        name: customer.name,
        tags: customer.tags,
      });
    }

    return { targets, skipped };
  }

  private async recipientStats(campaignIds: string[]) {
    if (campaignIds.length === 0) return {} as Record<string, Record<string, number>>;
    const rows = await this.prisma.campaignRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: campaignIds } },
      _count: { id: true },
    });
    return rows.reduce<Record<string, Record<string, number>>>((acc, row) => {
      acc[row.campaignId] ??= {};
      acc[row.campaignId][row.status] = row._count.id;
      return acc;
    }, {});
  }

  private async refreshCampaignCompletion(campaignId: string) {
    const remaining = await this.prisma.campaignRecipient.count({
      where: { campaignId, status: { in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.queued, CampaignRecipientStatus.sending] } },
    });
    if (remaining > 0) return;
    const failed = await this.prisma.campaignRecipient.count({
      where: { campaignId, status: CampaignRecipientStatus.failed },
    });
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: failed > 0 ? CampaignStatus.failed : CampaignStatus.completed,
        completedAt: new Date(),
      },
    });
  }

  private async removeRecipientJobs(campaignId: string) {
    const queued = await this.prisma.campaignRecipient.findMany({
      where: { campaignId, status: CampaignRecipientStatus.queued },
      select: { id: true },
    });
    await Promise.all(queued.map(async (recipient) => {
      const job = await this.campaignsQueue.getJob(`campaign-recipient-${recipient.id}`);
      if (job) await job.remove();
    }));
  }

  private isCampaignStatus(status: string): status is CampaignStatus {
    return Object.values(CampaignStatus).includes(status as CampaignStatus);
  }

  private async findCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  private async assertWhatsappAccount(id: string) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('WhatsApp account not found');
    return account;
  }

  private assertDelayConfig(min?: number, max?: number) {
    if (min && max && min > max) {
      throw new BadRequestException('Minimum human delay cannot be greater than maximum human delay');
    }
  }

  private randomDelay(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
