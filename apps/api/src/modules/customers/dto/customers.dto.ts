import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStage } from '@hermes/database';

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'Budi Santoso' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  leadScore?: number;

  @ApiPropertyOptional({ enum: LeadStage })
  @IsOptional()
  @IsEnum(LeadStage)
  leadStage?: LeadStage;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedAdminId?: string;
}

export class AddNoteDto {
  @IsString()
  note!: string;
}

export class BulkCustomerActionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100, { message: 'Bulk actions are limited to 100 customers at a time' })
  @IsString({ each: true })
  customerIds!: string[];

  @IsOptional()
  @IsEnum(LeadStage)
  leadStage?: LeadStage;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['replace', 'append', 'remove'])
  tagMode?: 'replace' | 'append' | 'remove';

  @IsOptional()
  @IsString()
  assignedAdminId?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}
