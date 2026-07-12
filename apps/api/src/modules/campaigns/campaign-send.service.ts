import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CampaignRecipientStatus, CampaignStatus, MessageType, SenderType, TakeoverStatus } from '@sentinel/database';
import { EventsGateway } from '../../realtime/events.gateway';
import { AuditService } from '../audit/audit.service';
import { WaService } from '../wa/wa.service';
import { MediaStorageService } from '../media/media-storage.service';
import { renderTemplate } from '../wa/wa.util';
import { CampaignCrudService } from './campaign-crud.service';

const BLOCKED_TAGS = ['opt_out', 'blocked', 'do_not_contact'];

@Injectable()
export class CampaignSendService {
  private readonly logger = new Logger(CampaignSendService.name);

  constructor(
    private readonly crud: CampaignCrudService,
    private readonly wa: WaService,
    private readonly storage: MediaStorageService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
  ) {}

  async processRecipient(recipientId: string) {
    const recipient = await this.crud.prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: { campaign: { include: { asset: true } }, customer: true, conversation: true },
    });
    if (!recipient) throw new NotFoundException('Campaign recipient not found');
    if (recipient.status === CampaignRecipientStatus.sent) return;
    if (recipient.status !== CampaignRecipientStatus.queued) {
      this.logger.warn(`Campaign recipient ${recipient.id} is ${recipient.status}, skipping duplicate/stale job`);
      return;
    }
    if (!([CampaignStatus.running, CampaignStatus.scheduled] as CampaignStatus[]).includes(recipient.campaign.status)) {
      if (recipient.status === CampaignRecipientStatus.queued) {
        await this.crud.prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: CampaignRecipientStatus.pending } });
      }
      return;
    }

    const normalizedTags = (recipient.customer.tags ?? []).map((t) => t.toLowerCase());
    // `optedOut` covers keyword auto-detect and the manual endpoint, which set
    // only the boolean (no tag) — a customer can opt out after being enqueued.
    const customerOptedOut = recipient.customer.optedOut || BLOCKED_TAGS.some((t) => normalizedTags.includes(t)) || BLOCKED_TAGS.includes((recipient.customer.status ?? '').toLowerCase());
    if (customerOptedOut) {
      await this.crud.prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: CampaignRecipientStatus.skipped, error: 'Customer opted out before send' } });
      await this.crud.refreshCampaignCompletion(recipient.campaignId);
      return;
    }
    if (recipient.conversation && (recipient.conversation.takeoverStatus === TakeoverStatus.waiting_admin || recipient.conversation.takeoverStatus === TakeoverStatus.admin_takeover)) {
      await this.crud.prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: CampaignRecipientStatus.skipped, error: 'Conversation under admin handling' } });
      await this.crud.refreshCampaignCompletion(recipient.campaignId);
      return;
    }

    const claim = await this.crud.prisma.campaignRecipient.updateMany({ where: { id: recipient.id, status: CampaignRecipientStatus.queued }, data: { status: CampaignRecipientStatus.sending, error: null } });
    if (claim.count === 0) { this.logger.warn(`Campaign recipient ${recipient.id} already claimed, skipping`); return; }
    // Flip the campaign to `running` only on the first recipient that leaves the
    // scheduled state — avoids one write per recipient on large sends.
    if (recipient.campaign.status === CampaignStatus.scheduled) {
      await this.crud.prisma.campaign.updateMany({ where: { id: recipient.campaignId, status: CampaignStatus.scheduled }, data: { status: CampaignStatus.running } });
    }

    const content = renderTemplate(recipient.campaign.messageTemplate, { name: recipient.customer?.name, phone: recipient.phoneNumber });

    let sentMessageId: string | null;
    try {
      const asset = recipient.campaign.asset;
      if (asset) {
        const buffer = await this.storage.read(asset.storageKey);
        sentMessageId = await this.wa.sendMediaBuffer(recipient.campaign.whatsappAccountId, recipient.phoneNumber, asset.kind as 'image' | 'document' | 'audio' | 'video', buffer, asset.mimeType, content, asset.title);
      } else {
        sentMessageId = await this.wa.sendText(recipient.campaign.whatsappAccountId, recipient.phoneNumber, content);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Campaign recipient ${recipient.id} failed: ${message}`);
      await this.crud.prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: CampaignRecipientStatus.failed, error: message } });
      await this.audit.log(recipient.campaign.createdById ?? undefined, 'campaign_recipient_failed', 'CampaignRecipient', recipient.id, { campaignId: recipient.campaignId, error: message });
      await this.crud.refreshCampaignCompletion(recipient.campaignId);
      throw err;
    }

    try {
      if (recipient.conversationId) {
        const asset = recipient.campaign.asset;
        const msg = await this.crud.prisma.message.create({
          data: {
            conversationId: recipient.conversationId,
            senderType: SenderType.admin,
            senderId: recipient.campaign.createdById,
            content,
            ...(asset ? { messageType: asset.kind as MessageType, mediaUrl: asset.mediaUrl } : {}),
            status: 'sent',
            externalId: sentMessageId,
          },
        });
        await this.crud.prisma.conversation.update({ where: { id: recipient.conversationId }, data: { lastMessage: content, lastMessageAt: new Date() } });
        this.events.emitToAccount(recipient.campaign.whatsappAccountId, 'message:new', { conversationId: recipient.conversationId, message: msg });
      }
    } catch (err) { this.logger.error(`Campaign recipient ${recipient.id} sent but message persistence failed: ${err}`); }

    await this.markRecipientSent(recipient.id, recipient.campaignId, sentMessageId);
  }

  private async markRecipientSent(recipientId: string, campaignId: string, sentMessageId: string | null) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.crud.prisma.campaignRecipient.update({ where: { id: recipientId }, data: { status: CampaignRecipientStatus.sent, sentMessageId, sentAt: new Date() } });
        await this.crud.refreshCampaignCompletion(campaignId);
        return;
      } catch (err) {
        if (attempt === 3) {
          this.logger.error(`Campaign recipient ${recipientId} DELIVERED but could not be marked sent after ${attempt} attempts: ${err}. Recipient remains in \`sending\`; do NOT re-send it.`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
}
