import { ArrayMinSize, ArrayNotEmpty, IsArray, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class SendPollDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  question!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(2)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  options!: string[];

  @IsInt()
  @Min(1)
  selectableCount?: number;
}
