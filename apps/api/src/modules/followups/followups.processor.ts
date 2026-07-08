import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { FollowUpsService } from './followups.service';
import { requestContext } from '../../common/request-context';

@Processor('follow-ups', { concurrency: 5 })
export class FollowUpsProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpsProcessor.name);

  constructor(private readonly followUpsService: FollowUpsService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'send-followup') {
      const { followUpId, requestId } = job.data as { followUpId: string; requestId?: string };
      await requestContext.run({ requestId }, async () => {
        this.logger.log(`Processing follow-up job: ${followUpId}`);
        await this.followUpsService.processJob(followUpId);
      });
    }
  }
}
