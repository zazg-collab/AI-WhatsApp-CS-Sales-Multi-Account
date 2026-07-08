import { Module } from '@nestjs/common';
import { SentinelController } from './sentinel.controller';
import { SentinelService } from './sentinel.service';
import { HermesAgentClient } from './hermes-agent.client';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [SentinelController],
  providers: [SentinelService, HermesAgentClient],
  exports: [SentinelService],
})
export class SentinelModule {}
