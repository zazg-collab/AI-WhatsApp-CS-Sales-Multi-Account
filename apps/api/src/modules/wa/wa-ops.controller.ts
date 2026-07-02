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
  GroupSettingsDto,
  SendButtonsDto,
  SendListDto,
  PinMessageDto,
  EditCaptionDto,
  CreateChannelDto,
  FollowChannelDto,
  MuteChannelDto,
  ReactNewsletterDto,
  AddContactDto,
  SendLinkPreviewDto,
  SendTextStatusDto,
  SendImageStatusDto,
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

  @ApiOperation({ summary: 'Revoke group invite and get new code' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('groups/:groupId/revoke-invite')
  async revokeGroupInvite(@Param('id') id: string, @Param('groupId') groupId: string) {
    const code = await this.wa.revokeGroupInvite(id, groupId);
    return { code };
  }

  @ApiOperation({ summary: 'Update group settings (lock/unlock)' })
  @Roles('owner', 'supervisor', 'admin')
  @Put('groups/:groupId/settings')
  async setGroupSettings(@Param('id') id: string, @Param('groupId') groupId: string, @Body() dto: GroupSettingsDto) {
    await this.wa.setGroupSettings(id, groupId, dto.setting);
    return { success: true };
  }

  @ApiOperation({ summary: 'List all groups this account participates in' })
  @Roles('viewer')
  @Get('groups')
  getAllGroups(@Param('id') id: string) {
    return this.wa.getAllGroups(id);
  }

  @ApiOperation({ summary: 'Get metadata for a specific group' })
  @Roles('viewer')
  @Get('groups/:groupId/metadata')
  getGroupMetadata(@Param('id') id: string, @Param('groupId') groupId: string) {
    return this.wa.getGroupMetadata(id, groupId);
  }

  // ── Labels ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List all WhatsApp labels for this account' })
  @Roles('viewer')
  @Get('labels')
  getLabels(@Param('id') id: string) {
    return this.wa.getLabels(id);
  }

  @ApiOperation({ summary: 'Add a label to a chat' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('chats/:phone/labels/:labelId')
  async addChatLabel(@Param('id') id: string, @Param('phone') phone: string, @Param('labelId') labelId: string) {
    await this.wa.addChatLabel(id, phone, labelId);
    return { success: true };
  }

  @ApiOperation({ summary: 'Remove a label from a chat' })
  @Roles('owner', 'supervisor', 'admin')
  @Delete('chats/:phone/labels/:labelId')
  async removeChatLabel(@Param('id') id: string, @Param('phone') phone: string, @Param('labelId') labelId: string) {
    await this.wa.removeChatLabel(id, phone, labelId);
    return { success: true };
  }

  // ── Interactive messages ───────────────────────────────────────────────────

  @ApiOperation({ summary: 'Send a button message' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('messages/buttons')
  async sendButtons(@Param('id') id: string, @Body() dto: SendButtonsDto) {
    const msgId = await this.wa.sendButtons(id, dto.phone, dto.text, dto.footer ?? '', dto.buttons);
    return { id: msgId };
  }

  @ApiOperation({ summary: 'Send a list message' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('messages/list')
  async sendListMessage(@Param('id') id: string, @Body() dto: SendListDto) {
    const msgId = await this.wa.sendListMessage(id, dto.phone, dto.title, dto.text, dto.footer ?? '', dto.buttonText, dto.sections);
    return { id: msgId };
  }

  @ApiOperation({ summary: 'Pin or unpin a message' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('messages/pin')
  async pinMessage(@Param('id') id: string, @Body() dto: PinMessageDto) {
    await this.wa.pinMessage(id, dto.phone, dto.messageId, dto.unpin);
    return { success: true };
  }

  @ApiOperation({ summary: 'Edit the caption of a media message' })
  @Roles('owner', 'supervisor', 'admin')
  @Put('messages/caption')
  async editMediaCaption(@Param('id') id: string, @Body() dto: EditCaptionDto) {
    await this.wa.editMediaCaption(id, dto.phone, dto.messageId, dto.mediaType, dto.caption);
    return { success: true };
  }

  @ApiOperation({ summary: 'Send a message with a custom link preview' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('messages/link-preview')
  async sendLinkPreview(@Param('id') id: string, @Body() dto: SendLinkPreviewDto) {
    const msgId = await this.wa.sendWithLinkPreview(id, dto.phone, dto.text, {
      url: dto.url,
      title: dto.title,
      description: dto.description,
      thumbnailBase64: dto.thumbnailBase64,
    });
    return { id: msgId };
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Add or edit a contact in the WhatsApp address book' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('contacts')
  async addOrEditContact(@Param('id') id: string, @Body() dto: AddContactDto) {
    await this.wa.addOrEditContact(id, dto.phone, dto.fullName, dto.firstName);
    return { success: true };
  }

  // ── Channels (Newsletters) ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'List subscribed WhatsApp channels/newsletters' })
  @Roles('viewer')
  @Get('channels')
  listChannels(@Param('id') id: string) {
    return this.wa.listChannels(id);
  }

  @ApiOperation({ summary: 'Create a new WhatsApp channel/newsletter' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('channels')
  createChannel(@Param('id') id: string, @Body() dto: CreateChannelDto) {
    return this.wa.createChannel(id, dto.name, dto.description);
  }

  @ApiOperation({ summary: 'Get metadata for a specific channel' })
  @Roles('viewer')
  @Get('channels/:channelId')
  getChannelMetadata(@Param('id') id: string, @Param('channelId') channelId: string) {
    return this.wa.getChannelMetadata(id, channelId);
  }

  @ApiOperation({ summary: 'Delete a channel (owner only)' })
  @Roles('owner')
  @Delete('channels/:channelId')
  async deleteChannel(@Param('id') id: string, @Param('channelId') channelId: string) {
    await this.wa.deleteChannel(id, channelId);
    return { success: true };
  }

  @ApiOperation({ summary: 'Follow or unfollow a channel' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('channels/:channelId/follow')
  async followChannel(@Param('id') id: string, @Param('channelId') channelId: string, @Body() dto: FollowChannelDto) {
    await this.wa.followChannel(id, channelId, dto.follow);
    return { success: true };
  }

  @ApiOperation({ summary: 'Mute or unmute a channel' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('channels/:channelId/mute')
  async muteChannel(@Param('id') id: string, @Param('channelId') channelId: string, @Body() dto: MuteChannelDto) {
    await this.wa.muteChannel(id, channelId, dto.mute);
    return { success: true };
  }

  @ApiOperation({ summary: 'React to a newsletter message' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('channels/:channelId/:serverId/react')
  async reactToNewsletterMessage(
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Param('serverId') serverId: string,
    @Body() dto: ReactNewsletterDto,
  ) {
    await this.wa.reactToNewsletterMessage(id, channelId, serverId, dto.reaction);
    return { success: true };
  }

  // ── Status / Stories ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Post a text WhatsApp Status (Story)' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('status/text')
  async sendTextStatus(@Param('id') id: string, @Body() dto: SendTextStatusDto) {
    await this.wa.sendTextStatus(id, dto.text, dto.backgroundColor, dto.targetPhones);
    return { success: true };
  }

  @ApiOperation({ summary: 'Post an image WhatsApp Status (Story)' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('status/image')
  async sendImageStatus(@Param('id') id: string, @Body() dto: SendImageStatusDto) {
    const buffer = Buffer.from(dto.imageBase64, 'base64');
    await this.wa.sendImageStatus(id, buffer, dto.caption, dto.targetPhones);
    return { success: true };
  }

  @ApiOperation({ summary: 'Delete a WhatsApp Status by message ID' })
  @Roles('owner', 'supervisor', 'admin')
  @Delete('status/:messageId')
  async deleteStatus(@Param('id') id: string, @Param('messageId') messageId: string) {
    await this.wa.deleteStatus(id, messageId);
    return { success: true };
  }

  // ── Recording presence ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Show "recording audio" presence indicator in a chat' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('chats/:phone/recording/start')
  async startRecording(@Param('id') id: string, @Param('phone') phone: string) {
    await this.wa.startRecording(id, phone);
    return { success: true };
  }

  @ApiOperation({ summary: 'Stop "recording audio" presence indicator in a chat' })
  @Roles('owner', 'supervisor', 'admin')
  @Post('chats/:phone/recording/stop')
  async stopRecording(@Param('id') id: string, @Param('phone') phone: string) {
    await this.wa.stopRecording(id, phone);
    return { success: true };
  }
}
