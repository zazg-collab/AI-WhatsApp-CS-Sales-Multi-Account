import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** A3: class DTO so the global ValidationPipe actually validates this body. */
export class SendMediaDto {
  @IsIn(['image', 'document', 'audio', 'video'])
  mediaType!: 'image' | 'document' | 'audio' | 'video';

  @IsString()
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}
