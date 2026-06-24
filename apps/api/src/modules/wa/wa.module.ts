import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WaController } from './wa.controller';
import { WaService } from './wa.service';
import { WahaClientService } from './waha-client.service';
import { WahaEventService, WaServiceRef } from './waha-event.service';
import { WaRateLimiter } from './wa-rate-limiter';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService } from './wa-mirror.service';
import { ContactSyncService } from './contact-sync.service';
import { MessageIngestService } from './message-ingest.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { HermesModule } from '../hermes/hermes.module';
import { SettingsModule } from '../settings/settings.module';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AiModule,
    HermesModule,
    SettingsModule,
    AssetsModule,
  ],
  controllers: [WaController],
  providers: [
    WahaClientService,
    WaRateLimiter,
    WaService,
    {
      provide: WaServiceRef,
      useExisting: WaService,
    },
    WahaEventService,
    WaInboundService,
    WaMirrorService,
    ContactSyncService,
    MessageIngestService,
  ],
  exports: [WaService, WahaClientService],
})
export class WaModule {}
