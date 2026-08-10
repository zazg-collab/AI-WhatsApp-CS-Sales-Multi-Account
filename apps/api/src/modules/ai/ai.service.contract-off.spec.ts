import { AiService } from './ai.service';

/**
 * >>> ANGGA — 2026-08-10 (ketok Bossfren sesudah uji lapangan). Reply Contract
 * dimatikan secara bawaan; spec ini menjaga bahwa "mati" benar-benar berarti
 * PERILAKU PRA-F4, bukan setengah mati.
 *
 * Tiga hal yang dijaga, dan ketiganya adalah gejala yang benar-benar terlihat
 * di sesi uji Bossfren saat fiturnya menyala:
 *  1. tool `send_reply` tidak boleh ikut dikirim ke provider;
 *  2. `komposisiFunnel` tidak boleh dipanggil — inilah yang dulu menggandakan
 *     pertanyaan saat model memparafrase, dan sempat mengarang balasan dari
 *     kekosongan;
 *  3. anggaran token kembali 500, bukan 1500 (kenaikan itu bersamaan dengan
 *     munculnya timeout jaringan di UI).
 */
describe('AiService — Reply Contract MATI (bawaan)', () => {
  // >>> ANGGA — koreksi AUDIT (2026-08-10): saklar dipaksa MATI, tidak lagi
  // bersandar pada env yang kebetulan kosong. Di mesin/CI yang mengekspor
  // REPLY_CONTRACT_ENABLED=true, versi sebelumnya gagal — padahal yang dijaga
  // justru perilaku BAWAAN. <<<
  const envAsli = process.env.REPLY_CONTRACT_ENABLED;
  beforeEach(() => {
    delete process.env.REPLY_CONTRACT_ENABLED;
  });
  afterAll(() => {
    if (envAsli !== undefined) process.env.REPLY_CONTRACT_ENABLED = envAsli;
  });

  const buat = () => {
    const prisma: any = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          customerId: 'c', bot: { language: 'id', knowledgeBaseId: null }, whatsappAccountId: 'a1',
        }),
        update: jest.fn().mockReturnValue({ catch: jest.fn() }),
      },
      customer: { findUnique: jest.fn().mockResolvedValue({ leadStage: 'cold' }), update: jest.fn() },
      whatsappAccount: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const provider: any = {
      chat: jest.fn(),
      chatWithTools: jest.fn().mockResolvedValue({ content: 'Ongkirnya Rp50.000 kak', tool_calls: [] }),
      defaultModel: jest.fn().mockResolvedValue('m'),
      listModels: jest.fn(),
      getConfig: jest.fn(),
    };
    const prompts: any = {
      buildForConversation: jest.fn().mockResolvedValue([]),
      llmSearchKnowledge: jest.fn(),
      settings: { ai: jest.fn().mockResolvedValue({ ragMode: 'hybrid' }) },
    };
    const shipping: any = {
      komposisiFunnel: jest.fn(),
      resolvePriceTokens: jest.fn(async (_i: string, t: string) => ({ text: t, ok: true, issues: [] })),
      llmSearchDestinations: jest.fn(),
      llmCalculateShipping: jest.fn(),
    };
    const metrics: any = {
      aiRequests: { inc: jest.fn() },
      aiRequestDuration: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
      replyContract: { inc: jest.fn() },
    };
    const svc = new (AiService as any)(
      prisma, provider, prompts, { send: jest.fn() },
      { get: jest.fn().mockReturnValue(null), set: jest.fn() },
      undefined, metrics, shipping,
    ) as AiService;
    return { svc, provider, shipping, metrics };
  };

  it('tool send_reply TIDAK dikirim ke provider', async () => {
    const { svc, provider } = buat();
    await svc.generateReply('c1');
    const tools = provider.chatWithTools.mock.calls[0][1].tools ?? [];
    expect(tools.map((t: any) => t.function?.name)).not.toContain('send_reply');
  });

  it('komposisiFunnel TIDAK dipanggil — kalimat funnel kembali urusan model', async () => {
    const { svc, shipping } = buat();
    await svc.generateReply('c1');
    expect(shipping.komposisiFunnel).not.toHaveBeenCalled();
  });

  it('anggaran token kembali 500, dan telemetri kontrak tidak dipancarkan', async () => {
    const { svc, provider, metrics } = buat();
    await svc.generateReply('c1');
    expect(provider.chatWithTools.mock.calls[0][1].maxTokens).toBe(500);
    expect(metrics.replyContract.inc).not.toHaveBeenCalled();
  });

  it('saklar bisa dinyalakan lewat env SAAT RUNTIME (dibaca ketika dipakai, bukan saat modul dimuat)', async () => {
    // Penjaga akar T1: kalau saklar kembali jadi konstanta tingkat modul,
    // test ini merah — dan itulah yang membuat `.env` tidak pernah berefek.
    const { svc, provider } = buat();
    process.env.REPLY_CONTRACT_ENABLED = 'true';
    await svc.generateReply('c1');
    const tools = provider.chatWithTools.mock.calls[0][1].tools ?? [];
    expect(tools.map((t: any) => t.function?.name)).toContain('send_reply');
  });

  it('teks model dipakai apa adanya, tanpa disentuh komposisi', async () => {
    const { svc } = buat();
    const r = await svc.generateReply('c1');
    expect(r.text).toBe('Ongkirnya Rp50.000 kak');
  });
});
