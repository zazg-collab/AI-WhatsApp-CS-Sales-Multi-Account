import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { WaService } from './wa.service';
import {
  UpdateProfileDto,
  SetPresenceDto,
  EditMessageDto,
  CreateGroupDto,
  JoinGroupDto,
  GroupParticipantsDto,
  UpdateGroupDto,
} from './dto/wa-ops.dto';

// Extended WAHA gateway operations: own profile, presence, chats, groups,
// session logout, message edit. Account-scoped (/wa/accounts/:id/...).
// ponytail: API-only surface — advanced account ops (profile, presence, groups, chat history). No frontend UI yet.
@ApiExcludeController()
@ApiTags('whatsapp-ops')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wa/accounts/:id')
export class WaOpsController {
  constructor(private readonly wa: WaService) {}

  // ── Session ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Log out the WhatsApp session (unlink device, keep config)' })
  @Roles('owner', 'supervisor')
  @Post('logout')
  async logout(@Param('id') id: string) {
    await this.wa.logout(id);
    return { success: true };
  }

  // ── Profile ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: "Get the connected account's WhatsApp profile" })
  @Roles('viewer')
  @Get('profile')
  getProfile(@Param('id') id: string) {
    return this.wa.getProfile(id);
  }

  @ApiOperation({ summary: "Update the connected account's profile (name/status/picture)" })
  @Roles('owner', 'supervisor', 'admin')
  @Put('profile')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateProfileDto) {
    if (dto.name !== undefined) await this.wa.setProfileName(id, dto.name);
    if (dto.status !== undefined) await this.wa.setProfileStatus(id, dto.status);
    if (dto.pictureUrl !== undefined) await this.wa.setProfilePicture(id, dto.pictureUrl);
    return { success: true };
  }

  @ApiOperation({ summary: "Delete the connected account's profile picture" })
  @Roles('owner', 'supervisor', 'admin')
  @Delete('profile/picture')
  async deleteProfilePicture(@Param('id') id: string) {
    await this.wa.deleteProfilePicture(id);
    return { success: true };
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Set own presence (online/offline)' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('presence')
  async setPresence(@Param('id') id: string, @Body() dto: SetPresenceDto) {
    await this.wa.setPresence(id, dto.presence);
    return { success: true };
  }

  @ApiOperation({ summary: "Get a contact's presence" })
  @Roles('viewer')
  @Get('presence/:phone')
  async getPresence(@Param('id') id: string, @Param('phone') phone: string) {
    await this.wa.subscribePresence(id, phone).catch(() => undefined);
    return this.wa.getPresence(id, phone);
  }

  // ── Chats ─────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List chat overview from the live WhatsApp session' })
  @Roles('viewer')
  @Get('chats/overview')
  chatsOverview(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.wa.getChatsOverview(id, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }

  @ApiOperation({ summary: 'Fetch message history for a chat from WhatsApp' })
  @Roles('viewer')
  @Get('chats/:phone/history')
  chatHistory(
    @Param('id') id: string,
    @Param('phone') phone: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('downloadMedia') downloadMedia?: string,
  ) {
    return this.wa.getChatHistory(
      id, phone,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
      downloadMedia === 'true',
    );
  }

  @ApiOperation({ summary: 'Mark a chat as unread' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('chats/:phone/unread')
  async markUnread(@Param('id') id: string, @Param('phone') phone: string) {
    await this.wa.markChatUnread(id, phone);
    return { success: true };
  }

  @ApiOperation({ summary: 'Clear all messages in a chat' })
  @Roles('owner', 'supervisor')
  @Delete('chats/:phone/messages')
  async clearChat(@Param('id') id: string, @Param('phone') phone: string) {
    await this.wa.clearChat(id, phone);
    return { success: true };
  }

  @ApiOperation({ summary: 'Delete a chat' })
  @Roles('owner', 'supervisor')
  @Delete('chats/:phone')
  async deleteChat(@Param('id') id: string, @Param('phone') phone: string) {
    await this.wa.deleteChat(id, phone);
    return { success: true };
  }

  @ApiOperation({ summary: 'Edit a previously sent message' })
  @Roles('owner', 'supervisor', 'admin')
  @Put('messages/edit')
  async editMessage(@Param('id') id: string, @Body() dto: EditMessageDto) {
    await this.wa.editMessage(id, dto.phone, dto.externalId, dto.text);
    return { success: true };
  }

  // ── Groups ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a WhatsApp group' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('groups')
  createGroup(@Param('id') id: string, @Body() dto: CreateGroupDto) {
    return this.wa.createGroup(id, dto.name, dto.participants);
  }

  @ApiOperation({ summary: 'Join a group via invite code' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('groups/join')
  joinGroup(@Param('id') id: string, @Body() dto: JoinGroupDto) {
    return this.wa.joinGroup(id, dto.code);
  }

  @ApiOperation({ summary: 'Get a group invite code' })
  @Roles('viewer')
  @Get('groups/:groupId/invite-code')
  async inviteCode(@Param('id') id: string, @Param('groupId') groupId: string) {
    return { code: await this.wa.getGroupInviteCode(id, groupId) };
  }

  @ApiOperation({ summary: 'Leave a group' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('groups/:groupId/leave')
  async leaveGroup(@Param('id') id: string, @Param('groupId') groupId: string) {
    await this.wa.leaveGroup(id, groupId);
    return { success: true };
  }

  @ApiOperation({ summary: 'Add/remove/promote/demote group participants' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('groups/:groupId/participants')
  async groupParticipants(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body() dto: GroupParticipantsDto,
  ) {
    const map = {
      add: () => this.wa.addGroupParticipants(id, groupId, dto.phones),
      remove: () => this.wa.removeGroupParticipants(id, groupId, dto.phones),
      promote: () => this.wa.promoteGroupAdmins(id, groupId, dto.phones),
      demote: () => this.wa.demoteGroupAdmins(id, groupId, dto.phones),
    };
    await map[dto.action]();
    return { success: true };
  }

  @ApiOperation({ summary: 'Update group subject and/or description' })
  @Roles('owner', 'supervisor', 'admin')
  @Put('groups/:groupId')
  async updateGroup(@Param('id') id: string, @Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    if (dto.subject !== undefined) await this.wa.setGroupSubject(id, groupId, dto.subject);
    if (dto.description !== undefined) await this.wa.setGroupDescription(id, groupId, dto.description);
    return { success: true };
  }
}
