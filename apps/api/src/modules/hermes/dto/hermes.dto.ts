import { IsString } from 'class-validator';

export class ReviewReplyDto {
  @IsString()
  conversationId!: string;

  @IsString()
  draftText!: string;
}

export class ConversationActionDto {
  @IsString()
  conversationId!: string;
}
