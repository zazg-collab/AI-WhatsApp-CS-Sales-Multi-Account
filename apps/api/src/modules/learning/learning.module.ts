import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LearningMinerService } from './learning-miner.service';
import { LearningMineProcessor } from './learning-mine.processor';
import { LearningReviewService } from './learning-review.service';

@Module({
  imports: [AiModule, BullModule.registerQueue({ name: 'learning-mine' })],
  controllers: [LearningController],
  providers: [LearningService, LearningMinerService, LearningMineProcessor, LearningReviewService],
  exports: [LearningService, LearningMinerService],
})
export class LearningModule {}
