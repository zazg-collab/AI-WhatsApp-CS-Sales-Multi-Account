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

export class AskDto {
  @IsString()
  question!: string;
}
