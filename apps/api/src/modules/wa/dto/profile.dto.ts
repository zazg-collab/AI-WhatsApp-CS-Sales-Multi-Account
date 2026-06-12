import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  status?: string;
}

export class SendStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}
