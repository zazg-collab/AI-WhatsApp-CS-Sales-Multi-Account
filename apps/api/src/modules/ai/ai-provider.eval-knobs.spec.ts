import { AiProviderService } from './ai-provider.service';

/**
 * >>> ANGGA — F6 Bagian 1, OPSI C (2026-08-11, cowork): DUA LENGAN PENGUKURAN.
 *
 * Ketok Bossfren: gerbang F6 ("3x berulang, sebaran < 5 poin") adalah gerbang
 * VALIDASI ALAT, bukan gerbang mutu bot — nota handover menuliskannya sendiri:
 * "kalau sebarannya masih lebar, yang belum sah adalah alat ukurnya, bukan
 * botnya". Konsekuensinya lengan yang menjawab gerbang itu harus dijalankan
 * SEDETERMINISTIK MUNGKIN: di `temperature 0`, sisa sebaran apa pun tidak
 * mungkin berasal dari sampling model, jadi ia pasti cacat alat (keadaan DB
 * bocor antar putaran, urutan, cache, rute penyedia). Itu tepat yang dicari.
 *
 * Lengan kedua tetap `temperature` produksi (0.6) untuk memvonis F4 — kelas bug
 * yang membunuh F4 (model MEMPARAFRASE kalimat funnel lalu komposisi
 * menempelkan versi kanonik → pertanyaan dobel terkirim) adalah fenomena
 * SAMPLING, dan di temperature 0 ia sebagian besar lenyap. Mengukur F4 di
 * lengan 1 akan memvonisnya "tidak menambah nilai" karena alasan yang salah.
 *
 * Spec ini sengaja hanya memakai API publik lama supaya MERAH di level
 * assertion, bukan gagal compile.
 */
function makeService(temperature = 0.6) {
  const ai = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'k',
    model: 'deepseek/deepseek-v4-flash-0731',
    temperature,
    timeoutMs: 30_000,
  };
  return new AiProviderService({ ai: async () => ai } as any);
}

const balas = () => ({
  ok: true,
  json: async () => ({
    id: 'gen-1', provider: 'DeepSeek', model: 'deepseek/deepseek-v4-flash-0731',
    choices: [{ message: { content: 'halo' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }),
});
const payloadDari = (f: jest.Mock) => JSON.parse((f.mock.calls[0][1] as any).body);

describe('AiProviderService — tombol lengan eval (EVAL_TEMPERATURE / EVAL_SEED)', () => {
  const realFetch = global.fetch;
  const simpan = { t: process.env.EVAL_TEMPERATURE, s: process.env.EVAL_SEED };
  afterEach(() => {
    global.fetch = realFetch;
    for (const [k, v] of [['EVAL_TEMPERATURE', simpan.t], ['EVAL_SEED', simpan.s]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    jest.restoreAllMocks();
  });

  it('BAWAAN: temperature tetap dari settings, dan `seed` tidak dikirim', async () => {
    delete process.env.EVAL_TEMPERATURE;
    delete process.env.EVAL_SEED;
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService(0.6).chatWithTools([{ role: 'user', content: 'x' }]);
    const p = payloadDari(f);
    expect(p.temperature).toBe(0.6);
    expect(p).not.toHaveProperty('seed');
  });

  it('EVAL_TEMPERATURE=0 menimpa temperature settings', async () => {
    process.env.EVAL_TEMPERATURE = '0';
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService(0.6).chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).temperature).toBe(0);
  });

  /**
   * ⚠️ TEST INI DIBALIK ARAHNYA oleh audit K23 (ronde penyanggal, 2026-08-11),
   * dan itu disebut terang-terangan di pesan commit. Versi pertamanya menegakkan
   * "EVAL_TEMPERATURE menimpa JUGA temperature yang diminta pemanggil", dengan
   * alasan "Sentinel & learning-miner mengirim 0/0.1/0.2/0.3, mereka wajib ikut
   * dipatok". Inventaris pemanggil membuktikan alasan itu SALAH: yang mengirim
   * 0.1/0.2/0.3 semuanya dipicu ADMIN dan tidak pernah jalan di dalam giliran,
   * sementara pemanggil in-turn yang eksplisit sudah 0 semua. Jadi penimpaan
   * itu nol manfaat untuk giliran terukur, tapi membuat `minePersona`/
   * `minePlaybook` yang ditekan admin menulis baris DB permanen pada
   * temperature 0. Yang benar: tombol lengan jadi DEFAULT, bukan PENIMPA.
   */
  it('EVAL_TEMPERATURE TIDAK menimpa temperature yang diminta pemanggil', async () => {
    process.env.EVAL_TEMPERATURE = '0';
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService(0.6).chatWithTools([{ role: 'user', content: 'x' }], { temperature: 0.3 });
    expect(payloadDari(f).temperature).toBe(0.3);
  });

  it('...tapi TETAP memaku pemanggil yang DIAM — termasuk generator balasan utama', async () => {
    // Ini yang membuat tombolnya berguna: EMPAT pemanggil in-turn tidak
    // mengirim temperature sama sekali (`ai.service.ts:444` loop tool /
    // generator balasan utama, `:289` retry gerbang uang, `:606` percobaan
    // paksa, `:768` burst) sehingga jatuh ke `ai.temperature` = 0.6. Merekalah
    // sumber stokastisitas giliran, dan merekalah yang memang harus dipatok.
    process.env.EVAL_TEMPERATURE = '0';
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService(0.6).chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).temperature).toBe(0);
  });

  it('EVAL_SEED=42 mengirim seed; nilai bukan-angka DIABAIKAN, tidak bikin NaN', async () => {
    process.env.EVAL_SEED = '42';
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).seed).toBe(42);

    process.env.EVAL_SEED = 'bukan-angka';
    const g = jest.fn().mockResolvedValue(balas());
    global.fetch = g as any;
    await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(g)).not.toHaveProperty('seed');
  });

  it('EVAL_TEMPERATURE kosong/tak-berangka TIDAK menimpa apa pun', async () => {
    process.env.EVAL_TEMPERATURE = '';
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService(0.6).chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).temperature).toBe(0.6);
  });

  it('dibaca SAAT DIPAKAI — service dikonstruksi sebelum env dinyalakan', async () => {
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    const s = makeService(0.6);
    process.env.EVAL_TEMPERATURE = '0';
    await s.chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).temperature).toBe(0);
  });

  it('A8 — nilai di luar rentang DIABAIKAN, tidak diteruskan ke hulu', async () => {
    // `Number.isFinite` saja meloloskan 3 / -1 / 42.5 / 1e99, yang memancing 400
    // dari hulu — non-transient, tidak di-retry, dan menjatuhkan seluruh putaran
    // pengukuran dengan pesan yang mengarahkan orang mencari masalah di bot.
    for (const buruk of ['3', '-1', '1e99']) {
      process.env.EVAL_TEMPERATURE = buruk;
      const f = jest.fn().mockResolvedValue(balas());
      global.fetch = f as any;
      await makeService(0.6).chatWithTools([{ role: 'user', content: 'x' }]);
      expect(payloadDari(f).temperature).toBe(0.6);
    }
    delete process.env.EVAL_TEMPERATURE;
    for (const buruk of ['42.5', '-0.5']) {
      process.env.EVAL_SEED = buruk;
      const f = jest.fn().mockResolvedValue(balas());
      global.fetch = f as any;
      await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
      expect(payloadDari(f)).not.toHaveProperty('seed');
    }
  });

  it('batas rentang yang SAH tetap diterima (0 dan 2)', async () => {
    for (const baik of ['0', '2']) {
      process.env.EVAL_TEMPERATURE = baik;
      const f = jest.fn().mockResolvedValue(balas());
      global.fetch = f as any;
      await makeService(0.6).chatWithTools([{ role: 'user', content: 'x' }]);
      expect(payloadDari(f).temperature).toBe(Number(baik));
    }
  });
});
