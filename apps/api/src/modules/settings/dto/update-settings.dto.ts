import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
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
}
