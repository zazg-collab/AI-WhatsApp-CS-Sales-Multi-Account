import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendLocationDto {
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class ContactEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone!: string;
}

export class SendContactDto {
  @IsArray()
  @MinLength(1)
  contacts!: ContactEntryDto[];
}

export class SendStickerDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  url?: string;
}

export class SendViewOnceDto {
  @IsIn(['image', 'video'])
  mediaType!: 'image' | 'video';

  @IsString()
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}

export class MuteChatDto {
  @IsOptional()
  @IsBoolean()
  mute?: boolean;
}

export class DisappearingMessagesDto {
  @IsBoolean()
  enable!: boolean;

  @IsOptional()
  @IsNumber()
  duration?: number;
}

export class ForwardMessageDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  toPhone!: string;
}

export class LiveLocationDto {
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  durationSec?: number;
}
