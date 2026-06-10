import { Module } from '@nestjs/common';
import { WaController } from './wa.controller';
import { MediaController } from './media.controller';
import { WaService } from './wa.service';
import { MessageIngestService } from './message-ingest.service';
import { AiModule } from '../ai/ai.module';
import { HermesModule } from '../hermes/hermes.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [AiModule, HermesModule, MediaModule],
  controllers: [WaController, MediaController],
  providers: [WaService, MessageIngestService],
  exports: [WaService],
})
export class WaModule {}
