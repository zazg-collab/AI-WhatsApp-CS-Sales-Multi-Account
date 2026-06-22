import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SlaService } from './sla.service';

@Processor('sla', { concurrency: 2 })
export class SlaProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaProcessor.name);

  constructor(private readonly sla: SlaService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'scan') {
      await this.sla.scan();
    }
  }
}
