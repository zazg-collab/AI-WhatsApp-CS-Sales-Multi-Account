import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AiMode, BotStatus } from '@sentinel/database';

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  botName?: string;

  @IsOptional()
  @IsString()
  personaId?: string;

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @IsOptional()
  @IsEnum(AiMode)
  defaultAiMode?: AiMode;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(BotStatus)
  status?: BotStatus;
}
