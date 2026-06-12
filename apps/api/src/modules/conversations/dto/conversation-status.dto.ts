import { IsEnum } from 'class-validator';
import { ConversationStatus } from '@hermes/database';

export class ConversationStatusDto {
  @IsEnum(ConversationStatus)
  status!: ConversationStatus;
}
