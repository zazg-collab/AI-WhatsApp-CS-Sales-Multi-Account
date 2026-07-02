import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { SentinelService } from './sentinel.service';
import { AskDto } from './dto/sentinel.dto';

// PRD 14.5 + section 8 — Sentinel supervisor (formerly "Hermes" in-app; the
// Hermes Agent / Nous Research CLI integration is unrelated and unchanged).
@ApiTags('sentinel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sentinel')
export class SentinelController {
  constructor(private readonly sentinel: SentinelService) {}

  @ApiOperation({ summary: 'Get recent Sentinel alerts' })
  @Roles('viewer')
  @Get('alerts')
  alerts() {
    return this.sentinel.alerts();
  }

  @ApiOperation({ summary: 'Get daily Sentinel report' })
  @Roles('viewer')
  @Get('reports/daily')
  dailyReport() {
    return this.sentinel.dailyReport();
  }

  @ApiOperation({ summary: 'Live performance snapshot across all chatbots' })
  @Roles('viewer')
  @Get('snapshot')
  snapshot() {
    return this.sentinel.performanceSnapshot();
  }

  @ApiOperation({ summary: 'Ask Sentinel supervisor about chatbot performance' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('ask')
  ask(@Body() dto: AskDto) {
    return this.sentinel.ask(dto.question);
  }

  @ApiOperation({ summary: 'Deep-dive analysis and recommendations for one bot' })
  @Roles('viewer')
  @Get('bot/:botId/insight')
  botInsight(@Param('botId') botId: string) {
    return this.sentinel.botInsight(botId);
  }

  @ApiOperation({ summary: 'Get knowledge gaps detected by Sentinel' })
  @Roles('viewer')
  @Get('knowledge-gaps')
  knowledgeGaps() {
    return this.sentinel.knowledgeGaps();
  }

}
