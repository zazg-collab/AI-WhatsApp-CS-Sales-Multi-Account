import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LearningMinerService } from './learning-miner.service';
import { LearningReviewService } from './learning-review.service';

@Module({
  imports: [AiModule],
  controllers: [LearningController],
  providers: [LearningService, LearningMinerService, LearningReviewService],
  exports: [LearningService],
})
export class LearningModule {}
