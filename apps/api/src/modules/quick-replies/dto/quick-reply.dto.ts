import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateQuickReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  /** Optional "/shortcut" trigger, e.g. "salam" → typed as /salam. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortcut?: string;

  /** WhatsApp account this template belongs to; omit for a global template. */
  @IsOptional()
  @IsUUID()
  whatsappAccountId?: string;
}

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortcut?: string;

  @IsOptional()
  @IsUUID()
  whatsappAccountId?: string | null;
}
