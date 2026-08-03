import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ShippingController } from './shipping.controller';

/**
 * >>> ANGGA — Modul Shipping Service Mengantar.
 *
 * Providernya (`ShippingService`, `MengantarClient`, `ShippingQuoteCache`)
 * sengaja didaftarkan di `AiModule`, bukan di sini: `PromptBuilderService`
 * (di AiModule) memanggil `ShippingService`, sementara `ShippingService`
 * memakai `AiProviderService` (juga di AiModule). Kalau providernya ditaruh di
 * modul ini, dua modul itu jadi saling impor (butuh forwardRef) tanpa manfaat
 * apa pun. Modul ini cukup memegang controller uji manual admin.
 */
@Module({
  imports: [AiModule],
  controllers: [ShippingController],
})
export class ShippingModule {}
