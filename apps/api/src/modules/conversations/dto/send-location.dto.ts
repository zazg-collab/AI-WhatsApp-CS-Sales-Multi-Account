import { IsNumber } from 'class-validator';

export class SendLocationDto {
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;
}
