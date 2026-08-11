import { AiProviderService } from './ai-provider.service';
import { bukaJejakAi, denganJejakAi } from '../../common/ai-call-trace';

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

/** Badan respons ala OpenRouter. `provider` SENGAJA bisa absen — belum pernah
 *  kulihat sendiri dari repo ini, jadi ketiadaannya harus jadi kasus uji, bukan
 *  asumsi yang dibungkus optimisme. */
const balas = (over: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    id: 'gen-123',
    provider: 'DeepSeek',
    model: 'deepseek/deepseek-v4-flash-0731',
    choices: [{ message: { content: 'halo' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1200, completion_tokens: 80 },
    ...over,
  }),
});

describe('AiProviderService — jejak penyedia hulu & kunci rute', () => {
  const realFetch = global.fetch;
  const realEnv = process.env.EVAL_LOCK_PROVIDER;
  afterEach(() => {
    global.fetch = realFetch;
    if (realEnv === undefined) delete process.env.EVAL_LOCK_PROVIDER;
    else process.env.EVAL_LOCK_PROVIDER = realEnv;
    jest.restoreAllMocks();
  });

  it('mencatat penyedia hulu, id generasi, dan token dari badan respons', async () => {
    global.fetch = jest.fn().mockResolvedValue(balas()) as any;
    const jejak = bukaJejakAi();
    await denganJejakAi(jejak, () => makeService().chatWithTools([{ role: 'user', content: 'x' }]));
    expect(jejak).toHaveLength(1);
    expect(jejak[0]).toMatchObject({
      penyedia: 'DeepSeek',
      idGenerasi: 'gen-123',
      modelDiminta: 'deepseek/deepseek-v4-flash-0731',
      modelDilayani: 'deepseek/deepseek-v4-flash-0731',
      promptTokens: 1200,
      completionTokens: 80,
      finishReason: 'stop',
      percobaan: 1,
      galat: null,
    });
  });

  it('penyedia = null (BUKAN tebakan) kalau provider tidak dilaporkan', async () => {
    global.fetch = jest.fn().mockResolvedValue(balas({ provider: undefined, id: undefined })) as any;
    const jejak = bukaJejakAi();
    await denganJejakAi(jejak, () => makeService().chatWithTools([{ role: 'user', content: 'x' }]));
    expect(jejak[0].penyedia).toBeNull();
    expect(jejak[0].idGenerasi).toBeNull();
  });

  it('SATU entri per PERCOBAAN — percobaan yang gagal ikut tercatat, bukan ditelan', async () => {
    // Retry transient adalah tempat rute BERPINDAH penyedia. Kalau hanya
    // percobaan sukses yang dicatat, perpindahan itu tak terlihat — padahal
    // itu persis confound yang bikin `kosong` terukur 25%/0%/0%/0%.
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'upstream down' })
      .mockResolvedValueOnce(balas({ provider: 'Novita' })) as any;
    const jejak = bukaJejakAi();
    await denganJejakAi(jejak, () => makeService().chatWithTools([{ role: 'user', content: 'x' }]));
    expect(jejak).toHaveLength(2);
    expect(jejak[0]).toMatchObject({ percobaan: 1, penyedia: null });
    expect(jejak[0].galat).toContain('503');
    expect(jejak[1]).toMatchObject({ percobaan: 2, penyedia: 'Novita', galat: null });
  });

  it('BAWAAN: payload TIDAK memuat kunci `provider` sama sekali — produksi tak tersentuh', async () => {
    delete process.env.EVAL_LOCK_PROVIDER;
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    const payload = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(payload).not.toHaveProperty('provider');
  });

  it('EVAL_LOCK_PROVIDER=true → allow_fallbacks:false, dan dibaca SAAT DIPAKAI', async () => {
    const f = jest.fn().mockResolvedValue(balas());
    global.fetch = f as any;
    // Service dibuat DULU, env dinyalakan SESUDAHNYA. Kalau saklarnya konstanta
    // tingkat modul, test ini merah — kelas kesalahan yang sudah sekali
    // menjebak `REPLY_CONTRACT_ENABLED`.
    const s = makeService();
    process.env.EVAL_LOCK_PROVIDER = 'true';
    const jejak = bukaJejakAi();
    await denganJejakAi(jejak, () => s.chatWithTools([{ role: 'user', content: 'x' }]));
    const payload = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(payload.provider).toEqual({ allow_fallbacks: false });
    expect(jejak[0].payloadMintaKunciRute).toBe(true);
  });

  it('kegagalan jaringan tetap meninggalkan jejak, lalu galatnya tetap dilempar', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    const jejak = bukaJejakAi();
    await expect(
      denganJejakAi(jejak, () => makeService().chatWithTools([{ role: 'user', content: 'x' }])),
    ).rejects.toThrow();
    expect(jejak.length).toBeGreaterThanOrEqual(1);
    expect(jejak.every((e) => e.penyedia === null)).toBe(true);
    expect(jejak[0].galat).toContain('ECONNRESET');
  });

  it('TANPA penampung terbuka, chatWithTools tetap jalan normal', async () => {
    global.fetch = jest.fn().mockResolvedValue(balas()) as any;
    const res = await makeService().chatWithTools([{ role: 'user', content: 'x' }]);
    expect(res.content).toBe('halo');
  });
});
