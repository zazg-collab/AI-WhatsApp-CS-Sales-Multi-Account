import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ArrayNotEmpty,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(280) status?: string;
  @IsOptional() @IsString() pictureUrl?: string;
}

export class SetPresenceDto {
  @IsIn(['online', 'offline']) presence!: 'online' | 'offline';
}

export class EditMessageDto {
  @IsString() phone!: string;
  @IsString() externalId!: string;
  @IsString() @MaxLength(4096) text!: string;
}

export class CreateGroupDto {
  @IsString() @MaxLength(100) name!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) participants!: string[];
}

export class JoinGroupDto {
  @IsString() code!: string;
}

export class GroupParticipantsDto {
  @IsIn(['add', 'remove', 'promote', 'demote']) action!: 'add' | 'remove' | 'promote' | 'demote';
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) phones!: string[];
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MaxLength(100) subject?: string;
  @IsOptional() @IsString() @MaxLength(512) description?: string;
}

class ButtonItemDto {
  @IsString() id!: string;
  @IsString() @MaxLength(200) text!: string;
}

export class SendButtonsDto {
  @IsString() phone!: string;
  @IsString() @MaxLength(1024) text!: string;
  @IsOptional() @IsString() @MaxLength(200) footer?: string;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ButtonItemDto) buttons!: ButtonItemDto[];
}

class ListRowDto {
  @IsString() id!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

class ListSectionDto {
  @IsString() @MaxLength(100) title!: string;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ListRowDto) rows!: ListRowDto[];
}

export class SendListDto {
  @IsString() phone!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(1024) text!: string;
  @IsOptional() @IsString() @MaxLength(200) footer?: string;
  @IsString() @MaxLength(50) buttonText!: string;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ListSectionDto) sections!: ListSectionDto[];
}

export class PinMessageDto {
  @IsString() phone!: string;
  @IsString() messageId!: string;
  @IsOptional() @IsBoolean() unpin?: boolean;
}

export class EditCaptionDto {
  @IsString() phone!: string;
  @IsString() messageId!: string;
  @IsIn(['image', 'video', 'document']) mediaType!: 'image' | 'video' | 'document';
  @IsString() @MaxLength(1024) caption!: string;
}

export class GroupSettingsDto {
  @IsIn(['locked', 'unlocked', 'announcement', 'not_announcement'])
  setting!: 'locked' | 'unlocked' | 'announcement' | 'not_announcement';
}

export class LabelChatDto {
  // All params come from URL — no body fields required
}

// ── Channels (Newsletters) ────────────────────────────────────────────────────

export class CreateChannelDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(512) description?: string;
}

export class FollowChannelDto {
  @IsBoolean() follow!: boolean;
}

export class MuteChannelDto {
  @IsBoolean() mute!: boolean;
}

export class ReactNewsletterDto {
  @IsString() @MaxLength(10) reaction!: string;
}

export class PostToChannelDto {
  @IsString() @MaxLength(4096) text!: string;
}

export class AddContactDto {
  @IsString() phone!: string;
  @IsString() @MaxLength(200) fullName!: string;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
}

export class SendLinkPreviewDto {
  @IsString() phone!: string;
  @IsString() @MaxLength(4096) text!: string;
  @IsString() url!: string;
  @IsString() @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() thumbnailBase64?: string;
}

// ── Status / Stories ──────────────────────────────────────────────────────────

export class SendTextStatusDto {
  @IsString() @MaxLength(700) text!: string;
  @IsOptional() @IsString() backgroundColor?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) targetPhones?: string[];
}

export class SendImageStatusDto {
  @IsString() imageBase64!: string;
  @IsOptional() @IsString() @MaxLength(700) caption?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) targetPhones?: string[];
}
