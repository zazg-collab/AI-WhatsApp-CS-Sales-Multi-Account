import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateAccountDto {
  // Optional: a friendly name is convenient but not required. When omitted we
  // default it, then auto-fill with the real number once the device links.
  @IsOptional()
  @IsString()
  accountName?: string;

  // Optional: the number is auto-detected from the linked WhatsApp session on
  // first connect, so operators don't have to type it (and can't mistype it).
  @IsOptional()
  @Matches(/^\d{6,20}$/, { message: 'phoneNumber must be digits only' })
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  assignedBotId?: string;

  @IsOptional()
  @IsString()
  assignedAdminId?: string;
}
