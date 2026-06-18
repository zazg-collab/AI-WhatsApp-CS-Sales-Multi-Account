import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditModule } from '../audit/audit.module';
import { WaModule } from '../wa/wa.module';
import { MediaModule } from '../media/media.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsProcessor } from './campaigns.processor';
import { CampaignsService } from './campaigns.service';
import { CampaignCrudService } from './campaign-crud.service';
import { CampaignQueueService } from './campaign-queue.service';
import { CampaignSendService } from './campaign-send.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'campaigns' }),
    AuditModule,
    WaModule,
    MediaModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignCrudService, CampaignQueueService, CampaignSendService, CampaignsProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}
