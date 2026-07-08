import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { AiModeDto } from './dto/ai-mode.dto';
import { SetBotDto } from './dto/set-bot.dto';
import { ConversationStatusDto } from './dto/conversation-status.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { LabelsDto } from './dto/labels.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AiMode, ConversationStatus } from '@hermes/database';
import { csvRow } from '../../common/csv.util';

// PRD 14.3 — Conversations: reads, CSV export, and conversation-level state
// (workflow status, AI mode, bot, assignment, labels). Message-scoped actions
// live in ConversationMessagesController; chat operations + lifecycle live in
// ConversationChatOpsController. The greedy single-segment `@Get(':id')` and
// `@Patch(':id')` routes are kept here, after their specific siblings, so route
// matching order is preserved.
@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @ApiOperation({ summary: 'Export conversations as CSV' })
  @Roles('viewer')
  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Query('accountId') accountId: string | undefined,
    @Query('aiMode') aiMode: AiMode | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const items = await this.conversations.exportList({ accountId, aiMode, from, to, user });
    const header = 'id,customerName,customerPhone,aiMode,status,messageCount,lastMessageAt,leadStage\n';
    const rows = items.map((c) => csvRow([
      c.id,
      c.customer?.name ?? '',
      c.customer?.phoneNumber ?? '',
      c.aiMode,
      c.takeoverStatus,
      c._count?.messages ?? 0,
      c.lastMessageAt?.toISOString() ?? '',
      c.customer?.leadStage ?? '',
    ])).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="conversations.csv"');
    res.send(header + rows);
  }

  @ApiOperation({ summary: 'Total number of conversations with unread messages' })
  @Roles('viewer')
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.conversations.unreadCount(user);
  }

  @ApiOperation({ summary: 'List conversations with optional filters' })
  @Roles('viewer')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('accountId') accountId?: string,
    @Query('aiMode') aiMode?: AiMode,
    @Query('status') status?: ConversationStatus,
    @Query('assignedAdminId') assignedAdminId?: string,
    @Query('label') label?: string,
    @Query('search') search?: string,
    @Query('needsAttention') needsAttention?: string,
    @Query('excludeGroups') excludeGroups?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (status && !Object.values(ConversationStatus).includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    return this.conversations.list({
      accountId,
      aiMode,
      status,
      assignedAdminId,
      label,
      search,
      needsAttention: needsAttention === 'true',
      excludeGroups: excludeGroups === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      user,
    });
  }

  @ApiOperation({ summary: 'Search messages inside one conversation' })
  @Roles('viewer')
  @Get(':id/messages/search')
  searchMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.searchMessages(id, q ?? '', limit ? parseInt(limit, 10) : 50, user);
  }

  @ApiOperation({ summary: 'Get a conversation with its most recent messages' })
  @Roles('viewer')
  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('messageLimit') messageLimit?: string,
  ) {
    return this.conversations.get(
      id,
      messageLimit ? parseInt(messageLimit, 10) : 100,
      user,
    );
  }

  @ApiOperation({ summary: 'Load older messages (cursor-based, for infinite scroll)' })
  @Roles('viewer')
  @Get(':id/messages')
  getMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.getMessages(id, {
      before,
      limit: limit ? parseInt(limit, 10) : 50,
    }, user);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/ai-mode')
  setAiMode(@Param('id') id: string, @Body() dto: AiModeDto, @CurrentUser() user: AuthUser) {
    return this.conversations.setAiMode(id, dto.aiMode, user);
  }

  @ApiOperation({ summary: 'Switch the bot/persona used for this conversation (null = account default)' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/bot')
  setBot(@Param('id') id: string, @Body() dto: SetBotDto, @CurrentUser() user: AuthUser) {
    return this.conversations.setBot(id, dto.botId, user.id, user);
  }

  @ApiOperation({ summary: 'Set conversation workflow status (open/pending/resolved)' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: ConversationStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setStatus(id, dto.status, user.id, user);
  }

  @ApiOperation({ summary: 'Assign a conversation to an admin (null = unassign)' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.assign(id, dto.adminId ?? null, user.id, user);
  }

  @ApiOperation({ summary: 'Replace a conversation\'s custom labels' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/labels')
  setLabels(
    @Param('id') id: string,
    @Body() dto: LabelsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setLabels(id, dto.labels, user.id, user);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto, @CurrentUser() user: AuthUser) {
    return this.conversations.update(id, dto, user);
  }
}
