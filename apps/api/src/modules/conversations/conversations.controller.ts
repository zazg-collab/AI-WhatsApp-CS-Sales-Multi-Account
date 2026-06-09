import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { AiModeDto } from './dto/ai-mode.dto';
import { AiMode } from '@hermes/database';

// PRD 14.3 — Conversations.
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get('export')
  async export(
    @Query('accountId') accountId: string | undefined,
    @Query('aiMode') aiMode: AiMode | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const items = await this.conversations.exportList({ accountId, aiMode, from, to });
    const header = 'id,customerName,customerPhone,aiMode,status,messageCount,lastMessageAt,leadStage\n';
    const rows = items.map((c) => [
      c.id,
      `"${(c.customer?.name ?? '').replace(/"/g, '""')}"`,
      c.customer?.phoneNumber ?? '',
      c.aiMode,
      c.takeoverStatus,
      c._count?.messages ?? 0,
      c.lastMessageAt?.toISOString() ?? '',
      c.customer?.leadStage ?? '',
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="conversations.csv"');
    res.send(header + rows);
  }

  @Get()
  list(
    @Query('accountId') accountId?: string,
    @Query('aiMode') aiMode?: AiMode,
    @Query('search') search?: string,
    @Query('needsAttention') needsAttention?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.list({
      accountId,
      aiMode,
      search,
      needsAttention: needsAttention === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @Query('messagePage') messagePage?: string,
    @Query('messageLimit') messageLimit?: string,
  ) {
    return this.conversations.get(
      id,
      messagePage ? parseInt(messagePage, 10) : 1,
      messageLimit ? parseInt(messageLimit, 10) : 100,
    );
  }

  @Post(':id/messages')
  send(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.send(id, user.id, dto.text);
  }

  // Legacy endpoint kept for compatibility
  @Post(':id/send')
  sendLegacy(
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { aiMode?: AiMode }) {
    return this.conversations.update(id, dto);
  }

  @Post(':id/media')
  sendMedia(
    @Param('id') id: string,
    @Body() dto: { mediaType: 'image' | 'document' | 'audio' | 'video'; url: string; caption?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.sendMedia(id, user.id, dto.mediaType, dto.url, dto.caption);
  }
}
