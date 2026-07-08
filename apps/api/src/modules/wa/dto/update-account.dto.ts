import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AiMode } from '@sentinel/database';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  assignedBotId?: string;

  @IsOptional()
  @IsString()
  assignedAdminId?: string;

  @IsOptional()
  @IsEnum(AiMode)
  aiMode?: AiMode;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ── Business hours / auto-away ──
  @IsOptional()
  @IsBoolean()
  businessHoursEnabled?: boolean;

  // @IsOptional() only skips null/undefined, not ''. A cleared time input sends
  // '' — treat that as "not provided" so it doesn't fail the HH:MM @Matches.
  @ValidateIf((o) => o.businessHoursStart !== '' && o.businessHoursStart != null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'businessHoursStart must be HH:MM' })
  businessHoursStart?: string;

  @ValidateIf((o) => o.businessHoursEnd !== '' && o.businessHoursEnd != null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'businessHoursEnd must be HH:MM' })
  businessHoursEnd?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  businessDays?: number[];

  @IsOptional()
  @IsString()
  businessTimezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  awayMessage?: string;
}
