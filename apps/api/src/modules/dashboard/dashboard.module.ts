import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ClosingAnalyticsService } from './closing-analytics.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, ClosingAnalyticsService],
  exports: [DashboardService, ClosingAnalyticsService],
})
export class DashboardModule {}
