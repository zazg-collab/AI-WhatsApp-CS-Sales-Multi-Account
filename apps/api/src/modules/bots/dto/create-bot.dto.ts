import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiMode, BotStatus } from '@hermes/database';

export class CreateBotDto {
  @ApiProperty({ example: 'Sales Bot' })
  botName!: string;

  @ApiPropertyOptional()
  personaId?: string;

  @ApiPropertyOptional()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ enum: ['ai_on', 'ai_off', 'ai_draft', 'ai_supervised'] })
  defaultAiMode?: AiMode;

  @ApiPropertyOptional({ example: 'id' })
  language?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  status?: BotStatus;
}
