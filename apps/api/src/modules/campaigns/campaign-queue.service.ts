import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CampaignRecipientStatus, CampaignStatus } from '@hermes/database';
import { AuditService } from '../audit/audit.service';
import { CampaignCrudService } from './campaign-crud.service';

@Injectable()
export class CampaignQueueService {
  private readonly logger = new Logger(CampaignQueueService.name);

  constructor(
    private readonly crud: CampaignCrudService,
    private readonly audit: AuditService,
  ) {}

  async start(id: string, userId?: string) {
    const campaign = await this.crud.findCampaign(id);
    if (!([CampaignStatus.approved, CampaignStatus.paused, CampaignStatus.scheduled] as CampaignStatus[]).includes(campaign.status)) {
      throw new BadRequestException('Campaign must be approved, scheduled, or paused before start');
    }

    const concurrent = await this.crud.prisma.campaign.findFirst({
      where: { id: { not: id }, whatsappAccountId: campaign.whatsappAccountId, status: { in: [CampaignStatus.running, CampaignStatus.scheduled] } },
      select: { id: true, name: true },
    });
    if (concurrent) throw new BadRequestException(`Account already has a running/scheduled campaign ("${concurrent.name}"). Wait for it to finish or pause it first.`);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentToday = await this.crud.prisma.campaignRecipient.count({
      where: { status: CampaignRecipientStatus.sent, sentAt: { gte: since }, campaign: { whatsappAccountId: campaign.whatsappAccountId } },
    });
    if (sentToday >= this.crud.maxDailySendsPerAccount) {
      throw new BadRequestException(`Daily send cap reached for this account (${this.crud.maxDailySendsPerAccount}/24h). Try again later.`);
    }

    const recipients = await this.crud.prisma.campaignRecipient.findMany({
      where: { campaignId: id, status: { in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.failed] } },
      orderBy: { createdAt: 'asc' },
    });
    if (recipients.length === 0) throw new BadRequestException('No pending recipients to send');

    const baseDelay = campaign.scheduledAt && campaign.scheduledAt > new Date() ? campaign.scheduledAt.getTime() - Date.now() : 0;
    const minGap = Math.ceil(60_000 / Math.max(1, campaign.rateLimitPerMinute));
    let cumulativeDelay = baseDelay;

    for (const recipient of recipients) {
      cumulativeDelay += Math.max(minGap, this.randomDelay(campaign.humanDelayMinMs, campaign.humanDelayMaxMs));
      await this.crud.campaignsQueue.add('send-recipient', { recipientId: recipient.id }, { delay: cumulativeDelay, jobId: `campaign-recipient-${recipient.id}` });
    }

    const updated = await this.crud.prisma.campaign.update({
      where: { id },
      data: { status: baseDelay > 0 ? CampaignStatus.scheduled : CampaignStatus.running, startedAt: new Date() },
    });
    await this.crud.prisma.campaignRecipient.updateMany({ where: { id: { in: recipients.map((r) => r.id) } }, data: { status: CampaignRecipientStatus.queued, error: null } });
    await this.audit.log(userId, 'campaign_started', 'Campaign', id, { queuedCount: recipients.length, rateLimitPerMinute: campaign.rateLimitPerMinute, scheduledAt: campaign.scheduledAt });
    return updated;
  }

  @Interval(60_000)
  async runScheduledCampaigns() {
    try {
      const due = await this.crud.prisma.campaign.findMany({
        where: { status: CampaignStatus.scheduled, scheduledAt: { lte: new Date() } },
        select: { id: true, createdById: true },
      });
      for (const campaign of due) {
        try { await this.start(campaign.id, campaign.createdById ?? undefined); }
        catch (err) { this.logger.warn(`Scheduled campaign ${campaign.id} failed to auto-start: ${err}`); }
      }
    } catch (err) { this.logger.error(`runScheduledCampaigns failed: ${err}`); }
  }

  private randomDelay(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
