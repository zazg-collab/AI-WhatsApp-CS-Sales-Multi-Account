import { Injectable } from '@nestjs/common';
import { type ScopedUser } from '../../common/account-scope.util';
import { CampaignCrudService, CandidateTarget } from './campaign-crud.service';
import { CampaignQueueService } from './campaign-queue.service';
import { CampaignSendService } from './campaign-send.service';
import { CreateCampaignDto, CampaignTargetFilterDto, UpdateCampaignDto } from './dto/campaigns.dto';

export { CandidateTarget };

export const BLOCKED_TAGS = ['opt_out', 'blocked', 'do_not_contact'];

/** Thin facade — controller and processor depend on this. */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly crud: CampaignCrudService,
    private readonly queue: CampaignQueueService,
    private readonly send: CampaignSendService,
  ) {}

  list(status?: string, user?: ScopedUser) { return this.crud.list(status, user); }
  get(id: string, user?: ScopedUser) { return this.crud.get(id, user); }
  preview(whatsappAccountId: string, targetFilter: CampaignTargetFilterDto) { return this.crud.preview(whatsappAccountId, targetFilter); }
  create(dto: CreateCampaignDto, userId: string) { return this.crud.create(dto, userId); }
  update(id: string, dto: UpdateCampaignDto, userId: string) { return this.crud.update(id, dto, userId); }
  submit(id: string, userId: string) { return this.crud.submit(id, userId); }
  approve(id: string, userId: string) { return this.crud.approve(id, userId); }
  pause(id: string, userId: string) { return this.crud.pause(id, userId); }
  cancel(id: string, userId: string) { return this.crud.cancel(id, userId); }
  retryFailed(id: string, userId: string) { return this.crud.retryFailed(id, userId); }
  duplicate(id: string, userId: string) { return this.crud.duplicate(id, userId); }
  optOut(customerId: string, userId: string) { return this.crud.optOut(customerId, userId); }
  optIn(customerId: string, userId: string) { return this.crud.optIn(customerId, userId); }
  listOptedOut(page?: number, pageSize?: number) { return this.crud.listOptedOut(page, pageSize); }

  start(id: string, userId?: string) {
    // Queues recipients with idempotent jobId: `campaign-recipient-${recipient.id}`
    return this.queue.start(id, userId);
  }
  runScheduledCampaigns() { return this.queue.runScheduledCampaigns(); }

  processRecipient(recipientId: string) {
    // Delegated to send.service; skips if recipient.status !== CampaignRecipientStatus.queued
    return this.send.processRecipient(recipientId);
  }

  isCampaignStatus(status: string) {
    return this.crud.isCampaignStatus(status);
  }
}
