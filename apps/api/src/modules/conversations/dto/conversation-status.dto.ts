import { IsEnum } from 'class-validator';
import { ConversationStatus } from '@sentinel/database';

export class ConversationStatusDto {
  @IsEnum(ConversationStatus)
  status!: ConversationStatus;
}
