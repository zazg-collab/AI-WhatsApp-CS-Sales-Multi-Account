import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreatePersonaDto {
  @ApiProperty({ example: 'Hermes Assistant' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'You are a helpful sales assistant...' })
  @IsString()
  soulMd!: string;

  @ApiPropertyOptional({ example: 'friendly' })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional({ example: 'conversational' })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forbiddenWords?: string[];
}

export class UpdatePersonaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  soulMd?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsString()
  rules?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forbiddenWords?: string[];
}
