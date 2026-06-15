import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const PURPOSES = ['brochure', 'product', 'testimonial'] as const;

export class CreateAssetDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsIn(PURPOSES)
  purpose!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  marketplaceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerKeywords?: string[];
}

export class UpdateAssetDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsIn(PURPOSES) purpose?: string;
  @IsOptional() @IsString() @MaxLength(1000) caption?: string;
  @IsOptional() @IsString() @MaxLength(2000) marketplaceUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) triggerKeywords?: string[];
  @IsOptional() @IsIn(['active', 'draft']) status?: string;
}

export class SendAssetDto {
  @IsString()
  conversationId!: string;
}

export class ListAssetsQueryDto {
  @IsOptional() @IsIn(PURPOSES) purpose?: string;
  @IsOptional() @IsIn(['active', 'draft']) status?: string;
}
