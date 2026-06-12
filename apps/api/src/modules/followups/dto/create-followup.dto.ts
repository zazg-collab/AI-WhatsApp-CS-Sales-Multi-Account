import { IsString, IsDateString, IsOptional } from 'class-validator';

export class CreateFollowUpDto {
  @IsString()
  conversationId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
