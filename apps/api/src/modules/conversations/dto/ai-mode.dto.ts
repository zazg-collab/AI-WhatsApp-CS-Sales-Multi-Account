import { IsEnum } from 'class-validator';
import { AiMode } from '@sentinel/database';

export class AiModeDto {
  @IsEnum(AiMode)
  aiMode!: AiMode;
}
