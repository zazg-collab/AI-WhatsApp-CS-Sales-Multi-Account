import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.module';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { WebhooksService } from '../webhooks/webhooks.service';
// RealtimeModule bersifat @Global(): di produksi AppModule mendaftarkannya sehingga
// EventsGateway tersedia di mana saja (SentinelService memakainya). Di modul uji
// parsial, global itu TIDAK otomatis ada — jadi harus disebut eksplisit di sini.
import { RealtimeModule } from '../../realtime/realtime.module';
import { ReplyModule } from './reply.module';
import { ReplyPipelineService } from './reply-pipeline.service';
import { TestHarnessModule } from '../../test-harness/test-harness.module';
import { TestHarnessController } from '../../test-harness/test-harness.controller';

/**
 * >>> ANGGA — F3c (2026-08-09, cowork): jaring pengaman DI, pola yang sama
 * dengan `shipping.module.spec.ts`.
 *
 * Unit test `reply-pipeline.service.spec.ts` membangun service dengan `new`,
 * jadi ia TIDAK akan pernah menangkap kegagalan grafik modul Nest. Padahal
 * itulah risiko F3a/F3c: `ReplyModule` sekarang di-import DUA modul
 * (`WaModule` dan `TestHarnessModule`), dan `TestHarnessController` menyuntik
 * `ReplyPipelineService`. Kalau salah satu ekspor hilang atau muncul siklus,
 * aplikasi gagal boot di produksi — tanpa satu pun test merah.
 *
 * Test ini membangun grafiknya sungguhan supaya kegagalan itu ketahuan di CI,
 * bukan saat `npm run start`.
 */
describe('ANGGA — grafik modul reply + test-harness bisa dibangun', () => {
  const bangun = (imports: any[]) =>
    Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ScheduleModule.forRoot(),
        PrismaModule,
        SettingsModule,
        MetricsModule,
        NotificationsModule,
        RealtimeModule,
        ...imports,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(WebhooksService)
      .useValue({ deliver: jest.fn() })
      .compile();

  it('ReplyModule terpasang & ReplyPipelineService bisa di-resolve', async () => {
    const moduleRef = await bangun([ReplyModule]);
    expect(moduleRef.get(ReplyPipelineService)).toBeInstanceOf(ReplyPipelineService);
    await moduleRef.close();
  });

  it('TestHarnessModule ikut mendapat ReplyPipelineService — pintu kedua benar tersambung', async () => {
    const moduleRef = await bangun([TestHarnessModule]);
    const controller = moduleRef.get(TestHarnessController);
    expect(controller).toBeInstanceOf(TestHarnessController);
    // Kalau ini undefined, tester akan diam-diam balik memakai jalurnya sendiri.
    expect((controller as unknown as { pipeline?: unknown }).pipeline).toBeInstanceOf(ReplyPipelineService);
    await moduleRef.close();
  });
});
