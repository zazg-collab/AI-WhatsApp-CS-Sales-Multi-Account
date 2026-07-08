import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SlaService } from './sla.service';
import { SlaProcessor } from './sla.processor';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'sla' }), WebhooksModule],
  providers: [SlaService, SlaProcessor],
  exports: [SlaService],
})
export class SlaModule {}
