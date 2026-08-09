import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { SentinelModule } from '../sentinel/sentinel.module';
import { ReplyPipelineService } from './reply-pipeline.service';

/**
 * >>> ANGGA — F3a (2026-08-09, cowork): rumah otak balasan. Di-import
 * `WaModule` (adapter WhatsApp) dan nanti `TestHarnessModule` (adapter UI). <<<
 */
@Module({
  imports: [PrismaModule, AiModule, SentinelModule],
  providers: [ReplyPipelineService],
  exports: [ReplyPipelineService],
})
export class ReplyModule {}
