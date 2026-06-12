import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SlaService } from './sla.service';
import { SlaProcessor } from './sla.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'sla' })],
  providers: [SlaService, SlaProcessor],
  exports: [SlaService],
})
export class SlaModule {}
