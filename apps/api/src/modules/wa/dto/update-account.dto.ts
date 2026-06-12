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
} from 'class-validator';
import { AiMode } from '@hermes/database';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  accountName?: string;

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

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'businessHoursStart must be HH:MM' })
  businessHoursStart?: string;

  @IsOptional()
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
