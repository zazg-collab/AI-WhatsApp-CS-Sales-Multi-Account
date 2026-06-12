import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ReactionDto {
  // A single emoji, or empty string to clear our reaction.
  @IsString()
  @MaxLength(8)
  emoji!: string;
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;
}

export class ValidateNumberDto {
  @IsString()
  accountId!: string;

  @IsString()
  @Matches(/^\+?[\d\s\-().]{7,20}$/, { message: 'phoneNumber tidak valid' })
  phoneNumber!: string;
}
