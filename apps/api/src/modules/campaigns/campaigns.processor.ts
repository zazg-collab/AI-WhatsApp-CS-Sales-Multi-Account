import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CampaignsService } from './campaigns.service';

@Processor('campaigns')
export class CampaignsProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignsProcessor.name);

  constructor(private readonly campaignsService: CampaignsService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'send-recipient') return;
    const { recipientId } = job.data as { recipientId: string };
    this.logger.log(`Processing campaign recipient ${recipientId}`);
    await this.campaignsService.processRecipient(recipientId);
  }
}
