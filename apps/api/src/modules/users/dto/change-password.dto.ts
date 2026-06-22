import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  // Required for self-service change; ignored when an owner resets another
  // user's password (the owner can't know the victim's current password).
  @IsString()
  @IsOptional()
  oldPassword?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword!: string;
}
