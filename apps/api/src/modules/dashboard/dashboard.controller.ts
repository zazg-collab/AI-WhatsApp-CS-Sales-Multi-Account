import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary() {
    return this.dashboardService.getSummary();
  }

  @Get('lead-funnel')
  getLeadFunnel() {
    return this.dashboardService.getLeadFunnel();
  }

  @Get('message-volume')
  getMessageVolume(@Query('days') days = '7') {
    return this.dashboardService.getMessageVolume(parseInt(days, 10));
  }

  @Get('ai-mode-breakdown')
  getAiModeBreakdown() {
    return this.dashboardService.getAiModeBreakdown();
  }

  @Get('performance')
  getPerformance(@Query('days') days = '7') {
    return this.dashboardService.getPerformanceOverview(parseInt(days, 10));
  }

  @Get('performance/response-time')
  getResponseTime(@Query('days') days = '7') {
    return this.dashboardService.getResponseTime(parseInt(days, 10));
  }

  @Get('performance/ai-quality')
  getAiQuality(@Query('days') days = '7') {
    return this.dashboardService.getAiQuality(parseInt(days, 10));
  }

  @Get('performance/campaigns')
  getCampaignPerformance(@Query('days') days = '7') {
    return this.dashboardService.getCampaignPerformance(parseInt(days, 10));
  }
}
