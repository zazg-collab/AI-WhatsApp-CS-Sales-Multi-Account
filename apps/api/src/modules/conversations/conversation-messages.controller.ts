import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ConversationMessagingService } from './conversation-messaging.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ApproveDraftDto } from './dto/approve-draft.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { ReactionDto, EditMessageDto } from './dto/message-actions.dto';
import { ForwardMessageDto, SendContactDto, SendLocationDto } from './dto/wa-actions.dto';
import { SendPollDto } from './dto/send-poll.dto';

/**
 * Message-scoped + content-sending endpoints for a conversation.
 * Split out of ConversationsController (PRD 14.3). All routes here are
 * multi-segment `:id/...` paths, so they never collide with the greedy
 * single-segment `:id` routes that remain in ConversationsController.
 */
@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conversations')
export class ConversationMessagesController {
  constructor(private readonly conversations: ConversationMessagingService) {}

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

  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/messages')
  send(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.send(id, user.id, dto.text, dto.quotedMessageId);
  }

  // ponytail: legacy alias for POST :id/messages without quotedMessageId support — kept for any existing integrations
  @ApiExcludeEndpoint()
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

  @ApiOperation({ summary: 'Send a WhatsApp location message' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/location')
  sendLocation(
    @Param('id') id: string,
    @Body() dto: SendLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.sendLocation(id, user.id, dto.latitude, dto.longitude, dto.name);
  }

  @ApiOperation({ summary: 'Send a WhatsApp poll' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/poll')
  sendPoll(
    @Param('id') id: string,
    @Body() dto: SendPollDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.sendPoll(id, user.id, dto.question, dto.options, dto.selectableCount ?? 1);
  }

  @ApiOperation({ summary: 'Send WhatsApp contact cards' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/contacts')
  sendContacts(
    @Param('id') id: string,
    @Body() dto: SendContactDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.sendContacts(id, user.id, dto.contacts);
  }

  @ApiOperation({ summary: 'Forward a stored message to another WhatsApp phone number' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/messages/:messageId/forward')
  forwardMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: ForwardMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.forwardMessage(id, messageId, dto.toPhone, user.id);
  }

  @ApiOperation({ summary: 'Star or unstar a WhatsApp message' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/messages/:messageId/star')
  starMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: { star?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setMessageStarred(id, messageId, dto.star !== false, user.id);
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
