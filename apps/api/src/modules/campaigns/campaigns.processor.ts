import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CampaignsService } from './campaigns.service';
import { requestContext } from '../../common/request-context';

@Processor('campaigns', { concurrency: 5 })
export class CampaignsProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignsProcessor.name);

  constructor(private readonly campaignsService: CampaignsService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'send-recipient') return;
    const { recipientId, requestId } = job.data as { recipientId: string; requestId?: string };
    // Restore the requestId of the HTTP call that started the campaign so log
    // lines emitted while sending correlate back to it.
    await requestContext.run({ requestId }, async () => {
      this.logger.log(`Processing campaign recipient ${recipientId}`);
      await this.campaignsService.processRecipient(recipientId);
    });
  }
}
