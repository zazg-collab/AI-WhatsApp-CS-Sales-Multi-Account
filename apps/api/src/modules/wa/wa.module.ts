import { Module } from '@nestjs/common';
import { WaController } from './wa.controller';
import { WaService } from './wa.service';
import { MessageIngestService } from './message-ingest.service';

@Module({
  controllers: [WaController],
  providers: [WaService, MessageIngestService],
  exports: [WaService],
})
export class WaModule {}
