import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { LearningMinerService } from './learning-miner.service';
import { requestContext } from '../../common/request-context';

@Processor('learning-mine', { concurrency: 1 })
export class LearningMineProcessor extends WorkerHost {
  private readonly logger = new Logger(LearningMineProcessor.name);

  constructor(private readonly miner: LearningMinerService) {
    super();
  }

  async process(job: Job) {
    const { botId, requestId } = job.data as { botId: string; requestId?: string };
    return requestContext.run({ requestId }, async () => {
      this.logger.log(`Mining bot ${botId} (job ${job.id})`);
      return this.miner.mineAll(botId);
    });
  }
}
