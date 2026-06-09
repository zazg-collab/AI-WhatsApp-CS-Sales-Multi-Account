import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { AiModeDto } from './dto/ai-mode.dto';

// PRD 14.3 — Conversations.
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@Query('accountId') accountId?: string) {
    return this.conversations.list(accountId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.conversations.get(id);
  }

  @Post(':id/send')
  send(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.send(id, user.id, dto.text);
  }

  @Post(':id/takeover')
  takeover(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.takeover(id, user.id);
  }

  @Post(':id/return-to-ai')
  returnToAi(@Param('id') id: string) {
    return this.conversations.returnToAi(id);
  }

  @Patch(':id/ai-mode')
  setAiMode(@Param('id') id: string, @Body() dto: AiModeDto) {
    return this.conversations.setAiMode(id, dto.aiMode);
  }
}
