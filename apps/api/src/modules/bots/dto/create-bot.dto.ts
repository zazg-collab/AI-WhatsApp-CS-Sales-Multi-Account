import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AiMode, BotStatus } from '@hermes/database';

export class CreateBotDto {
  @ApiProperty({ example: 'Sales Bot' })
  @IsString()
  botName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ enum: ['ai_on', 'ai_off', 'ai_draft', 'ai_supervised'] })
  @IsOptional()
  @IsEnum(AiMode)
  defaultAiMode?: AiMode;

  @ApiPropertyOptional({ example: 'id' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'draft'] })
  @IsOptional()
  @IsEnum(BotStatus)
  status?: BotStatus;
}
