import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WaController } from './wa.controller';
import { WaOpsController } from './wa-ops.controller';
import { MediaController } from './media.controller';
import { WaService } from './wa.service';
import { WaSessionStore } from './wa-session.store';
import { WaGatewayService } from './wa-gateway.service';
import { WaRateLimiter } from './wa-rate-limiter';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService } from './wa-mirror.service';
import { ContactSyncService } from './contact-sync.service';
import { MessageIngestService } from './message-ingest.service';
import { AutoAssignService } from './auto-assign.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SentinelModule } from '../sentinel/sentinel.module';
import { SettingsModule } from '../settings/settings.module';
import { AssetsModule } from '../assets/assets.module';
import { MediaModule } from '../media/media.module';
import { LearningModule } from '../learning/learning.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AiModule,
    SentinelModule,
    SettingsModule,
    MediaModule,
    forwardRef(() => AssetsModule),
    LearningModule,
    WebhooksModule,
  ],
  controllers: [WaController, WaOpsController, MediaController],
  providers: [
    WaSessionStore,
    WaGatewayService,
    WaRateLimiter,
    WaService,
    WaInboundService,
    WaMirrorService,
    ContactSyncService,
    AutoAssignService,
    MessageIngestService,
  ],
  exports: [WaService, WaGatewayService, ContactSyncService],
})
export class WaModule {}
