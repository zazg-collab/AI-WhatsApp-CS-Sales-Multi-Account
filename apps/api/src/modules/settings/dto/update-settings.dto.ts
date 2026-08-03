import { Type } from 'class-transformer';
import {
  IsArray,
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

  // >>> ANGGA: buka sakelar RAG ke dashboard. Upstream hanya membacanya dari env
  // (AI_EMBED_MODEL / AI_EMBED_DIM) sehingga menyalakannya butuh edit .env + restart.
  // Dua field ini sudah ada di AiSettings & defaults(), dan overlay DB di
  // SettingsService bersifat generik — jadi cukup diizinkan lewat DTO.
  // embedModel kosong = RAG mati (lihat EmbeddingService.enabled()).
  @IsOptional() @IsString()
  embedModel?: string;

  @IsOptional() @IsNumber() @Min(64) @Max(8192)
  embedDim?: number;
  // <<< ANGGA
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

// >>> ANGGA: config modul Shipping Service Mengantar (§6 LAMPIRAN).
class ShippingSettingsDto {
  // Kosong = pertahankan kunci yang tersimpan (lihat controller).
  @IsOptional() @IsString()
  mengantarApiKey?: string;

  @IsOptional() @IsString()
  mengantarOriginId?: string;

  @IsOptional() @IsString()
  baseUrl?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  courierExclude?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  codAllowlist?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  codBlockedRegionKeywords?: string[];

  @IsOptional() @IsNumber() @Min(1) @Max(1_000_000)
  defaultWeightGrams?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(604_800_000)
  quoteCacheTtlMs?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  discountMaxPerOrder?: number;

  // 1 = tanpa pembulatan. Batas atas 100.000 supaya salah ketik tidak membuat
  // semua harga melompat ke kelipatan yang absurd.
  @IsOptional() @IsNumber() @Min(1) @Max(100_000)
  priceRoundingIncrement?: number;
}
// <<< ANGGA

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

  // >>> ANGGA
  @IsOptional() @ValidateNested() @Type(() => ShippingSettingsDto)
  shipping?: ShippingSettingsDto;
  // <<< ANGGA
}
