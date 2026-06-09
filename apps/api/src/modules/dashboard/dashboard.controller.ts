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
}
