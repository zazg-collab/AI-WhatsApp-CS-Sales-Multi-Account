import { AiProviderService } from './ai-provider.service';

/**
 * >>> ANGGA — F6 Bagian 1 (2026-08-11, cowork): spec ini SENGAJA hanya memakai
 * API publik LAMA (`chatWithTools` + `global.fetch`), tanpa mengimpor satu pun
 * simbol baru. Alasannya prosedural: ts-jest melakukan type-check, jadi spec
 * yang mengimpor modul yang belum ada gagal COMPILE — dan "suite failed to run"
 * adalah RED yang lemah, ia hijau-merahnya tidak membuktikan assertion-nya
 * benar. Spec ini dijalankan lebih dulu dan MERAH di level assertion.
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
    id: 'gen-123',
    provider: 'DeepSeek',
    choices: [{ message: { content: 'halo' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1200, completion_tokens: 80 },
  }),
});

const payloadDari = (f: jest.Mock) => JSON.parse((f.mock.calls[0][1] as any).body);

describe('AiProviderService — kunci rute penyedia (EVAL_LOCK_PROVIDER)', () => {
  const realFetch = global.fetch;
  const realEnv = process.env.EVAL_LOCK_PROVIDER;
  afterEach(() => {
    global.fetch = realFetch;
    if (realEnv === undefined) delete process.env.EVAL_LOCK_PROVIDER;
    else process.env.EVAL_LOCK_PROVIDER = realEnv;
    jest.restoreAllMocks();
  });

  it('BAWAAN: payload TIDAK memuat kunci `provider` — jalur produksi tak tersentuh', async () => {
    delete process.env.EVAL_LOCK_PROVIDER;
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f)).not.toHaveProperty('provider');
  });

  it('EVAL_LOCK_PROVIDER=true → provider.allow_fallbacks === false', async () => {
    process.env.EVAL_LOCK_PROVIDER = 'true';
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).provider).toEqual({ allow_fallbacks: false });
  });

  it('saklar dibaca SAAT DIPAKAI, bukan konstanta tingkat modul', async () => {
    // Service dikonstruksi DULU, env dinyalakan SESUDAHNYA. Kalau saklarnya
    // dibaca saat modul dimuat, test ini merah — kelas kesalahan yang persis
    // sudah sekali menjebak `REPLY_CONTRACT_ENABLED` (audit selesai-167).
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    const s = makeService();
    process.env.EVAL_LOCK_PROVIDER = 'true';
    await s.chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f).provider).toEqual({ allow_fallbacks: false });
  });

  it('nilai selain "true" TIDAK mengunci — saklar tidak boleh nyala karena "1"/"false"', async () => {
    process.env.EVAL_LOCK_PROVIDER = 'false';
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    expect(payloadDari(f)).not.toHaveProperty('provider');
  });
});
