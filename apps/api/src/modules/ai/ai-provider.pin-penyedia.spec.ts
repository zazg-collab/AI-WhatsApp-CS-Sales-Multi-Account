import { AiProviderService } from './ai-provider.service';

/**
 * >>> ANGGA — F6 Bagian 1 (2026-08-11, cowork): PIN PENYEDIA HULU.
 *
 * Lahir dari DUA temuan yang saling menguatkan, dua-duanya terukur hari ini:
 *
 *  1. Verifikasi dokumentasi OpenRouter: `allow_fallbacks:false` SENDIRIAN
 *     TIDAK mengunci rute. Ia hanya mematikan cadangan SESUDAH pilihan default
 *     dibuat, dan pilihan default itu tetap ditentukan routing OpenRouter per
 *     permintaan. Penguncian butuh `provider.only` (atau `order`).
 *
 *  2. Putaran pengintaian pertama: satu percakapan 6 giliran dilayani LIMA
 *     penyedia hulu berbeda (DeepInfra 4 · StreamLake 3 · Parasail 1 · Google 1
 *     · Crusoe 1), dan berpindah DI DALAM satu giliran — giliran 3 dilayani
 *     Crusoe + StreamLake + DeepInfra untuk 5 panggilan. Confound yang selama
 *     ini berstatus dugaan, akhirnya terukur, dan lebih ekstrem dari dugaannya.
 *
 * ⚠️ Nilai yang dipakai adalah SLUG penyedia menurut OpenRouter, dan slug itu
 * belum kami verifikasi (yang kami punya baru NAMA TAMPILAN dari badan respons,
 * mis. "DeepInfra"). Karena itu alat ini sengaja TIDAK menebak: ia mengirim apa
 * adanya, lalu `kesahihan.mjs` MEMERIKSA TANDA TERIMA — apakah penyedia yang
 * benar-benar melayani sama dengan yang di-pin. Salah slug jadi ketahuan dari
 * data, bukan dari asumsi.
 *
 * Spec ini hanya memakai API publik lama supaya MERAH di level assertion.
 */
function makeService() {
  const ai = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'k',
    model: 'deepseek/deepseek-v4-flash-0731',
    temperature: 0.6,
    timeoutMs: 30_000,
  };
  return new AiProviderService({ ai: async () => ai } as any);
}
const balas = () => ({
  ok: true,
  json: async () => ({
    id: 'gen-1', provider: 'DeepInfra', model: 'deepseek/deepseek-v4-flash-0731',
    choices: [{ message: { content: 'halo' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }),
});
const payloadDari = (f: jest.Mock) => JSON.parse((f.mock.calls[0][1] as any).body);

describe('AiProviderService — pin penyedia hulu (EVAL_PROVIDER_ONLY)', () => {
  const realFetch = global.fetch;
  const simpan = { p: process.env.EVAL_PROVIDER_ONLY, l: process.env.EVAL_LOCK_PROVIDER };
  afterEach(() => {
    global.fetch = realFetch;
    for (const [k, v] of [['EVAL_PROVIDER_ONLY', simpan.p], ['EVAL_LOCK_PROVIDER', simpan.l]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    jest.restoreAllMocks();
  });

  const jalan = async () => {
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    return payloadDari(f);
  };

  it('BAWAAN: nol kunci `provider` — jalur produksi tak tersentuh', async () => {
    delete process.env.EVAL_PROVIDER_ONLY;
    delete process.env.EVAL_LOCK_PROVIDER;
    expect(await jalan()).not.toHaveProperty('provider');
  });

  it('EVAL_PROVIDER_ONLY=DeepInfra → only:[DeepInfra] + allow_fallbacks:false', async () => {
    // `only` TANPA `allow_fallbacks:false` masih membiarkan OpenRouter memilih
    // di dalam daftar; keduanya harus berjalan bersama supaya benar-benar satu.
    process.env.EVAL_PROVIDER_ONLY = 'DeepInfra';
    expect((await jalan()).provider).toEqual({ only: ['DeepInfra'], allow_fallbacks: false });
  });

  it('pin menyalakan kunci rute SENDIRI — tidak perlu EVAL_LOCK_PROVIDER terpisah', async () => {
    process.env.EVAL_PROVIDER_ONLY = 'DeepInfra';
    delete process.env.EVAL_LOCK_PROVIDER;
    expect((await jalan()).provider.allow_fallbacks).toBe(false);
  });

  it('daftar dipisah koma, spasi dirapikan, entri kosong dibuang', async () => {
    process.env.EVAL_PROVIDER_ONLY = ' DeepInfra , StreamLake ,, ';
    expect((await jalan()).provider.only).toEqual(['DeepInfra', 'StreamLake']);
  });

  it('nilai kosong DIABAIKAN — tidak mengirim only:[] yang berarti "tidak ada penyedia"', async () => {
    // `only: []` bukan "tanpa pin", ia "tidak boleh penyedia mana pun" — payload
    // yang mustahil dipenuhi. Kelas kegagalan yang tampil sebagai error hulu
    // dan mengarahkan orang mencari masalah di tempat yang salah.
    process.env.EVAL_PROVIDER_ONLY = '   ';
    delete process.env.EVAL_LOCK_PROVIDER;
    expect(await jalan()).not.toHaveProperty('provider');
  });

  it('EVAL_LOCK_PROVIDER=true TANPA pin tetap seperti dulu — allow_fallbacks saja', async () => {
    // Sengaja dipertahankan apa adanya. Dokumentasi membuktikan bentuk ini TIDAK
    // mengunci; yang menyatakannya tidak cukup adalah vonis di `kesahihan.mjs`,
    // bukan diam-diam diubah artinya di sini.
    delete process.env.EVAL_PROVIDER_ONLY;
    process.env.EVAL_LOCK_PROVIDER = 'true';
    expect((await jalan()).provider).toEqual({ allow_fallbacks: false });
  });

  it('B6 — nilai boolean-mirip DITOLAK, tidak jadi nama penyedia', async () => {
    // Saklar tetangganya di `.env.example` berbentuk `EVAL_LOCK_PROVIDER=false`,
    // jadi `EVAL_PROVIDER_ONLY=false` untuk mematikannya adalah kekeliruan yang
    // WAJAR. Tanpa penyaringan: `only:['false']` → penyedia yang tidak ada →
    // 4xx non-transient → tidak di-retry → SELURUH putaran pengukuran mati,
    // dengan pesan yang tidak menyebut pin sama sekali.
    for (const buruk of ['false', 'true', '0', 'off', 'no', 'none', 'NULL']) {
      process.env.EVAL_PROVIDER_ONLY = buruk;
      delete process.env.EVAL_LOCK_PROVIDER;
      expect(await jalan()).not.toHaveProperty('provider');
    }
  });

  it('nilai boolean-mirip di TENGAH daftar dibuang, sisanya tetap dipakai', async () => {
    process.env.EVAL_PROVIDER_ONLY = 'deepinfra, false, parasail';
    expect((await jalan()).provider.only).toEqual(['deepinfra', 'parasail']);
  });

  it('dibaca SAAT DIPAKAI', async () => {
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    const s = makeService();
    process.env.EVAL_PROVIDER_ONLY = 'DeepInfra';
    await s.chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).provider.only).toEqual(['DeepInfra']);
  });
});
