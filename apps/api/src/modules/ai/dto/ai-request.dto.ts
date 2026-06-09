import { IsOptional, IsString } from 'class-validator';

export class GenerateDto {
  @IsString()
  conversationId!: string;

  @IsOptional()
  @IsString()
  model?: string;
}

export class ConversationRefDto {
  @IsString()
  conversationId!: string;
}
