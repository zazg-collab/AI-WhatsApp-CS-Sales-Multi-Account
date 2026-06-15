import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePersonaDto {
  @ApiProperty({ example: 'Hermes Assistant' })
  name!: string;

  @ApiProperty({ example: 'You are a helpful sales assistant...' })
  soulMd!: string;

  @ApiPropertyOptional({ example: 'friendly' })
  tone?: string;

  @ApiPropertyOptional({ example: 'conversational' })
  style?: string;

  @ApiPropertyOptional()
  rules?: string;

  @ApiPropertyOptional({ type: [String] })
  forbiddenWords?: string[];
}

export class UpdatePersonaDto {
  name?: string;
  soulMd?: string;
  tone?: string;
  style?: string;
  rules?: string;
  forbiddenWords?: string[];
}
