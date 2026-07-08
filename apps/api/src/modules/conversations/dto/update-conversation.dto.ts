import { IsEnum, IsOptional } from 'class-validator';
import { AiMode, TakeoverStatus } from '@sentinel/database';

/**
 * A1: PATCH /conversations/:id must go through a class DTO — inline body types
 * skip ValidationPipe entirely, which let any admin mass-assign arbitrary
 * conversation columns (csatScore, slaBreachedAt, labels, …).
 */
export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(AiMode)
  aiMode?: AiMode;

  @IsOptional()
  @IsEnum(TakeoverStatus)
  takeoverStatus?: TakeoverStatus;
}
