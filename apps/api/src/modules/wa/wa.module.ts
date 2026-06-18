import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WaController } from './wa.controller';
import { MediaController } from './media.controller';
import { WaService } from './wa.service';
import { WaSessionStore } from './wa-session.store';
import { WaSendService } from './wa-send.service';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService } from './wa-mirror.service';
import { MessageIngestService } from './message-ingest.service';
import { AutoAssignService } from './auto-assign.service';
import { ContactSyncService } from './contact-sync.service';
import { AiModule } from '../ai/ai.module';
import { HermesModule } from '../hermes/hermes.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [ScheduleModule.forRoot(), AiModule, HermesModule, MediaModule],
  controllers: [WaController, MediaController],
  providers: [
    WaSessionStore,
    WaSendService,
    WaInboundService,
    WaMirrorService,
    WaService,
    MessageIngestService,
    AutoAssignService,
    ContactSyncService,
  ],
  exports: [WaService, ContactSyncService],
})
export class WaModule {}
