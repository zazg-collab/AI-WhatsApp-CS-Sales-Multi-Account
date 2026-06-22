import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { DashboardService } from './dashboard.service';
import { ClosingAnalyticsService } from './closing-analytics.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly closingAnalytics: ClosingAnalyticsService,
  ) {}

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

  // Integration note: API-only drill-downs. The monitoring page reads the
  // aggregate GET /dashboard/performance, which already embeds these metrics.
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Get response time metrics' })
  @Get('performance/response-time')
  getResponseTime(@Query('days') days = '7') {
    return this.dashboardService.getResponseTime(parseInt(days, 10));
  }

  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Get AI quality metrics' })
  @Get('performance/ai-quality')
  getAiQuality(@Query('days') days = '7') {
    return this.dashboardService.getAiQuality(parseInt(days, 10));
  }

  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Get campaign performance metrics' })
  @Get('performance/campaigns')
  getCampaignPerformance(@Query('days') days = '7') {
    return this.dashboardService.getCampaignPerformance(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get per-admin workload report (supervisor/owner only)' })
  @UseGuards(RolesGuard)
  @Roles('supervisor', 'owner')
  @Get('admin-workload')
  getAdminWorkload(@Query('days') days = '7') {
    return this.dashboardService.getAdminWorkload(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get funnel conversion rates (stage population + resolved rate)' })
  @Get('closing/funnel')
  getFunnelConversion(@Query('days') days = '30') {
    return this.closingAnalytics.getFunnelConversion(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get revenue/close attribution per bot' })
  @Get('closing/bot-attribution')
  getBotAttribution(@Query('days') days = '30') {
    return this.closingAnalytics.getBotAttribution(parseInt(days, 10));
  }

  @ApiOperation({ summary: 'Get win/loss breakdown for resolved conversations' })
  @Get('closing/win-loss')
  getWinLoss(@Query('days') days = '30') {
    return this.closingAnalytics.getWinLoss(parseInt(days, 10));
  }
}
