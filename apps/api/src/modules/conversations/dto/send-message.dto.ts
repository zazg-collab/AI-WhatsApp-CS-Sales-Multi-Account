import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  text!: string;

  /** Reply/quote: id of the message being replied to (must belong to the conversation). */
  @IsOptional()
  @IsUUID()
  quotedMessageId?: string;
}
