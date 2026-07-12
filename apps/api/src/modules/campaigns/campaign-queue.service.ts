import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CampaignRecipientStatus, CampaignStatus } from '@sentinel/database';
import { AuditService } from '../audit/audit.service';
import { CampaignCrudService } from './campaign-crud.service';
import { currentContext } from '../../common/request-context';

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

    // Only `pending` — never auto-requeue `failed`. The reaper marks stuck
    // recipients `failed` precisely because they may have already delivered;
    // re-sending them requires the explicit retry-failed endpoint (which flips
    // them back to `pending` as a deliberate human action).
    const recipients = await this.crud.prisma.campaignRecipient.findMany({
      where: { campaignId: id, status: CampaignRecipientStatus.pending },
      orderBy: { createdAt: 'asc' },
    });
    if (recipients.length === 0) throw new BadRequestException('No pending recipients to send');

    const baseDelay = campaign.scheduledAt && campaign.scheduledAt > new Date() ? campaign.scheduledAt.getTime() - Date.now() : 0;
    const minGap = Math.ceil(60_000 / Math.max(1, campaign.rateLimitPerMinute));
    let cumulativeDelay = baseDelay;
    // Tag each job with the requestId of the start() call that enqueued it, so
    // logs from the (much later) async send can be traced back to who started
    // the campaign — the requestId of the eventual job-processing context is
    // otherwise unrelated to any HTTP request.
    const { requestId } = currentContext();

    const updated = await this.crud.prisma.campaign.update({
      where: { id },
      data: { status: baseDelay > 0 ? CampaignStatus.scheduled : CampaignStatus.running, startedAt: new Date() },
    });
    // Mark `queued` BEFORE enqueueing: processRecipient() rejects any job whose
    // recipient isn't already `queued` as a stale/duplicate job (H2 — a job
    // firing before this flip would otherwise be dropped and the recipient
    // left stranded in `pending`, since the reaper only sweeps `sending`).
    await this.crud.prisma.campaignRecipient.updateMany({ where: { id: { in: recipients.map((r) => r.id) } }, data: { status: CampaignRecipientStatus.queued, error: null } });

    for (const recipient of recipients) {
      cumulativeDelay += Math.max(minGap, this.randomDelay(campaign.humanDelayMinMs, campaign.humanDelayMaxMs));
      const jobId = `campaign-recipient-${recipient.id}`;
      // A prior failed/completed attempt (retryFailed) can leave a job under
      // this same deterministic jobId around (removeOnFail keeps it for 7d).
      // BullMQ silently no-ops add() when the jobId already exists, which
      // would leave this recipient `queued` with nothing to ever process it
      // (H1) — so clear any stale job first.
      await this.crud.campaignsQueue.remove(jobId).catch(() => undefined);
      await this.crud.campaignsQueue.add(
        'send-recipient',
        { recipientId: recipient.id, requestId },
        { delay: cumulativeDelay, jobId },
      );
    }

    await this.audit.log(userId, 'campaign_started', 'Campaign', id, { queuedCount: recipients.length, rateLimitPerMinute: campaign.rateLimitPerMinute, scheduledAt: campaign.scheduledAt });
    return updated;
  }

  // A recipient claimed into `sending` is freed only by processRecipient
  // completing. If the worker crashes after the claim, or markRecipientSent
  // exhausts its retries, the recipient is stranded in `sending` forever —
  // blocking campaign completion (refreshCampaignCompletion never counts it).
  // Sweep recipients stuck there past the timeout to a terminal `failed` so the
  // campaign can finish. We do NOT re-queue: a stuck recipient may already have
  // been delivered, and re-sending risks a duplicate message (anti-ban rule).
  static readonly STUCK_SENDING_TIMEOUT_MS = 10 * 60 * 1000;

  @Interval(120_000)
  async reapStuckRecipients() {
    try {
      const cutoff = new Date(Date.now() - CampaignQueueService.STUCK_SENDING_TIMEOUT_MS);
      const stuck = await this.crud.prisma.campaignRecipient.findMany({
        where: { status: CampaignRecipientStatus.sending, updatedAt: { lt: cutoff } },
        select: { id: true, campaignId: true },
      });
      if (stuck.length === 0) return;
      const affectedCampaigns = new Set<string>();
      for (const r of stuck) {
        // Atomic guard: only flip if it's still `sending` (a late completion may
        // have moved it to `sent` between the read and the write).
        const claimed = await this.crud.prisma.campaignRecipient.updateMany({
          where: { id: r.id, status: CampaignRecipientStatus.sending },
          data: { status: CampaignRecipientStatus.failed, error: 'Stuck in sending past timeout — not retried (may have already delivered)' },
        });
        if (claimed.count > 0) {
          affectedCampaigns.add(r.campaignId);
          this.logger.warn(`Campaign recipient ${r.id} reaped from stuck \`sending\` → \`failed\` (not retried).`);
        }
      }
      for (const campaignId of affectedCampaigns) {
        await this.crud.refreshCampaignCompletion(campaignId);
      }
    } catch (err) {
      this.logger.error(`reapStuckRecipients failed: ${err}`);
    }
  }

  @Interval(60_000)
  async runScheduledCampaigns() {
    try {
      // Exclude campaigns whose jobs are already enqueued/in flight — start()
      // has already run for them; re-calling it every minute just log-spams
      // (and used to re-queue `failed` recipients).
      const due = await this.crud.prisma.campaign.findMany({
        where: {
          status: CampaignStatus.scheduled,
          scheduledAt: { lte: new Date() },
          recipients: { none: { status: { in: [CampaignRecipientStatus.queued, CampaignRecipientStatus.sending] } } },
        },
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
