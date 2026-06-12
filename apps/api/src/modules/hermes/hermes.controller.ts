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
import { HermesService } from './hermes.service';
import {
  ReviewReplyDto,
  ConversationActionDto,
  AskDto,
} from './dto/hermes.dto';

// PRD 14.5 + section 8 — Hermes supervisor.
@ApiTags('hermes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hermes')
export class HermesController {
  constructor(private readonly hermes: HermesService) {}

  @ApiOperation({ summary: 'Review a draft reply through Hermes supervisor' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('review-reply')
  reviewReply(@Body() dto: ReviewReplyDto) {
    return this.hermes.review(dto.conversationId, dto.draftText);
  }

  @ApiOperation({ summary: 'Get recent Hermes alerts' })
  @Roles('viewer')
  @Get('alerts')
  alerts() {
    return this.hermes.alerts();
  }

  @ApiOperation({ summary: 'Get daily Hermes report' })
  @Roles('viewer')
  @Get('reports/daily')
  dailyReport() {
    return this.hermes.dailyReport();
  }

  @ApiOperation({ summary: 'Get bot performance metrics' })
  @Roles('viewer')
  @Get('bot-performance')
  botPerformance() {
    return this.hermes.botPerformance();
  }

  @ApiOperation({ summary: 'Live performance snapshot across all chatbots' })
  @Roles('viewer')
  @Get('snapshot')
  snapshot() {
    return this.hermes.performanceSnapshot();
  }

  @ApiOperation({ summary: 'Ask Hermes supervisor about chatbot performance' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('ask')
  ask(@Body() dto: AskDto) {
    return this.hermes.ask(dto.question);
  }

  @ApiOperation({ summary: 'Deep-dive analysis and recommendations for one bot' })
  @Roles('viewer')
  @Get('bot/:botId/insight')
  botInsight(@Param('botId') botId: string) {
    return this.hermes.botInsight(botId);
  }

  @ApiOperation({ summary: 'Get knowledge gaps detected by Hermes' })
  @Roles('viewer')
  @Get('knowledge-gaps')
  knowledgeGaps() {
    return this.hermes.knowledgeGaps();
  }

  @ApiOperation({ summary: 'Approve a supervised conversation reply' })
  @Roles('owner', 'supervisor')
  @Post('approve')
  approve(@Body() dto: ConversationActionDto) {
    return this.hermes.approve(dto.conversationId);
  }

  @ApiOperation({ summary: 'Block a conversation reply' })
  @Roles('owner', 'supervisor')
  @Post('block')
  block(@Body() dto: ConversationActionDto) {
    return this.hermes.block(dto.conversationId);
  }
}
