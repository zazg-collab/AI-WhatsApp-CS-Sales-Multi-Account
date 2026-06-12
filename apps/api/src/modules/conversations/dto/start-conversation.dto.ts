import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** Start (or open) a chat with any phone number — WhatsApp-desktop style. */
export class StartConversationDto {
  @IsUUID()
  accountId!: string;

  @IsString()
  @Matches(/^\+?[\d\s\-().]{7,20}$/, { message: 'phoneNumber tidak valid' })
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
