import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: 'Get dashboard summary stats' })
  @Get('summary')
  getSummary() {
    return this.dashboardService.getSummary();
  }

  @ApiOperation({ summary: 'Get lead funnel breakdown' })
  @Get('lead-funnel')
  getLeadFunnel() {
    return this.dashboardService.getLeadFunnel();
  }

  @ApiOperation({ summary: 'Get message volume over time' })
  @Get('message-volume')
  getMessageVolume(@Query('days') days = '7') {
    return this.dashboardService.getMessageVolume(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get AI mode breakdown across conversations' })
  @Get('ai-mode-breakdown')
  getAiModeBreakdown() {
    return this.dashboardService.getAiModeBreakdown();
  }

  @ApiOperation({ summary: 'Get performance overview' })
  @Get('performance')
  getPerformance(@Query('days') days = '7') {
    return this.dashboardService.getPerformanceOverview(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get response time metrics' })
  @Get('performance/response-time')
  getResponseTime(@Query('days') days = '7') {
    return this.dashboardService.getResponseTime(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get AI quality metrics' })
  @Get('performance/ai-quality')
  getAiQuality(@Query('days') days = '7') {
    return this.dashboardService.getAiQuality(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get campaign performance metrics' })
  @Get('performance/campaigns')
  getCampaignPerformance(@Query('days') days = '7') {
    return this.dashboardService.getCampaignPerformance(parseInt(days, 10));
  }
}
