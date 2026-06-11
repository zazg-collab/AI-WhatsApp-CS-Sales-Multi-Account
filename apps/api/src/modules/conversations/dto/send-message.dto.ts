import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  /** Reply/quote: id of the message being replied to (must belong to the conversation). */
  @IsOptional()
  @IsUUID()
  quotedMessageId?: string;
}
