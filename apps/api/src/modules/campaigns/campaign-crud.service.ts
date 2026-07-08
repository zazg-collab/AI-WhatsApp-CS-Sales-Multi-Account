import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  Prisma,
  TakeoverStatus,
} from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { allowedAccountIds, type ScopedUser } from '../../common/account-scope.util';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCampaignDto, CampaignTargetFilterDto, UpdateCampaignDto } from './dto/campaigns.dto';

const BLOCKED_TAGS = ['opt_out', 'blocked', 'do_not_contact'];
const DEFAULT_MAX_RECIPIENTS = 1000;
const DEFAULT_MAX_DAILY_SENDS_PER_ACCOUNT = 500;

export interface CandidateTarget {
  customerId: string;
  conversationId: string;
  phoneNumber: string;
  name?: string | null;
  tags: string[];
}

@Injectable()
export class CampaignCrudService {
  readonly maxRecipients: number;
  readonly maxDailySendsPerAccount: number;

  constructor(
    readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('campaigns') readonly campaignsQueue: Queue,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    this.maxRecipients = Number(config.get<string>('CAMPAIGN_MAX_RECIPIENTS') ?? DEFAULT_MAX_RECIPIENTS);
    this.maxDailySendsPerAccount = Number(config.get<string>('CAMPAIGN_MAX_DAILY_SENDS') ?? DEFAULT_MAX_DAILY_SENDS_PER_ACCOUNT);
  }

  async list(status?: string, user?: ScopedUser) {
    if (status && !this.isCampaignStatus(status)) throw new BadRequestException(`Invalid campaign status: ${status}`);
    const where: Prisma.CampaignWhereInput = status ? { status: status as CampaignStatus } : {};
    const scope = await allowedAccountIds(this.prisma, user);
    if (scope !== null) where.whatsappAccountId = { in: scope };
    const campaigns = await this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        asset: { select: { id: true, title: true, kind: true, mediaUrl: true } },
        _count: { select: { recipients: true } },
      },
      take: 100,
    });
    const stats = await this.recipientStats(campaigns.map((c) => c.id));
    return campaigns.map((c) => ({ ...c, recipientStats: stats[c.id] ?? {} }));
  }

  async get(id: string, user?: ScopedUser) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        asset: { select: { id: true, title: true, kind: true, mediaUrl: true } },
        recipients: { orderBy: { createdAt: 'asc' }, take: 250, include: { customer: { select: { id: true, name: true, phoneNumber: true, tags: true } } } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const scope = await allowedAccountIds(this.prisma, user);
    if (scope !== null && !scope.includes(campaign.whatsappAccountId)) throw new NotFoundException('Campaign not found');
    const stats = await this.recipientStats([id]);
    return { ...campaign, recipientStats: stats[id] ?? {} };
  }

  async preview(whatsappAccountId: string, targetFilter: CampaignTargetFilterDto) {
    await this.assertWhatsappAccount(whatsappAccountId);
    const { targets, skipped } = await this.buildTargets(whatsappAccountId, targetFilter);
    return { eligibleCount: targets.length, skipped, sample: targets.slice(0, 25) };
  }

  async create(dto: CreateCampaignDto, userId: string) {
    this.assertDelayConfig(dto.humanDelayMinMs, dto.humanDelayMaxMs);
    await this.assertWhatsappAccount(dto.whatsappAccountId);
    const campaignConfig = await this.settings.campaign();
    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        messageTemplate: dto.messageTemplate,
        whatsappAccountId: dto.whatsappAccountId,
        assetId: dto.assetId,
        targetFilter: (dto.targetFilter ?? {}) as Prisma.InputJsonValue,
        createdById: userId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        rateLimitPerMinute: dto.rateLimitPerMinute ?? campaignConfig.defaultRateLimitPerMinute,
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
        ...(Object.prototype.hasOwnProperty.call(dto, 'scheduledAt') ? { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null } : {}),
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

    // When approval isn't required (Settings → Keamanan Campaign), skip
    // pending_approval and let the creator go straight to approved/scheduled
    // — campaign-queue.service.start() only accepts those statuses.
    const campaignConfig = await this.settings.campaign();
    const skipApproval = !campaignConfig.requireApproval;
    const nextStatus = skipApproval
      ? (campaign.scheduledAt != null && campaign.scheduledAt > new Date() ? CampaignStatus.scheduled : CampaignStatus.approved)
      : CampaignStatus.pending_approval;

    await this.prisma.$transaction([
      this.prisma.campaignRecipient.deleteMany({ where: { campaignId: id } }),
      this.prisma.campaignRecipient.createMany({
        data: targets.map((t) => ({ campaignId: id, customerId: t.customerId, conversationId: t.conversationId, phoneNumber: t.phoneNumber, status: CampaignRecipientStatus.pending, idempotencyKey: `${id}:${t.customerId}` })),
        skipDuplicates: true,
      }),
      this.prisma.campaign.update({
        where: { id },
        data: { status: nextStatus, ...(skipApproval ? { approvedById: userId } : {}) },
      }),
    ]);
    await this.audit.log(userId, 'campaign_submitted', 'Campaign', id, { eligibleCount: targets.length, skipped, autoApproved: skipApproval });
    return this.get(id);
  }

  async approve(id: string, userId: string) {
    const campaign = await this.findCampaign(id);
    if (campaign.status !== CampaignStatus.pending_approval) throw new BadRequestException('Only pending approval campaigns can be approved');
    if (campaign.createdById && campaign.createdById === userId) throw new BadRequestException('You cannot approve a campaign you created; a different reviewer must approve it');
    const result = await this.prisma.campaign.updateMany({
      where: { id, status: CampaignStatus.pending_approval },
      data: { status: campaign.scheduledAt != null && campaign.scheduledAt > new Date() ? CampaignStatus.scheduled : CampaignStatus.approved, approvedById: userId },
    });
    if (result.count === 0) throw new BadRequestException('Campaign is no longer pending approval');
    const approved = await this.findCampaign(id);
    await this.audit.log(userId, 'campaign_approved', 'Campaign', id, { name: approved.name, scheduledAt: campaign.scheduledAt });
    return approved;
  }

  async pause(id: string, userId: string) {
    await this.findCampaign(id);
    await this.removeRecipientJobs(id);
    const campaign = await this.prisma.campaign.update({ where: { id }, data: { status: CampaignStatus.paused } });
    await this.prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: CampaignRecipientStatus.queued }, data: { status: CampaignRecipientStatus.pending } });
    await this.audit.log(userId, 'campaign_paused', 'Campaign', id, {});
    return campaign;
  }

  async cancel(id: string, userId: string) {
    await this.findCampaign(id);
    await this.removeRecipientJobs(id);
    const campaign = await this.prisma.campaign.update({ where: { id }, data: { status: CampaignStatus.cancelled } });
    await this.prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: { in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.queued] } }, data: { status: CampaignRecipientStatus.skipped, error: 'Campaign cancelled' } });
    await this.audit.log(userId, 'campaign_cancelled', 'Campaign', id, {});
    return campaign;
  }

  async retryFailed(id: string, userId: string) {
    const campaign = await this.prisma.campaign.update({ where: { id }, data: { status: CampaignStatus.approved } });
    const failed = await this.prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: CampaignRecipientStatus.failed }, data: { status: CampaignRecipientStatus.pending, error: null } });
    await this.audit.log(userId, 'campaign_retry_failed', 'Campaign', id, { count: failed.count });
    return campaign;
  }

  async duplicate(id: string, userId: string) {
    const source = await this.findCampaign(id);
    const copy = await this.prisma.campaign.create({
      data: { name: `${source.name} (copy)`, messageTemplate: source.messageTemplate, whatsappAccountId: source.whatsappAccountId, targetFilter: (source.targetFilter ?? {}) as Prisma.InputJsonValue, createdById: userId, rateLimitPerMinute: source.rateLimitPerMinute, humanDelayMinMs: source.humanDelayMinMs, humanDelayMaxMs: source.humanDelayMaxMs, status: CampaignStatus.draft },
    });
    await this.audit.log(userId, 'campaign_duplicated', 'Campaign', copy.id, { sourceId: id });
    return copy;
  }

  async optOut(customerId: string, userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const updated = await this.prisma.customer.update({ where: { id: customerId }, data: { optedOut: true, optedOutAt: new Date() } });
    await this.audit.log(userId, 'customer_opted_out', 'Customer', customerId, {});
    return updated;
  }

  async optIn(customerId: string, userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const updated = await this.prisma.customer.update({ where: { id: customerId }, data: { optedOut: false, optedOutAt: null } });
    await this.audit.log(userId, 'customer_opted_in', 'Customer', customerId, {});
    return updated;
  }

  async listOptedOut(page = 1, pageSize = 50) {
    const take = Math.min(Math.max(pageSize, 1), 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where: { optedOut: true }, orderBy: { optedOutAt: 'desc' }, select: { id: true, name: true, phoneNumber: true, optedOutAt: true, tags: true }, skip, take }),
      this.prisma.customer.count({ where: { optedOut: true } }),
    ]);
    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  async buildTargets(whatsappAccountId: string, targetFilter: CampaignTargetFilterDto) {
    const where: Prisma.CustomerWhereInput = { optedOut: false };
    if (targetFilter.customerIds?.length) where.id = { in: targetFilter.customerIds };
    if (targetFilter.leadStage) where.leadStage = targetFilter.leadStage;
    if (targetFilter.tag) where.tags = { has: targetFilter.tag };
    if (targetFilter.assignedAdminId) where.assignedAdminId = targetFilter.assignedAdminId;

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: { conversations: { where: { whatsappAccountId }, orderBy: { lastMessageAt: 'desc' }, select: { id: true, aiMode: true, takeoverStatus: true }, take: 3 } },
      take: this.maxRecipients,
    });

    const targets: CandidateTarget[] = [];
    const skipped = { optOut: 0, riskyConversation: 0, noConversation: 0, invalidPhone: 0 };

    for (const customer of customers) {
      const phone = customer.phoneNumber?.trim();
      if (!phone) { skipped.invalidPhone += 1; continue; }
      const normalizedTags = customer.tags.map((t) => t.toLowerCase());
      if (BLOCKED_TAGS.some((t) => normalizedTags.includes(t)) || BLOCKED_TAGS.includes((customer.status ?? '').toLowerCase())) { skipped.optOut += 1; continue; }
      const safeConversation = customer.conversations.find((c) => c.takeoverStatus !== TakeoverStatus.waiting_admin && c.aiMode !== 'ai_paused');
      if (!safeConversation) { if (customer.conversations.length === 0) skipped.noConversation += 1; else skipped.riskyConversation += 1; continue; }
      targets.push({ customerId: customer.id, conversationId: safeConversation.id, phoneNumber: phone, name: customer.name, tags: customer.tags });
    }
    return { targets, skipped };
  }

  async recipientStats(campaignIds: string[]) {
    if (campaignIds.length === 0) return {} as Record<string, Record<string, number>>;
    const rows = await this.prisma.campaignRecipient.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: campaignIds } }, _count: { id: true } });
    return rows.reduce<Record<string, Record<string, number>>>((acc, row) => { acc[row.campaignId] ??= {}; acc[row.campaignId][row.status] = row._count.id; return acc; }, {});
  }

  async refreshCampaignCompletion(campaignId: string) {
    const remaining = await this.prisma.campaignRecipient.count({
      where: { campaignId, status: { in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.queued, CampaignRecipientStatus.sending] } },
    });
    if (remaining > 0) return;
    const failed = await this.prisma.campaignRecipient.count({ where: { campaignId, status: CampaignRecipientStatus.failed } });
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: failed > 0 ? CampaignStatus.failed : CampaignStatus.completed, completedAt: new Date() } });
  }

  async removeRecipientJobs(campaignId: string) {
    const queued = await this.prisma.campaignRecipient.findMany({ where: { campaignId, status: CampaignRecipientStatus.queued }, select: { id: true } });
    await Promise.all(queued.map(async (r) => { const job = await this.campaignsQueue.getJob(`campaign-recipient-${r.id}`); if (job) await job.remove(); }));
  }

  async findCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async assertWhatsappAccount(id: string) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('WhatsApp account not found');
    return account;
  }

  assertDelayConfig(min?: number, max?: number) {
    if (min && max && min > max) throw new BadRequestException('Minimum human delay cannot be greater than maximum human delay');
  }

  isCampaignStatus(status: string): status is CampaignStatus {
    return Object.values(CampaignStatus).includes(status as CampaignStatus);
  }
}
