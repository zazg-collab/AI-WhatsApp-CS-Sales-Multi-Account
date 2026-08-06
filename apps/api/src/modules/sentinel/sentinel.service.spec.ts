import { NotFoundException } from '@nestjs/common';
import { SentinelDecision, RiskLevel } from '@sentinel/database';
import { SentinelService } from './sentinel.service';

describe('SentinelService', () => {
  let service: SentinelService;
  let prisma: any;
  let provider: any;
  let prompts: any;
  let events: any;
  let notifications: any;
  let agent: any;

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn(), update: jest.fn() },
      sentinelReview: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _avg: {}, _count: { _all: 0 } }),
      },
      message: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      customer: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      bot: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    provider = { chat: jest.fn(), sentinelModel: jest.fn().mockResolvedValue('sentinel-model') };
    prompts = { buildForConversation: jest.fn().mockResolvedValue([]), getKnowledgeGroundingText: jest.fn().mockResolvedValue('') };
    events = { emit: jest.fn(), emitToAccount: jest.fn() };
    notifications = { send: jest.fn() };
    agent = { ask: jest.fn().mockResolvedValue(null) };
    const settings = {
      sentinel: jest.fn().mockResolvedValue({
        autoSendConfidenceMin: 90,
        draftConfidenceMin: 50,
        riskKeywords: '',
        defaultAiMode: 'ai_draft',
      }),
    };
    service = new SentinelService(prisma, provider, prompts, events, notifications, agent, settings as any);
  });

  describe('review', () => {
    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.review('c1', 'draft')).rejects.toThrow(NotFoundException);
    });

    it('approves high-confidence clean draft, no alert', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', botId: 'b1', messages: [{ content: 'halo tanya produk' }] });
      provider.chat.mockResolvedValue(JSON.stringify({
        decision: 'approve', confidence_score: 95, risk_score: 5,
        risk_level: 'low', reason: 'ok', recommendation: '',
      }));
      prisma.sentinelReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      const r: any = await service.review('c1', 'baik kak');
      expect(r.decision).toBe(SentinelDecision.approve);
      expect(events.emitToAccount).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('escalates via rules (refund) to most restrictive + emits alert', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', botId: 'b1', whatsappAccountId: 'a1', messages: [{ content: 'saya minta refund uang saya' }] });
      provider.chat.mockResolvedValue(JSON.stringify({
        decision: 'approve', confidence_score: 95, risk_score: 5,
        risk_level: 'low', reason: 'looks fine', recommendation: 'r',
      }));
      prisma.sentinelReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      const r: any = await service.review('c1', 'baik kak');
      expect(r.decision).toBe(SentinelDecision.takeover_required);
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'sentinel:alert', expect.anything());
      expect(notifications.send).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('floors an otherwise-approved decision at draft when multiTopicBurst is set', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', botId: 'b1', messages: [{ content: 'halo tanya produk' }] });
      provider.chat.mockResolvedValue(JSON.stringify({
        decision: 'approve', confidence_score: 95, risk_score: 5,
        risk_level: 'low', reason: 'ok', recommendation: '',
      }));
      prisma.sentinelReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      const r: any = await service.review('c1', 'baik kak', { multiTopicBurst: true });
      expect(r.decision).toBe(SentinelDecision.draft);
      expect(r.reason).toMatch(/topik berbeda/);
    });

    it('falls back to draft when LLM output unparseable', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', botId: 'b1', messages: [] });
      provider.chat.mockResolvedValue('garbage');
      prisma.sentinelReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      const r: any = await service.review('c1', 'x');
      expect(r.decision).toBe(SentinelDecision.draft);
      expect(r.riskLevel).toBe(RiskLevel.medium);
    });
  });

  describe('ask', () => {
    it('uses model when agent unavailable', async () => {
      provider.chat.mockResolvedValue('jawaban');
      const r = await service.ask('bagaimana performa?');
      expect(r.via).toBe('model');
      expect(r.answer).toBe('jawaban');
    });
    it('uses hermes-agent (sidecar) when available', async () => {
      agent.ask.mockResolvedValue('agent answer');
      const r = await service.ask('q');
      expect(r.via).toBe('hermes-agent');
    });
  });

  /**
   * >>> ANGGA — regresi insiden Fatih 2026-08-03.
   *
   * Sentinel memblokir kutipan ongkir yang SAH: "Harga ongkir tidak konsisten
   * dan tidak masuk akal", risk 80, confidence 30 → AI ikut dijeda. Padahal
   * seluruh gerbang deterministik lolos (buktinya `reason` di layar tidak
   * berawalan apa pun — tiap gerbang selalu menempelkan alasannya di depan).
   *
   * Akarnya: `llmReview` membuang SEMUA pesan system, termasuk blok data
   * ongkir. Juri disuruh mencocokkan ke data, tanpa pernah diberi datanya.
   */
  describe('ANGGA — juri LLM harus melihat data ongkir', () => {
    function pasangOngkir(teks: string) {
      const shipping: any = {
        getGroundingText: jest.fn().mockResolvedValue(teks),
        // >>> ANGGA — Fase 113: getGroundingNumbers() dihapus dari ShippingService
        // (satu-satunya pemakainya, checkPriceGrounding, juga dihapus).
        lastOutcome: jest.fn().mockReturnValue('ok'),
      };
      return {
        shipping,
        svc: new SentinelService(
          prisma, provider, prompts, events, notifications, agent,
          { sentinel: jest.fn().mockResolvedValue({ autoSendConfidenceMin: 90, draftConfidenceMin: 50, riskKeywords: '', defaultAiMode: 'ai_draft' }) } as any,
          undefined,
          shipping,
        ),
      };
    }

    /** Pesan yang dikirim ke provider untuk penilaian juri. */
    const pesanJuri = () => provider.chat.mock.calls[0][0] as Array<{ role: string; content: string }>;

    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', botId: 'b1', whatsappAccountId: 'a1',
        bot: { language: 'id' },
        messages: [{ content: 'kalau kirim ke pemalang berapa?' }],
      });
      prisma.sentinelReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      provider.chat.mockResolvedValue(JSON.stringify({
        decision: 'approve', confidence_score: 95, risk_score: 5,
        risk_level: 'low', reason: 'ok', recommendation: '',
      }));
    });

    it('angka ongkir ikut dikirim ke juri, beserta cara membacanya', async () => {
      const { svc } = pasangOngkir('• Tujuan: PEMALANG, JAWA TENGAH\n• Total kalau TRANSFER: Rp294.000');
      await svc.review('c1', 'Totalnya Rp294.000 kak');

      const gabungan = pesanJuri().map((m) => m.content).join('\n');
      expect(gabungan).toContain('294.000');
      expect(gabungan).toContain('PEMALANG');
      // Dua salah paham yang memicu insidennya, ditutup eksplisit.
      expect(gabungan).toMatch(/COD memang LEBIH MAHAL/i);
      expect(gabungan).toMatch(/Tujuan berbeda tentu ongkirnya berbeda/i);
    });

    it('persona & security directive TETAP dibuang dari juri', async () => {
      prompts.buildForConversation.mockResolvedValue([
        { role: 'system', content: 'PERSONA RAHASIA: sapa pelanggan dengan kak' },
        { role: 'user', content: 'kirim ke pemalang' },
      ]);
      const { svc } = pasangOngkir('• Total kalau TRANSFER: Rp294.000');
      // Draft sengaja TANPA angka: kalau "294.000" muncul di prompt juri, itu
      // pasti datang dari blok acuan, bukan dari kutipan draftnya sendiri.
      await svc.review('c1', 'siap kak, saya cek dulu ya');

      const gabungan = pesanJuri().map((m) => m.content).join('\n');
      expect(gabungan).not.toContain('PERSONA RAHASIA');
      expect(gabungan).toContain('DATA ACUAN ONGKIR');
      expect(gabungan).toContain('294.000');
    });

    it('tanpa data ongkir, tidak ada blok acuan yang dikarang', async () => {
      const { svc } = pasangOngkir('');
      await svc.review('c1', 'halo kak');
      const gabungan = pesanJuri().map((m) => m.content).join('\n');
      expect(gabungan).not.toMatch(/DATA ACUAN ONGKIR/);
    });

    it('modul ongkir tidak terpasang → review tetap jalan seperti biasa', async () => {
      await service.review('c1', 'halo kak');
      expect(provider.chat).toHaveBeenCalled();
    });
  });

  describe('botInsight', () => {
    it('throws when bot missing', async () => {
      prisma.bot.findUnique.mockResolvedValue(null);
      await expect(service.botInsight('b1')).rejects.toThrow(NotFoundException);
    });
    it('returns metrics + insight', async () => {
      prisma.bot.findUnique.mockResolvedValue({ id: 'b1', botName: 'Sales Bot' });
      provider.chat.mockResolvedValue('analisa');
      const r = await service.botInsight('b1');
      expect(r.bot).toBe('Sales Bot');
      expect(r.insight).toBe('analisa');
      expect(r.metrics).toHaveProperty('reviews');
    });
  });

  describe('dashboards', () => {
    it('dailyReport aggregates', async () => {
      const r = await service.dailyReport();
      expect(r).toHaveProperty('totalMessages');
      expect(r).toHaveProperty('reviewsByDecision');
    });
    it('botPerformance maps grouped results', async () => {
      prisma.sentinelReview.groupBy.mockResolvedValue([
        { botId: 'b1', _count: { _all: 4 }, _avg: { confidenceScore: 80.4, riskScore: 12.6 } },
      ]);
      const r = await service.botPerformance();
      expect(r[0]).toEqual({ botId: 'b1', reviews: 4, avgConfidence: 80, avgRisk: 13 });
    });
  });
});
