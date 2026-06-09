import { IsString, IsDateString } from 'class-validator';

export class CreateFollowUpDto {
  @IsString()
  conversationId: string;

  @IsDateString()
  scheduledAt: string;

  @IsString()
  message: string;
}
