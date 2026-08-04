import { LeadStage } from '@sentinel/database';
import { AiService, detectBuyingSignals } from './ai.service';

describe('AiService', () => {
  let service: AiService;
  let prisma: any;
  let provider: any;
  let prompts: any;
  let notifications: any;
  let cache: any;
  let metrics: any;

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ customerId: 'cust1', bot: { language: 'id' }, whatsappAccountId: 'a1' }),
        update: jest.fn().mockReturnValue({ catch: jest.fn() }),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ leadStage: 'cold' }),
        update: jest.fn(),
      },
      whatsappAccount: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    provider = {
      chat: jest.fn(),
      listModels: jest.fn().mockResolvedValue(['m1']),
      getConfig: jest.fn().mockReturnValue({ baseUrl: 'x', defaultModel: 'm' }),
      defaultModel: jest.fn().mockResolvedValue('default-model'),
    };
    prompts = { buildForConversation: jest.fn().mockResolvedValue([]) };
    notifications = { send: jest.fn() };
    cache = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      stats: jest.fn().mockReturnValue({ size: 0, hits: 0, misses: 0, hitRate: 0 }),
    };
    metrics = {
      aiRequests: { inc: jest.fn() },
      aiRequestDuration: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
    };
    const webhooks = { deliver: jest.fn().mockResolvedValue(undefined) };
    service = new AiService(prisma, provider, prompts, notifications, cache, webhooks as any, metrics as any);
  });

  it('listModels + config delegate to provider', () => {
    service.listModels();
    expect(provider.listModels).toHaveBeenCalled();
    expect(service.config()).toEqual({ baseUrl: 'x', defaultModel: 'm' });
  });

  describe('generateReply', () => {
    it('returns text + model', async () => {
      provider.chat.mockResolvedValue('hi there');
      const r = await service.generateReply('c1');
      // >>> ANGGA — Fase 113: moneyBlocked selalu false di sini karena
      // ShippingService tidak di-inject di harness ini (opsional) — gateMoneyTokens
      // jadi no-op. Dites lengkap dengan shipping asli di shipping.service.spec.ts.
      expect(r).toEqual({ text: 'hi there', model: 'default-model', moneyBlocked: false });
    });
    it('uses provided model name', async () => {
      provider.chat.mockResolvedValue('x');
      const r = await service.generateReply('c1', 'gpt-foo');
      expect(r.model).toBe('gpt-foo');
    });
    it('counts a real answer as outcome=success', async () => {
      provider.chat.mockResolvedValue('here is your answer');
      await service.generateReply('c1');
      expect(metrics.aiRequests.inc).toHaveBeenCalledWith({ outcome: 'success' });
    });
    it('counts the admin-confirm punt as outcome=fallback', async () => {
      provider.chat.mockResolvedValue('Untuk info tersebut saya bantu konfirmasi dulu ke admin ya kak.');
      await service.generateReply('c1');
      expect(metrics.aiRequests.inc).toHaveBeenCalledWith({ outcome: 'fallback' });
    });
    it('counts a provider error as outcome=error and rethrows', async () => {
      provider.chat.mockRejectedValue(new Error('boom'));
      await expect(service.generateReply('c1')).rejects.toThrow('boom');
      expect(metrics.aiRequests.inc).toHaveBeenCalledWith({ outcome: 'error' });
    });

    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): teks yang ditahan
    // gerbang uang dulu ditempel prefiks "⚠️ [gerbang uang menahan: ...]"
    // LANGSUNG ke `text` (= calon `content` pesan). Risikonya: kalau admin
    // klik Approve tanpa Edit dulu, teks debug internal itu ikut terkirim ke
    // pelanggan. Sekarang `text` harus BERSIH, alasannya pindah ke
    // `moneyGateIssues` yang terpisah.
    it('gerbang uang: text yang ditahan BERSIH tanpa prefiks "⚠️", alasan dipisah ke moneyGateIssues', async () => {
      provider.chat.mockResolvedValue('Totalnya {{total_transfer}} kak, jadi 139000 juga oke');
      const shipping = {
        resolvePriceTokens: jest.fn().mockResolvedValue({
          text: 'Totalnya Rp161.000 kak, jadi 139000 juga oke',
          ok: false,
          issues: ['Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000'],
        }),
      };
      const svc = new (service.constructor as any)(prisma, provider, prompts, notifications, cache, undefined, metrics, shipping);
      const r = await svc.generateReply('c1');
      expect(r.moneyBlocked).toBe(true);
      expect(r.text).not.toMatch(/⚠️/);
      expect(r.text).toBe('Totalnya Rp161.000 kak, jadi 139000 juga oke');
      expect(r.moneyGateIssues).toEqual(['Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000']);
    });

    it('gerbang uang: tidak ditahan → moneyGateIssues tidak ada/kosong', async () => {
      provider.chat.mockResolvedValue('Baik kak, ditunggu ya');
      const shipping = {
        resolvePriceTokens: jest.fn().mockResolvedValue({ text: 'Baik kak, ditunggu ya', ok: true, issues: [] }),
      };
      const svc = new (service.constructor as any)(prisma, provider, prompts, notifications, cache, undefined, metrics, shipping);
      const r = await svc.generateReply('c1');
      expect(r.moneyBlocked).toBe(false);
      expect(r.moneyGateIssues ?? []).toEqual([]);
    });

    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, audit gerbang uang #2):
    // ditahan gerbang uang tidak lagi langsung jatuh ke draft manual — dicoba
    // ULANG SEKALI dengan pesan koreksi konkret dulu. Kalau percobaan kedua
    // lolos, balasannya dipakai TANPA ditahan sama sekali.
    it('gerbang uang: percobaan ulang OTOMATIS lolos → balasan dipakai, tidak jadi ditahan', async () => {
      provider.chat
        .mockResolvedValueOnce('Bedog Betekok harganya Rp139.000, kak.')
        .mockResolvedValueOnce('Bedog Betekok harganya {{harga_satuan}}, kak.');
      const shipping = {
        resolvePriceTokens: jest
          .fn()
          .mockResolvedValueOnce({
            text: 'Bedog Betekok harganya Rp139.000, kak.',
            ok: false,
            issues: ['Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000'],
          })
          .mockResolvedValueOnce({ text: 'Bedog Betekok harganya Rp139.000, kak.', ok: true, issues: [] }),
      };
      const svc = new (service.constructor as any)(prisma, provider, prompts, notifications, cache, undefined, metrics, shipping);
      const r = await svc.generateReply('c1');
      expect(provider.chat).toHaveBeenCalledTimes(2);
      // Pesan koreksi ronde kedua menyertakan balasan yang ditahan + alasannya.
      const retryMessages = provider.chat.mock.calls[1][0];
      const lastMsg = retryMessages[retryMessages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content).toMatch(/Rp139\.000/);
      expect(lastMsg.content).toMatch(/Angka rupiah ditulis langsung/);
      expect(r.moneyBlocked).toBe(false);
      expect(r.text).toBe('Bedog Betekok harganya Rp139.000, kak.');
      expect(r.moneyGateIssues ?? []).toEqual([]);
    });

    it('gerbang uang: percobaan ulang tetap ditahan → jatuh ke draft manual dengan alasan dari percobaan KEDUA', async () => {
      provider.chat
        .mockResolvedValueOnce('Bedog Betekok harganya Rp139.000, kak.')
        .mockResolvedValueOnce('Bedog Betekok harganya Rp139.000 lagi, kak.');
      const shipping = {
        resolvePriceTokens: jest
          .fn()
          .mockResolvedValueOnce({
            text: 'Bedog Betekok harganya Rp139.000, kak.',
            ok: false,
            issues: ['percobaan pertama: 139000'],
          })
          .mockResolvedValueOnce({
            text: 'Bedog Betekok harganya Rp139.000 lagi, kak.',
            ok: false,
            issues: ['percobaan kedua: masih 139000'],
          }),
      };
      const svc = new (service.constructor as any)(prisma, provider, prompts, notifications, cache, undefined, metrics, shipping);
      const r = await svc.generateReply('c1');
      expect(provider.chat).toHaveBeenCalledTimes(2);
      expect(r.moneyBlocked).toBe(true);
      expect(r.text).not.toMatch(/⚠️/);
      expect(r.text).toBe('Bedog Betekok harganya Rp139.000 lagi, kak.');
      expect(r.moneyGateIssues).toEqual(['percobaan kedua: masih 139000']);
    });

    it('gerbang uang: kalau percobaan ulang sendiri gagal (provider error), tetap kembalikan hasil percobaan PERTAMA', async () => {
      provider.chat
        .mockResolvedValueOnce('Bedog Betekok harganya Rp139.000, kak.')
        .mockRejectedValueOnce(new Error('provider down'));
      const shipping = {
        resolvePriceTokens: jest.fn().mockResolvedValueOnce({
          text: 'Bedog Betekok harganya Rp139.000, kak.',
          ok: false,
          issues: ['percobaan pertama: 139000'],
        }),
      };
      const svc = new (service.constructor as any)(prisma, provider, prompts, notifications, cache, undefined, metrics, shipping);
      const r = await svc.generateReply('c1');
      expect(r.moneyBlocked).toBe(true);
      expect(r.text).toBe('Bedog Betekok harganya Rp139.000, kak.');
      expect(r.moneyGateIssues).toEqual(['percobaan pertama: 139000']);
    });
  });

  describe('generateSegmentedReply', () => {
    const burst = [
      { index: 1, content: 'harga berapa?', messageType: 'text' },
      { index: 2, content: 'stok L ada?', messageType: 'text' },
    ];

    it('parses per-topic segments and maps the answered message index', async () => {
      provider.chat.mockResolvedValue(
        '{"segments":[{"menjawab":1,"balasan":"Harganya 50rb"},{"menjawab":2,"balasan":"Stok L ada"}]}',
      );
      const r = await service.generateSegmentedReply('c1', burst);
      expect(r).toEqual([
        { answersIndex: 1, text: 'Harganya 50rb' },
        { answersIndex: 2, text: 'Stok L ada' },
      ]);
    });

    it('nulls out an index that is not in the burst', async () => {
      provider.chat.mockResolvedValue('{"segments":[{"menjawab":9,"balasan":"halo"}]}');
      const r = await service.generateSegmentedReply('c1', burst);
      expect(r).toEqual([{ answersIndex: null, text: 'halo' }]);
    });

    it('falls back to a single segment when output is not the expected JSON', async () => {
      provider.chat.mockResolvedValue('Baik kak, harganya 50rb dan stok L masih ada.');
      const r = await service.generateSegmentedReply('c1', burst);
      expect(r).toEqual([{ answersIndex: null, text: 'Baik kak, harganya 50rb dan stok L masih ada.' }]);
    });

    // >>> ANGGA — regresi insiden 2026-08-03: draft berisi keluaran model mentah.
    it('insiden asli: JSON valid + </sai> + salinan kedua tetap terbaca benar', async () => {
      provider.chat.mockResolvedValue(
        '{"segments":[{"menjawab":1,"balasan":"Mamuju Utara dan Mamuju itu berbeda lokasi, ya kak?"},'
        + '{"menjawab":2,"balasan":"Setelah dikonfirmasi, saya cek ongkirnya."}]}'
        + '</sai>{{"segments":[{"menjawab":1,"balasan":"duplikat"}]}}',
      );
      const r = await service.generateSegmentedReply('c1', burst);
      expect(r).toEqual([
        { answersIndex: 1, text: 'Mamuju Utara dan Mamuju itu berbeda lokasi, ya kak?' },
        { answersIndex: 2, text: 'Setelah dikonfirmasi, saya cek ongkirnya.' },
      ]);
      // Tidak ada sisa sampah model yang lolos ke teks balasan.
      expect(JSON.stringify(r)).not.toContain('sai');
      expect(JSON.stringify(r)).not.toContain('segments');
    });

    it('JSON rusak TIDAK pernah dipakai apa adanya — balasan dibuat ulang', async () => {
      // Panggilan 1 = jalur tersegmen (rusak/terpotong), panggilan 2 =
      // pembuatan ulang sebagai balasan tunggal oleh generateReply().
      provider.chat
        .mockResolvedValueOnce('{"segments":[{"menjawab":1,"balasan":"kepotong di tengah')
        .mockResolvedValueOnce('Halo kak, boleh dibantu ya.');
      const r = await service.generateSegmentedReply('c1', burst);
      expect(r).toEqual([{ answersIndex: null, text: 'Halo kak, boleh dibantu ya.' }]);
      // Yang dulu bocor ke kotak draft: potongan JSON mentahnya sendiri.
      expect(r[0].text).not.toContain('segments');
      expect(r[0].text).not.toContain('{');
    });
    // <<< ANGGA
  });

  describe('summarizeChat', () => {
    it('returns summary from provider', async () => {
      prompts.buildForConversation.mockResolvedValue([
        { role: 'system', content: 's' },
        { role: 'user', content: 'u' },
      ]);
      provider.chat.mockResolvedValue('ringkasan');
      expect(await service.summarizeChat('c1')).toBe('ringkasan');
    });
  });

  describe('analyzeSentiment', () => {
    it('parses sentiment JSON', async () => {
      prompts.buildForConversation.mockResolvedValue([
        { role: 'user', content: 'mantap, terima kasih' },
      ]);
      provider.chat.mockResolvedValue(
        '{"sentiment":"positive","score":85,"reason":"puas"}',
      );
      const r = await service.analyzeSentiment('c1');
      expect(r).toEqual({ sentiment: 'positive', score: 85, reason: 'puas' });
    });

    it('defaults to neutral on unparseable output', async () => {
      prompts.buildForConversation.mockResolvedValue([
        { role: 'user', content: 'halo' },
      ]);
      provider.chat.mockResolvedValue('not json at all');
      const r = await service.analyzeSentiment('c1');
      expect(r).toEqual({ sentiment: 'neutral', score: 50, reason: 'unparseable' });
    });
  });

  describe('leadScore', () => {
    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({ customerId: 'cust1', bot: { language: 'id' } });
      prisma.customer.update.mockResolvedValue({ name: 'Budi', phoneNumber: '628' });
    });

    it('throws when conversation missing', async () => {
      // null for both botLang call and the leadScore getConversation call
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.leadScore('c1')).rejects.toThrow('Conversation not found');
    });

    it('rejects an admin scoped to a different account (broken-access-control regression)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1' });
      prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'a2' }]);
      const scopedAdmin = { id: 'admin1', role: 'admin' };
      await expect(service.leadScore('c1', scopedAdmin as never)).rejects.toThrow();
      expect(provider.chat).not.toHaveBeenCalled();
    });

    it('parses plain JSON and persists', async () => {
      provider.chat.mockResolvedValue('{"score": 75, "stage": "hot", "reasons": ["tanya harga"]}');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(75);
      expect(r.stage).toBe(LeadStage.hot);
      expect(r.reasons).toEqual(['tanya harga']);
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust1' },
        data: { leadScore: 75, leadStage: LeadStage.hot },
      });
    });

    it('tolerates fenced ```json blocks', async () => {
      provider.chat.mockResolvedValue('```json\n{"score": 20, "stage": "cold", "reasons": []}\n```');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(20);
      expect(r.stage).toBe(LeadStage.cold);
    });

    it('tolerates prose-wrapped JSON', async () => {
      provider.chat.mockResolvedValue('Here is my analysis: {"score": 90, "stage": "very_hot", "reasons": ["DP"]} done.');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(90);
      expect(r.stage).toBe(LeadStage.very_hot);
    });

    it('derives stage from score when stage invalid', async () => {
      provider.chat.mockResolvedValue('{"score": 50, "reasons": []}');
      const r = await service.leadScore('c1');
      expect(r.stage).toBe(LeadStage.warm);
    });

    it('clamps score to 0-100', async () => {
      provider.chat.mockResolvedValue('{"score": 999, "stage": "very_hot", "reasons": []}');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(100);
    });

    it('falls back to cold on unparseable output', async () => {
      provider.chat.mockResolvedValue('totally not json');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(0);
      expect(r.stage).toBe(LeadStage.cold);
    });

    it('notifies on hot leads', async () => {
      provider.chat.mockResolvedValue('{"score": 70, "stage": "hot", "reasons": ["a","b"]}');
      await service.leadScore('c1');
      expect(notifications.send).toHaveBeenCalled();
    });

    it('does not notify on cold leads', async () => {
      provider.chat.mockResolvedValue('{"score": 10, "stage": "cold", "reasons": []}');
      await service.leadScore('c1');
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('floors a low LLM score when buying signals are present', async () => {
      // Customer clearly asks DP + payment (45+35=80) but the LLM under-scores.
      prompts.buildForConversation.mockResolvedValue([
        { role: 'user', content: 'kak mau DP dulu bisa? bayar transfer ya' },
      ]);
      provider.chat.mockResolvedValue('{"score": 20, "stage": "cold", "reasons": ["ragu"]}');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(80); // floored to the deterministic signal (45+35)
      expect(r.stage).toBe(LeadStage.hot); // 80 → hot (very_hot starts at 81)
      expect(r.reasons).toEqual(expect.arrayContaining(['booking/DP', 'metode bayar', 'ragu']));
    });

    it('keeps the higher LLM score when it exceeds the signal floor', async () => {
      prompts.buildForConversation.mockResolvedValue([
        { role: 'user', content: 'tanya harga dong' }, // 30
      ]);
      provider.chat.mockResolvedValue('{"score": 95, "stage": "very_hot", "reasons": ["siap closing"]}');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(95);
    });
  });

  describe('detectBuyingSignals', () => {
    it('returns 0 with no reasons for chit-chat', () => {
      expect(detectBuyingSignals(['halo kak', 'makasih ya'])).toEqual({ score: 0, reasons: [] });
    });
    it('weights and sums distinct triggers, capped at 100', () => {
      const r = detectBuyingSignals(['mau DP', 'bayar pakai transfer', 'harga berapa', 'stok ready?']);
      expect(r.score).toBe(100); // 45+35+30+20 = 130 → capped
      expect(r.reasons).toEqual(expect.arrayContaining(['booking/DP', 'metode bayar', 'tanya harga', 'cek stok']));
    });
    it('detects English phrasings', () => {
      expect(detectBuyingSignals(['what is the price?']).score).toBe(30);
    });
    it('handles empty/undefined input', () => {
      expect(detectBuyingSignals([])).toEqual({ score: 0, reasons: [] });
      expect(detectBuyingSignals(undefined as unknown as string[])).toEqual({ score: 0, reasons: [] });
    });
  });
});
