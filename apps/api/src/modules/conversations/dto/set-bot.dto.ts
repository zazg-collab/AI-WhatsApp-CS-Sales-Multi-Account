import { IsOptional, IsString } from 'class-validator';

export class SetBotDto {
  /** Bot id to use for this conversation, or null to revert to the account default. */
  @IsOptional()
  @IsString()
  botId!: string | null;
}
