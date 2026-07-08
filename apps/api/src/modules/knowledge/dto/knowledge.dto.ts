import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { KnowledgeStatus } from '@sentinel/database';

export class CreateKnowledgeBaseDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateKnowledgeBaseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(KnowledgeStatus)
  status?: KnowledgeStatus;
}

export class CreateKnowledgeItemDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  // Matches document-extract.util's MAX_EXTRACT_CHARS — same ceiling whether
  // content arrives via manual paste, file upload, or URL ingest. Anything
  // under CHUNK_CHARS (8000) stays one item; above it, KnowledgeService
  // auto-splits into several prompt-sized items (see addItem()).
  @IsString()
  @MaxLength(80_000)
  content!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsEnum(KnowledgeStatus)
  status?: KnowledgeStatus;
}

export class UpdateKnowledgeItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80_000)
  content?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsEnum(KnowledgeStatus)
  status?: KnowledgeStatus;
}

export class IngestUrlDto {
  @IsString()
  @MaxLength(2048)
  url!: string;
}
