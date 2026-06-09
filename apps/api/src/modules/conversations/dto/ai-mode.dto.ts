import { IsEnum } from 'class-validator';
import { AiMode } from '@hermes/database';

export class AiModeDto {
  @IsEnum(AiMode)
  aiMode!: AiMode;
}
