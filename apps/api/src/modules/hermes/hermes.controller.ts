import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { NotImplemented } from '../../common/not-implemented';

// PRD 14.5 + section 8 — Hermes supervisor. Decision schema in PRD 15.2.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hermes')
export class HermesController {
  @Post('review-reply')
  reviewReply() {
    return NotImplemented('hermes.reviewReply');
  }

  @Get('alerts')
  alerts() {
    return NotImplemented('hermes.alerts');
  }

  @Get('reports/daily')
  dailyReport() {
    return NotImplemented('hermes.dailyReport');
  }

  @Get('bot-performance')
  botPerformance() {
    return NotImplemented('hermes.botPerformance');
  }

  @Get('knowledge-gaps')
  knowledgeGaps() {
    return NotImplemented('hermes.knowledgeGaps');
  }

  @Roles('owner', 'supervisor')
  @Post('approve')
  approve() {
    return NotImplemented('hermes.approve');
  }

  @Roles('owner', 'supervisor')
  @Post('block')
  block() {
    return NotImplemented('hermes.block');
  }
}
