import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional edited text when approving a draft; falls back to the stored draft. */
export class ApproveDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  text?: string;
}
