import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { ValidateNumberDto } from './dto/message-actions.dto';
import { DisappearingMessagesDto, MuteChatDto } from './dto/wa-actions.dto';

/**
 * Chat lifecycle + WhatsApp chat-operation endpoints (start, validate, mute,
 * archive, pin, block, disappearing, typing, takeover). Split out of
 * ConversationsController (PRD 14.3). `start`/`validate-number` are unique
 * single-segment paths and the rest are multi-segment `:id/...` paths, so none
 * collide with the greedy `:id` routes in ConversationsController.
 */
@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conversations')
export class ConversationChatOpsController {
  constructor(private readonly conversations: ConversationsService) {}

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

  @ApiOperation({ summary: 'Block a WhatsApp contact' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/block-contact')
  blockContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.setContactBlocked(id, true, user.id);
  }

  @ApiOperation({ summary: 'Unblock a WhatsApp contact' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/unblock-contact')
  unblockContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.conversations.setContactBlocked(id, false, user.id);
  }

  @ApiOperation({ summary: 'Mute or unmute a WhatsApp chat' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/mute')
  muteChat(
    @Param('id') id: string,
    @Body() dto: MuteChatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setChatMuted(id, dto.mute !== false, user.id);
  }

  @ApiOperation({ summary: 'Archive or unarchive a WhatsApp chat' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/archive')
  archiveChat(
    @Param('id') id: string,
    @Body() dto: { archive?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setChatArchived(id, dto.archive !== false, user.id);
  }

  @ApiOperation({ summary: 'Pin or unpin a WhatsApp chat' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/pin')
  pinChat(
    @Param('id') id: string,
    @Body() dto: { pin?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setChatPinned(id, dto.pin !== false, user.id);
  }

  @ApiOperation({ summary: 'Enable/disable disappearing messages for a WhatsApp chat' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/disappearing-messages')
  disappearingMessages(
    @Param('id') id: string,
    @Body() dto: DisappearingMessagesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.conversations.setDisappearingMessages(id, dto.enable, user.id, dto.duration);
  }

  @ApiOperation({ summary: 'Send admin typing presence to WhatsApp' })
  @Roles('admin', 'supervisor', 'owner')
  @Post(':id/typing')
  typing(@Param('id') id: string, @Body() dto: { typing?: boolean }) {
    return this.conversations.sendTyping(id, dto.typing !== false);
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
}
