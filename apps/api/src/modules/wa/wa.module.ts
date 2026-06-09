import { Module } from '@nestjs/common';
import { WaController } from './wa.controller';
import { WaService } from './wa.service';
import { MessageIngestService } from './message-ingest.service';
import { AiModule } from '../ai/ai.module';
import { HermesModule } from '../hermes/hermes.module';

@Module({
  imports: [AiModule, HermesModule],
  controllers: [WaController],
  providers: [WaService, MessageIngestService],
  exports: [WaService],
})
export class WaModule {}
