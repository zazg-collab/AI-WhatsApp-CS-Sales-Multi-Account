import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotImplemented } from '../../common/not-implemented';

// PRD 14.3 — Conversations.
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  @Get()
  list() {
    return NotImplemented('conversations.list');
  }

  @Get(':id')
  get(@Param('id') _id: string) {
    return NotImplemented('conversations.get');
  }

  @Post(':id/send')
  send(@Param('id') _id: string) {
    return NotImplemented('conversations.send');
  }

  @Post(':id/takeover')
  takeover(@Param('id') _id: string) {
    return NotImplemented('conversations.takeover');
  }

  @Post(':id/return-to-ai')
  returnToAi(@Param('id') _id: string) {
    return NotImplemented('conversations.returnToAi');
  }

  @Patch(':id/ai-mode')
  setAiMode(@Param('id') _id: string) {
    return NotImplemented('conversations.setAiMode');
  }
}
