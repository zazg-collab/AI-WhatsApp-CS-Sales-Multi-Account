import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStage } from '@hermes/database';

export class CampaignTargetFilterDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000, { message: 'Campaign previews are limited to 1000 selected customers' })
  @IsString({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsEnum(LeadStage)
  leadStage?: LeadStage;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  assignedAdminId?: string;
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(1)
  messageTemplate!: string;

  @IsString()
  whatsappAccountId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignTargetFilterDto)
  targetFilter?: CampaignTargetFilterDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  rateLimitPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  humanDelayMinMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(180000)
  humanDelayMaxMs?: number;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  messageTemplate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignTargetFilterDto)
  targetFilter?: CampaignTargetFilterDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  rateLimitPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  humanDelayMinMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(180000)
  humanDelayMaxMs?: number;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}

export class PreviewCampaignDto {
  @IsString()
  whatsappAccountId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignTargetFilterDto)
  targetFilter?: CampaignTargetFilterDto;
}
