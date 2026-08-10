import { AiService } from './ai.service';

/**
 * >>> ANGGA — F4 (2026-08-09, cowork): perilaku LOOP terhadap `send_reply`.
 *
 * Yang dijaga di sini adalah keputusan-keputusan yang tidak kelihatan dari
 * skema tool-nya, dan justru di situlah mutu jawaban bisa turun diam-diam:
 *   · `send_reply` yang datang BARENGAN tool data harus KALAH (kalau tidak,
 *     model menjawab dengan angka yang belum ia baca — persis kelas bug yang
 *     mau kita hapus);
 *   · percobaan PAKSA hanya boleh jalan kalau tidak ada teks sama sekali
 *     (kalau tidak, setiap giliran bayar satu perjalanan bolak-balik ekstra
 *     hanya untuk mendapat label enum);
 *   · komposisi kalimat funnel dipanggil dengan teks yang SUDAH final.
 */
/**
 * >>> ANGGA — 2026-08-10 (ronde penyanggal): saklar dipaksa MENYALA secara
 * eksplisit di `beforeEach`, dan dikembalikan di `afterAll`.
 *
 * Versi sebelumnya memakai `jest.requireActual` dan komentarnya mengklaim
 * memakai `jest.isolateModules` — padahal fungsi itu tidak pernah dipanggil.
 * Test-nya kebetulan tetap hijau (auditor mengira gagal; dijalankan, ternyata
 * lulus), tapi ia hijau karena detail internal registry Jest, bukan karena
 * niatnya terbaca. Sekarang saklar dibaca SAAT DIPAKAI (`kontrakBalasanAktif()`),
 * jadi cukup menyetel env — tidak perlu akal-akalan memuat ulang modul, dan
 * tidak ada lagi komentar yang berbohong soal caranya.
 */
const envAsli = process.env.REPLY_CONTRACT_ENABLED;
beforeEach(() => {
  process.env.REPLY_CONTRACT_ENABLED = 'true';
});
afterAll(() => {
  if (envAsli === undefined) delete process.env.REPLY_CONTRACT_ENABLED;
  else process.env.REPLY_CONTRACT_ENABLED = envAsli;
});

describe('AiService — Reply Contract (F4, di balik saklar)', () => {
  const buatHarness = () => {
    const prisma: any = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          customerId: 'cust1',
          bot: { language: 'id', knowledgeBaseId: null },
          whatsappAccountId: 'a1',
        }),
        update: jest.fn().mockReturnValue({ catch: jest.fn() }),
      },
      customer: { findUnique: jest.fn().mockResolvedValue({ leadStage: 'cold' }), update: jest.fn() },
      whatsappAccount: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const provider: any = {
      chat: jest.fn(),
      chatWithTools: jest.fn(),
      listModels: jest.fn(),
      getConfig: jest.fn(),
      defaultModel: jest.fn().mockResolvedValue('m'),
    };
    const prompts: any = {
      buildForConversation: jest.fn().mockResolvedValue([]),
      llmSearchKnowledge: jest.fn(),
      settings: { ai: jest.fn().mockResolvedValue({ ragMode: 'hybrid' }) },
    };
    const cache: any = { get: jest.fn().mockReturnValue(null), set: jest.fn() };
    const metrics: any = {
      aiRequests: { inc: jest.fn() },
      aiRequestDuration: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
      replyContract: { inc: jest.fn() },
    };
    const shipping: any = {
      llmSearchDestinations: jest.fn().mockResolvedValue([{ id: 'd1', label: 'MATARAM' }]),
      llmCalculateShipping: jest.fn().mockResolvedValue({ cost: 50000 }),
      komposisiFunnel: jest.fn((_id: string, teks: string) => ({
        text: teks,
        step: null,
        disisipkan: false,
        salinanDibuang: 0,
      })),
      resolvePriceTokens: jest.fn(async (_id: string, teks: string) => ({ text: teks, ok: true, issues: [] })),
    };
    const svc = new (AiService as any)(
      prisma, provider, prompts, { send: jest.fn() }, cache, undefined, metrics, shipping,
    ) as AiService;
    return { svc, provider, metrics, shipping };
  };

  const panggilan = (name: string, args: unknown) => ({
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  });

  it('balasan diambil dari argumen send_reply, bukan dari content', async () => {
    const { svc, provider, metrics } = buatHarness();
    provider.chatWithTools.mockResolvedValueOnce({
      content: 'ini cuma gumaman model',
      tool_calls: [panggilan('send_reply', { answer: 'Ongkirnya Rp50.000 kak', funnel_question_id: 'qty', data_status: 'computed' })],
    });
    const r = await svc.generateReply('c1');
    expect(r.text).toBe('Ongkirnya Rp50.000 kak');
    expect(provider.chatWithTools).toHaveBeenCalledTimes(1);
    expect(metrics.replyContract.inc).toHaveBeenCalledWith({ outcome: 'honored', funnel_declared: 'qty' });
  });

  it('send_reply BARENGAN tool data → tool data menang, model diminta mengulang', async () => {
    const { svc, provider, shipping } = buatHarness();
    provider.chatWithTools
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [
          panggilan('search_destinations', { keyword: 'mataram' }),
          panggilan('send_reply', { answer: 'Ongkirnya sekitar 30rb kak', funnel_question_id: 'qty', data_status: 'unavailable' }),
        ],
      })
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [panggilan('send_reply', { answer: 'Ongkirnya Rp50.000 kak', funnel_question_id: 'qty', data_status: 'computed' })],
      });
    const r = await svc.generateReply('c1');
    expect(shipping.llmSearchDestinations).toHaveBeenCalled();
    expect(r.text).toBe('Ongkirnya Rp50.000 kak');
  });

  it('model menjawab teks polos → dipakai apa adanya, TANPA panggilan paksa', async () => {
    const { svc, provider, metrics } = buatHarness();
    provider.chatWithTools.mockResolvedValueOnce({ content: 'Halo kak', tool_calls: [] });
    const r = await svc.generateReply('c1');
    expect(r.text).toBe('Halo kak');
    expect(provider.chatWithTools).toHaveBeenCalledTimes(1);
    expect(metrics.replyContract.inc).toHaveBeenCalledWith({ outcome: 'fallback', funnel_declared: 'unreported' });
  });

  it('teks KOSONG dan tanpa kontrak → satu panggilan paksa dengan tool_choice dipin', async () => {
    const { svc, provider } = buatHarness();
    provider.chatWithTools
      .mockResolvedValueOnce({ content: '', tool_calls: [] })
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [panggilan('send_reply', { answer: 'Baik kak', funnel_question_id: 'none', data_status: 'computed' })],
      });
    const r = await svc.generateReply('c1');
    expect(r.text).toBe('Baik kak');
    expect(provider.chatWithTools).toHaveBeenCalledTimes(2);
    const opsiPaksa = provider.chatWithTools.mock.calls[1][1];
    expect(opsiPaksa.toolChoice).toEqual({ type: 'function', function: { name: 'send_reply' } });
    expect(opsiPaksa.tools).toHaveLength(1);
  });

  it('kontrak yang didapat lewat panggilan PAKSA dicatat sebagai forced, bukan honored', async () => {
    const { svc, provider, metrics } = buatHarness();
    provider.chatWithTools
      .mockResolvedValueOnce({ content: '', tool_calls: [] })
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [panggilan('send_reply', { answer: 'Baik kak', funnel_question_id: 'none', data_status: 'computed' })],
      });
    await svc.generateReply('c1');
    expect(metrics.replyContract.inc).toHaveBeenCalledWith({ outcome: 'forced', funnel_declared: 'none' });
  });

  it('data_status yang dinyatakan model diteruskan ke gerbang uang', async () => {
    const { svc, provider, shipping } = buatHarness();
    provider.chatWithTools.mockResolvedValueOnce({
      content: '',
      tool_calls: [panggilan('send_reply', { answer: 'Saya belum punya datanya', funnel_question_id: 'none', data_status: 'unavailable' })],
    });
    await svc.generateReply('c1');
    expect(shipping.resolvePriceTokens).toHaveBeenCalledWith('c1', 'Saya belum punya datanya', {
      dataStatus: 'unavailable',
    });
  });

  /**
   * Lubang yang hampir lolos di F4 gelombang pertama: teks hasil RETRY gerbang
   * uang dulu masuk gerbang tanpa lewat komposisi — artinya deadlock
   * `funnel_dilanggar` tetap hidup justru di jalur tempat ia paling sering
   * muncul.
   */
  it('teks hasil RETRY gerbang uang ikut disusun ulang sebelum digerbangi', async () => {
    const { svc, provider, shipping } = buatHarness();
    provider.chat = jest.fn().mockResolvedValue('Totalnya Rp161.000 kak');
    shipping.resolvePriceTokens = jest
      .fn()
      .mockResolvedValueOnce({ text: 'awal', ok: false, issues: ['x'], issueCodes: ['digit_mentah'] })
      .mockResolvedValueOnce({ text: 'akhir', ok: true, issues: [], issueCodes: [] });
    provider.chatWithTools.mockResolvedValueOnce({
      content: '',
      tool_calls: [panggilan('send_reply', { answer: 'Totalnya 161000', funnel_question_id: 'total', data_status: 'computed' })],
    });
    await svc.generateReply('c1');
    // dipanggil dua kali: sekali untuk balasan awal, sekali untuk teks retry
    expect(shipping.komposisiFunnel).toHaveBeenCalledTimes(2);
    expect(shipping.komposisiFunnel).toHaveBeenLastCalledWith('c1', 'Totalnya Rp161.000 kak', { tempel: undefined });
  });

  it('panggilan paksa yang MELEDAK tidak menggagalkan balasan', async () => {
    const { svc, provider } = buatHarness();
    provider.chatWithTools
      .mockResolvedValueOnce({ content: '', tool_calls: [] })
      .mockRejectedValueOnce(new Error('provider mati'));
    await expect(svc.generateReply('c1')).resolves.toMatchObject({ text: '' });
  });

  it('argumen send_reply rusak → model diberi tahu, hasil akhirnya dicatat malformed', async () => {
    const { svc, provider, metrics } = buatHarness();
    provider.chatWithTools
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [{ id: 'x', type: 'function', function: { name: 'send_reply', arguments: '{rusak' } }],
      })
      .mockResolvedValueOnce({ content: 'Halo kak', tool_calls: [] });
    const r = await svc.generateReply('c1');
    expect(r.text).toBe('Halo kak');
    expect(metrics.replyContract.inc).toHaveBeenCalledWith({ outcome: 'malformed', funnel_declared: 'unreported' });
  });

  /**
   * G4 di blueprint: kalau jalur burst tidak ikut kontrak komposisi, ada DUA
   * bentuk balasan di sistem yang sama dan kelas `funnel_dilanggar` yang sudah
   * mustahil di jalur tunggal tetap hidup di jalur burst.
   */
  it('burst: kalimat wajib dibersihkan dari segmen awal, dipasang di segmen TERAKHIR', async () => {
    const { svc, provider, shipping } = buatHarness();
    provider.chat = jest.fn().mockResolvedValue(
      JSON.stringify({
        segments: [
          { menjawab: 1, balasan: 'Stoknya ada kak.' },
          { menjawab: 2, balasan: 'Ongkirnya Rp50.000.' },
        ],
      }),
    );
    const hasil = await svc.generateSegmentedReply('c1', [
      { index: 1, content: 'ready?', messageType: 'text' },
      { index: 2, content: 'ongkir?', messageType: 'text' },
    ]);
    expect(hasil).toHaveLength(2);
    expect(shipping.komposisiFunnel).toHaveBeenNthCalledWith(1, 'c1', 'Stoknya ada kak.', { tempel: false });
    expect(shipping.komposisiFunnel).toHaveBeenNthCalledWith(2, 'c1', 'Ongkirnya Rp50.000.', { tempel: true });
  });

  it('komposisi funnel menerima teks FINAL dan hasilnya yang dipakai', async () => {
    const { svc, provider, shipping } = buatHarness();
    shipping.komposisiFunnel.mockReturnValue({
      text: 'Ongkirnya Rp50.000 kak\n\nMau berapa pcs kak?',
      step: 'qty',
      disisipkan: true,
      salinanDibuang: 0,
    });
    provider.chatWithTools.mockResolvedValueOnce({
      content: '',
      tool_calls: [panggilan('send_reply', { answer: 'Ongkirnya Rp50.000 kak', funnel_question_id: 'qty', data_status: 'computed' })],
    });
    const r = await svc.generateReply('c1');
    expect(shipping.komposisiFunnel).toHaveBeenCalledWith('c1', 'Ongkirnya Rp50.000 kak');
    expect(r.text).toBe('Ongkirnya Rp50.000 kak\n\nMau berapa pcs kak?');
  });
});
