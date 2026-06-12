import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { FollowUpsService } from './followups.service';

@Processor('follow-ups')
export class FollowUpsProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpsProcessor.name);

  constructor(private readonly followUpsService: FollowUpsService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'send-followup') {
      const { followUpId } = job.data as { followUpId: string };
      this.logger.log(`Processing follow-up job: ${followUpId}`);
      await this.followUpsService.processJob(followUpId);
    }
  }
}
