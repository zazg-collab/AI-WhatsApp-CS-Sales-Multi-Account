import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditModule } from '../audit/audit.module';
import { WaModule } from '../wa/wa.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsProcessor } from './campaigns.processor';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'campaigns' }),
    AuditModule,
    WaModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignsProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}
