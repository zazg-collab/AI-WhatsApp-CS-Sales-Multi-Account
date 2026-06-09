import { Module } from '@nestjs/common';
import { HermesController } from './hermes.controller';
import { HermesService } from './hermes.service';
import { HermesAgentClient } from './hermes-agent.client';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [HermesController],
  providers: [HermesService, HermesAgentClient],
  exports: [HermesService],
})
export class HermesModule {}
