import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class LabelsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  labels!: string[];
}
