import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** >>> ANGGA — DTO modul Shipping Service Mengantar. */

export class ShippingItemDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsInt() @Min(1) @Max(1000)
  qty?: number;
}

/**
 * Uji lookup ongkir manual dari dashboard admin — pola yang sama seperti
 * "kolom uji pertanyaan" di menu Knowledge: masukkan tujuan + barang, lihat
 * persis apa yang akan dihitung sistem, tanpa menunggu ada pelanggan nyata.
 */
export class ShippingQuoteTestDto {
  /** Nama kota/kabupaten/provinsi tujuan, seperti yang diketik pelanggan. */
  @IsString() @MinLength(2) @MaxLength(120)
  keyword!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShippingItemDto)
  items?: ShippingItemDto[];
}
