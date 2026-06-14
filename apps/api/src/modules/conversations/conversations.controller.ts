import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ApproveDraftDto } from './dto/approve-draft.dto';
import { AiModeDto } from './dto/ai-mode.dto';
import { ConversationStatusDto } from './dto/conversation-status.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { LabelsDto } from './dto/labels.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { ReactionDto, EditMessageDto, ValidateNumberDto } from './dto/message-actions.dto';
import { AiMode, ConversationStatus } from '@hermes/database';
import { csvRow } from '../../common/csv.util';

// PRD 14.3 — Conversations.
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
    @Query('accountId') accountId: string | undefined,
    @Query('aiMode') aiMode: AiMode | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const items = await this.conversations.exportList({ accountId, aiMode, from, to });
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

  @ApiOperation({ summary: 'Start/open a chat with any phone number (WhatsApp-desktop style)' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('start')
  start(@Body() dto: StartConversationDto, @CurrentUser() user: AuthUser) {
    return this.conversations.startConversation(dto.accountId, dto.phoneNumber, dto.name, user.id);
  }

  @ApiOperation({ summary: 'Check if a phone number is registered on WhatsApp' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('validate-number')
  validateNumber(@Body() dto: ValidateNumberDto) {
    return this.conversations.validateNumber(dto.accountId, dto.phoneNumber);
  }

  @ApiOperation({ summary: 'React to a message with an emoji (empty clears)' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/messages/:messageId/react')
  react(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.reactToMessage(id, messageId, dto.emoji, user.id);
  }

  @ApiOperation({ summary: 'Edit a message you sent' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/messages/:messageId')
  editMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.editMessage(id, messageId, dto.text, user.id);
  }

  @ApiOperation({ summary: 'Delete a message for everyone (revoke)' })
  @Roles('admin', 'supervisor', 'owner')
  @Delete(':id/messages/:messageId')
  deleteMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.deleteMessage(id, messageId, user.id);
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
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      user,
    });
  }

  @ApiOperation({ summary: 'Search messages inside one conversation' })
  @Roles('viewer')
  @Get(':id/messages/search')
  searchMessages(
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.searchMessages(id, q ?? '', limit ? parseInt(limit, 10) : 50);
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
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.getMessages(id, {
      before,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/messages')
  send(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.send(id, user.id, dto.text, dto.quotedMessageId);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/send')
  sendLegacy(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.send(id, user.id, dto.text);
  }

  @ApiOperation({ summary: 'Approve & send a supervised AI draft' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/messages/:messageId/approve')
  approveDraft(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ApproveDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.approveDraft(id, messageId, user.id, dto.text);
  }

  @ApiOperation({ summary: 'Block/discard a supervised AI draft' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/messages/:messageId/block')
  blockDraft(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.blockDraft(id, messageId, user.id);
  }

  @ApiOperation({ summary: 'Mark customer messages as read (WhatsApp blue ticks)' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.conversations.markRead(id);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/takeover')
  takeover(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.takeover(id, user.id);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/return-to-ai')
  returnToAi(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.returnToAi(id, user.id);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/ai-mode')
  setAiMode(@Param('id') id: string, @Body() dto: AiModeDto) {
    return this.conversations.setAiMode(id, dto.aiMode);
  }

  @ApiOperation({ summary: 'Set conversation workflow status (open/pending/resolved)' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: ConversationStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setStatus(id, dto.status, user.id);
  }

  @ApiOperation({ summary: 'Assign a conversation to an admin (null = unassign)' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.assign(id, dto.adminId ?? null, user.id);
  }

  @ApiOperation({ summary: 'Replace a conversation\'s custom labels' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/labels')
  setLabels(
    @Param('id') id: string,
    @Body() dto: LabelsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setLabels(id, dto.labels, user.id);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversations.update(id, dto);
  }

  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/media')
  sendMedia(
    @Param('id') id: string,
    @Body() dto: SendMediaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.sendMedia(id, user.id, dto.mediaType, dto.url, dto.caption);
  }

  @ApiOperation({ summary: 'Upload & send a media file from the admin device' })
  @ApiConsumes('multipart/form-data')
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/media/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // A10: actually honour WA_MEDIA_MAX_BYTES (decorators can't use
      // ConfigService, so read the env directly; default 25MB).
      limits: { fileSize: Number(process.env.WA_MEDIA_MAX_BYTES) || 25 * 1024 * 1024 },
    }),
  )
  uploadMedia(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname?: string } | undefined,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    return this.conversations.sendUploadedMedia(id, user.id, file, caption);
  }
}
