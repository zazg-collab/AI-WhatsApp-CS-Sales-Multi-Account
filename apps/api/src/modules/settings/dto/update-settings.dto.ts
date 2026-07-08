import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

class AiSettingsDto {
  @IsOptional() @IsString()
  baseUrl?: string;

  // Empty string = leave the stored secret unchanged (see controller).
  @IsOptional() @IsString()
  apiKey?: string;

  @IsOptional() @IsString()
  model?: string;

  // Sentinel supervisor model. Empty string = fall back to `model`.
  @IsOptional() @IsString()
  sentinelModel?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(2)
  temperature?: number;

  @IsOptional() @IsNumber() @Min(1000) @Max(120_000)
  timeoutMs?: number;
}

class WaSettingsDto {
  @IsOptional() @IsNumber() @Min(0) @Max(60_000)
  humanDelayMinMs?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(60_000)
  humanDelayMaxMs?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(2000)
  typingPerCharMs?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(60_000)
  typingMinMs?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(120_000)
  typingMaxMs?: number;
}

class NotificationSettingsDto {
  @IsOptional() @IsString()
  hermesNotifyTarget?: string;
}

class SlaSettingsDto {
  @IsOptional() @IsNumber() @Min(1) @Max(1440)
  responseMinutes?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(90)
  idleCloseDays?: number;
}

class SentinelSettingsDto {
  @IsOptional() @IsNumber() @Min(50) @Max(100)
  autoSendConfidenceMin?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(99)
  draftConfidenceMin?: number;

  // Comma-separated, free text — matched case-insensitively in rules.engine.
  @IsOptional() @IsString()
  riskKeywords?: string;

  @IsOptional() @IsIn(['ai_off', 'ai_draft', 'ai_supervised', 'ai_on'])
  defaultAiMode?: 'ai_off' | 'ai_draft' | 'ai_supervised' | 'ai_on';
}

class CampaignSettingsDto {
  @IsOptional() @IsNumber() @Min(1) @Max(60)
  defaultRateLimitPerMinute?: number;

  @IsOptional() @IsBoolean()
  requireApproval?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional() @ValidateNested() @Type(() => AiSettingsDto)
  ai?: AiSettingsDto;

  @IsOptional() @ValidateNested() @Type(() => WaSettingsDto)
  wa?: WaSettingsDto;

  @IsOptional() @ValidateNested() @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @IsOptional() @ValidateNested() @Type(() => SlaSettingsDto)
  sla?: SlaSettingsDto;

  @IsOptional() @ValidateNested() @Type(() => SentinelSettingsDto)
  sentinel?: SentinelSettingsDto;

  @IsOptional() @ValidateNested() @Type(() => CampaignSettingsDto)
  campaign?: CampaignSettingsDto;
}
