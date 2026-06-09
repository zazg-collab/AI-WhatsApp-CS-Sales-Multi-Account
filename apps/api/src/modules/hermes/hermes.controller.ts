import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { HermesService } from './hermes.service';
import { ReviewReplyDto, ConversationActionDto } from './dto/hermes.dto';

// PRD 14.5 + section 8 — Hermes supervisor.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hermes')
export class HermesController {
  constructor(private readonly hermes: HermesService) {}

  @Post('review-reply')
  reviewReply(@Body() dto: ReviewReplyDto) {
    return this.hermes.review(dto.conversationId, dto.draftText);
  }

  @Get('alerts')
  alerts() {
    return this.hermes.alerts();
  }

  @Get('reports/daily')
  dailyReport() {
    return this.hermes.dailyReport();
  }

  @Get('bot-performance')
  botPerformance() {
    return this.hermes.botPerformance();
  }

  @Get('knowledge-gaps')
  knowledgeGaps() {
    return this.hermes.knowledgeGaps();
  }

  @Roles('owner', 'supervisor')
  @Post('approve')
  approve(@Body() dto: ConversationActionDto) {
    return this.hermes.approve(dto.conversationId);
  }

  @Roles('owner', 'supervisor')
  @Post('block')
  block(@Body() dto: ConversationActionDto) {
    return this.hermes.block(dto.conversationId);
  }
}
