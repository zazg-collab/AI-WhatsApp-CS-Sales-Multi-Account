import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

/**
 * >>> ANGGA — 2026-08-11 (cowork): PULANG-PERGI SETTINGS HARUS UTUH.
 *
 * Bug yang melahirkan test ini: Bossfren membuka Settings → AI, mengganti model,
 * menekan Save, dan mendapat **"ai.property ragMode should not exist"**. Rantainya
 * terbukti dari kode: `settings.service.ts` memulangkan `ragMode` di objek `ai`,
 * DTO tidak punya field itu, dan `main.ts` memasang `forbidNonWhitelisted: true`.
 * Jadi UI mengambil objek, mengirimnya balik apa adanya, dan validator menolak
 * field yang ia sendiri baru saja kirimkan. **Tab AI tidak pernah bisa disimpan
 * sejak `ragMode` ditambahkan** — dan itu menjelaskan kenapa baris DB-nya masih
 * memuat model lama meski `.env` sudah diubah.
 *
 * KENAPA TESTNYA BERBENTUK BEGINI (pakem 8d butir 5: KELAS, BUKAN KASUS).
 * Menambahkan `ragMode` ke DTO lalu menulis test `expect(ragMode diterima)`
 * hanya menutup satu kasus. Padahal komentar di DTO itu sendiri (`:178-180`)
 * sudah menuliskan aturannya sesudah insiden `bc0bf94`: *"field AppSetting baru
 * WAJIB 3 tempat — types + defaults + DTO whitelist ini"*. Aturannya ada, lalu
 * dilanggar lagi. Aturan yang tidak dijaga mesin akan dilanggar lagi.
 *
 * Jadi yang dikunci di sini adalah INVARIANNYA: **apa pun yang dipulangkan
 * pembaca settings WAJIB diterima kembali oleh DTO-nya.** Field ke-10 yang
 * ditambahkan orang berikutnya ke dua tempat saja akan merah di sini, bukan di
 * tangan Bossfren saat menekan Save.
 */
function settingsPalsu() {
  // Config kosong → seluruh nilai jatuh ke default kode. Itu justru yang kita
  // mau: bentuk KANONIK objeknya, bebas dari isi DB mesin siapa pun.
  const config = { get: () => undefined } as any;
  const prisma = { appSetting: { findMany: async () => [] } } as any;
  return new SettingsService(prisma, config);   // urutan: (prisma, config)
}

/** Validasi meniru `main.ts`: whitelist + forbidNonWhitelisted. */
async function tolakan(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSettingsDto, payload);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap((c) => Object.values(c.constraints ?? {})),
  ]);
}

describe('Settings pulang-pergi: yang dibaca UI wajib bisa dikirim balik', () => {
  it('objek `ai` apa adanya dari SettingsService diterima UpdateSettingsDto', async () => {
    const ai = await settingsPalsu().ai();
    // `apiKey` sengaja ikut: UI mengirimnya kosong untuk "biarkan tidak berubah".
    expect(await tolakan({ ai })).toEqual([]);
  });

  it('field yang benar-benar asing TETAP ditolak — penjaga tidak dilonggarkan', async () => {
    // Perbaikannya BUKAN mematikan forbidNonWhitelisted. Kalau ia dimatikan,
    // salah ketik nama field akan tersimpan diam-diam dan hilang tanpa jejak.
    const ai = { ...(await settingsPalsu().ai()), fieldNgawurYangTidakAda: 1 };
    expect(await tolakan({ ai })).toContain('property fieldNgawurYangTidakAda should not exist');
  });
});
