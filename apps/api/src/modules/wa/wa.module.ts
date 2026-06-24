import { Module } from '@nestjs/common';
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
import { WahaClientService } from './waha-client.service';
import { WaRateLimiter } from './wa-rate-limiter';
import { AiModule } from '../ai/ai.module';
import { HermesModule } from '../hermes/hermes.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [AiModule, HermesModule, MediaModule],
  controllers: [WaController, MediaController],
  providers: [
    WahaClientService,
    WaRateLimiter,
    WaSessionStore,
    WaSendService,
    WaInboundService,
    WaMirrorService,
    WaService,
    MessageIngestService,
    AutoAssignService,
    ContactSyncService,
  ],
  exports: [WaService, ContactSyncService, WahaClientService],
})
export class WaModule {}
