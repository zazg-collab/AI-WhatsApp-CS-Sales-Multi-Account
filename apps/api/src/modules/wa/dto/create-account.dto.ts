import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  accountName!: string;

  @Matches(/^\d{6,20}$/, { message: 'phoneNumber must be digits only' })
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  assignedBotId?: string;

  @IsOptional()
  @IsString()
  assignedAdminId?: string;
}
