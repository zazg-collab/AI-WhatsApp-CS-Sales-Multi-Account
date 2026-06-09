import { Module } from '@nestjs/common';
import { HermesController } from './hermes.controller';
import { HermesService } from './hermes.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [HermesController],
  providers: [HermesService],
  exports: [HermesService],
})
export class HermesModule {}
