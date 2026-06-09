import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
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
}
