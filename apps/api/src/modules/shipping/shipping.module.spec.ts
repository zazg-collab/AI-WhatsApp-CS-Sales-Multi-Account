import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from '../ai/ai.module';
import { ShippingModule } from './shipping.module';
import { SettingsModule } from '../settings/settings.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PromptBuilderService } from '../ai/prompt-builder.service';
import { ShippingService } from './shipping.service';
import { MengantarClient } from './mengantar.client';
import { ShippingQuoteCache } from './shipping-quote.cache';
import { ShippingController } from './shipping.controller';

/**
 * >>> ANGGA — Jaring pengaman ketergantungan (DI).
 *
 * `controllers.smoke.spec.ts` yang sudah ada membangun controller satu per satu
 * dengan `new`, jadi ia TIDAK akan pernah menangkap ketergantungan melingkar
 * antar modul Nest — padahal itu justru risiko utama modul ini:
 * PromptBuilderService memanggil ShippingService, sementara ShippingService
 * memakai AiProviderService yang serumah dengan PromptBuilderService.
 *
 * Tes ini membangun grafik modulnya sungguhan. Kalau suatu saat ada yang
 * memindahkan provider shipping ke ShippingModule (bikin AiModule <-> Shipping
 * saling impor), tes ini gagal SEBELUM aplikasi gagal boot di produksi.
 */
describe('ANGGA — grafik modul shipping bisa dibangun (tanpa siklus)', () => {
  it('AiModule + ShippingModule terpasang & ShippingService bisa di-resolve', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        // ProductsModule (lewat AiModule) memakai @Cron — butuh forRoot di tes.
        ScheduleModule.forRoot(),
        PrismaModule,
        SettingsModule,
        MetricsModule,
        NotificationsModule,
        AiModule,
        ShippingModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(WebhooksService)
      .useValue({ deliver: jest.fn() })
      .compile();

    expect(moduleRef.get(ShippingService)).toBeInstanceOf(ShippingService);
    expect(moduleRef.get(MengantarClient)).toBeInstanceOf(MengantarClient);
    expect(moduleRef.get(ShippingQuoteCache)).toBeInstanceOf(ShippingQuoteCache);
    expect(moduleRef.get(ShippingController)).toBeInstanceOf(ShippingController);

    // PromptBuilderService HARUS benar-benar menerima ShippingService, bukan
    // undefined — kalau tidak, ongkir tidak akan pernah masuk prompt.
    const prompts = moduleRef.get(PromptBuilderService);
    expect((prompts as unknown as { shipping?: unknown }).shipping).toBeInstanceOf(ShippingService);

    await moduleRef.close();
  });
});
