import { AiService } from './ai.service';
import { bukaJejakAi, denganJejakAi, ringkasJejakAi } from '../../common/ai-call-trace';

/**
 * >>> BARU-1 irisan A — RONDE 3 audit K23 (2026-08-11, cowork).
 *
 * Dua penyanggal, terpisah, menemukan cacat yang sama di versi pertama
 * pencatat tool: ia mencatat saat tool **DIMINTA**, bukan saat tool
 * **DIJALANKAN**. Akibatnya dua kebohongan, dan dua-duanya menyentuh nama
 * yang justru menentukan hipotesis "dua mesin menulis kunci cache ongkir":
 *
 *  · argumen terpotong → `JSON.parse` melempar → `llmCalculateShipping` tidak
 *    pernah dipanggil, cache tidak ditulis — tapi `calculate_shipping` tetap
 *    masuk daftar "tool yang dijalankan";
 *  · nama halusinasi yang jatuh ke `Unknown function` juga tercatat.
 *
 * Berkas ini mengunci perbaikannya. Tanpa test ini, perbaikannya cuma klaim.
 */
describe('AiService — jejak tool yang DIJALANKAN (bukan yang diminta)', () => {
  const envAsli = process.env.REPLY_CONTRACT_ENABLED;
  beforeEach(() => {
    delete process.env.REPLY_CONTRACT_ENABLED;
  });
  afterAll(() => {
    if (envAsli !== undefined) process.env.REPLY_CONTRACT_ENABLED = envAsli;
  });

  /** Provider yang memulangkan SATU batch tool lalu teks final. */
  const buat = (toolCalls: any[], overShipping: any = {}) => {
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
    const chatWithTools = jest
      .fn()
      .mockResolvedValueOnce({ content: '', tool_calls: toolCalls })
      .mockResolvedValue({ content: 'Siap kak 😊', tool_calls: [] });
    const provider: any = {
      chat: jest.fn(),
      chatWithTools,
      defaultModel: jest.fn().mockResolvedValue('m'),
      listModels: jest.fn(),
      getConfig: jest.fn(),
    };
    const prompts: any = {
      buildForConversation: jest.fn().mockResolvedValue([]),
      llmSearchKnowledge: jest.fn().mockResolvedValue({ ok: true }),
      settings: { ai: jest.fn().mockResolvedValue({ ragMode: 'hybrid' }) },
    };
    const shipping: any = {
      komposisiFunnel: jest.fn(),
      resolvePriceTokens: jest.fn(async (_i: string, t: string) => ({ text: t, ok: true, issues: [] })),
      llmSearchDestinations: jest.fn().mockResolvedValue({ ok: true }),
      llmCalculateShipping: jest.fn().mockResolvedValue({ ok: true }),
      ...overShipping,
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
    return { svc, shipping };
  };

  /** Jalankan satu giliran di dalam penampung jejak, pulangkan daftar tool. */
  const jalankan = async (toolCalls: any[], overShipping: any = {}) => {
    const { svc, shipping } = buat(toolCalls, overShipping);
    const sink = bukaJejakAi();
    await denganJejakAi(sink, async () => {
      // Panggilan LLM sungguhan dicatat di `AiProviderService.chatWithTools`,
      // yang di sini di-mock — jadi entrinya disuntik tangan supaya
      // `catatToolDijalankan` punya tempat menempel, persis seperti produksi.
      const { catatPanggilanAi } = await import('../../common/ai-call-trace');
      catatPanggilanAi({
        modelDiminta: 'm', modelDilayani: null, penyedia: null, idGenerasi: null,
        promptTokens: null, completionTokens: null, finishReason: null, percobaan: 1,
        ms: 0, temperature: 0, seed: null,
        lenganEval: { temperature: null, seed: null, kunciRute: false, pinPenyedia: null },
        payloadMintaKunciRute: false, galat: null,
      });
      await svc.generateReply('c1');
    });
    return { tool: ringkasJejakAi(sink).toolDijalankan, shipping };
  };

  const panggil = (name: string, args: string) => [
    { id: 't1', type: 'function', function: { name, arguments: args } },
  ];

  it('tool DIKENAL dengan argumen sah → tercatat, dan implementasinya memang jalan', async () => {
    const { tool, shipping } = await jalankan(
      panggil('calculate_shipping', JSON.stringify({ destination_id: 'd1', city: 'Mataram', province: 'NTB', label: 'L' })),
    );
    expect(tool).toEqual(['calculate_shipping']);
    expect(shipping.llmCalculateShipping).toHaveBeenCalled();
  });

  it('ARGUMEN RUSAK → NOL catatan, karena toolnya memang tidak pernah jalan', async () => {
    // Kelas kegagalan nyata di repo ini: `finish_reason:'length'` memotong
    // argumen di tengah. Kalau ini tercatat, penyelidik menyimpulkan mesin
    // tool menulis cache di giliran itu — padahal nol yang tersentuh.
    const { tool, shipping } = await jalankan(panggil('calculate_shipping', '{"destination_id":"d1"'));
    expect(tool).toEqual([]);
    expect(shipping.llmCalculateShipping).not.toHaveBeenCalled();
  });

  it('NAMA HALUSINASI → NOL catatan (jatuh ke Unknown function)', async () => {
    const { tool, shipping } = await jalankan(panggil('hitung_ongkir', JSON.stringify({ kota: 'Mataram' })));
    expect(tool).toEqual([]);
    expect(shipping.llmCalculateShipping).not.toHaveBeenCalled();
    expect(shipping.llmSearchDestinations).not.toHaveBeenCalled();
  });

  it('tool yang MELEMPAR di tengah TETAP tercatat — semantiknya percobaan, bukan sukses', async () => {
    // Ia bisa sudah menulis cache sebelum melempar, dan justru itu yang
    // sedang diselidiki. Kehilangan jejaknya = kehilangan tersangkanya.
    const { tool } = await jalankan(
      panggil('calculate_shipping', JSON.stringify({ destination_id: 'd1' })),
      { llmCalculateShipping: jest.fn().mockRejectedValue(new Error('kurir mati')) },
    );
    expect(tool).toEqual(['calculate_shipping']);
  });

  it('pengulangan TIDAK di-dedup — dua kali panggil = dua catatan', async () => {
    const dua = [
      { id: 't1', type: 'function', function: { name: 'calculate_shipping', arguments: '{"destination_id":"d1"}' } },
      { id: 't2', type: 'function', function: { name: 'calculate_shipping', arguments: '{"destination_id":"d1"}' } },
    ];
    const { tool } = await jalankan(dua);
    expect(tool).toEqual(['calculate_shipping', 'calculate_shipping']);
  });
});
