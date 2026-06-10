import { NotFoundException } from '@nestjs/common';
import { HermesDecision, RiskLevel } from '@hermes/database';
import { HermesService } from './hermes.service';

describe('HermesService', () => {
  let service: HermesService;
  let prisma: any;
  let provider: any;
  let prompts: any;
  let events: any;
  let notifications: any;
  let agent: any;

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn(), update: jest.fn() },
      hermesReview: {
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
    provider = { chat: jest.fn() };
    prompts = { buildForConversation: jest.fn().mockResolvedValue([]) };
    events = { emit: jest.fn(), emitToAccount: jest.fn() };
    notifications = { send: jest.fn() };
    agent = { ask: jest.fn().mockResolvedValue(null) };
    service = new HermesService(prisma, provider, prompts, events, notifications, agent);
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
      prisma.hermesReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      const r: any = await service.review('c1', 'baik kak');
      expect(r.decision).toBe(HermesDecision.approve);
      expect(events.emitToAccount).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });

    it('escalates via rules (refund) to most restrictive + emits alert', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', botId: 'b1', whatsappAccountId: 'a1', messages: [{ content: 'saya minta refund uang saya' }] });
      provider.chat.mockResolvedValue(JSON.stringify({
        decision: 'approve', confidence_score: 95, risk_score: 5,
        risk_level: 'low', reason: 'looks fine', recommendation: 'r',
      }));
      prisma.hermesReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      const r: any = await service.review('c1', 'baik kak');
      expect(r.decision).toBe(HermesDecision.takeover_required);
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'hermes:alert', expect.anything());
      expect(notifications.send).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('falls back to draft when LLM output unparseable', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', botId: 'b1', messages: [] });
      provider.chat.mockResolvedValue('garbage');
      prisma.hermesReview.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
      const r: any = await service.review('c1', 'x');
      expect(r.decision).toBe(HermesDecision.draft);
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
    it('uses hermes-agent when available', async () => {
      agent.ask.mockResolvedValue('agent answer');
      const r = await service.ask('q');
      expect(r.via).toBe('hermes-agent');
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

  describe('approve/block', () => {
    it('approve sets ai_on', async () => {
      prisma.conversation.update.mockResolvedValue({});
      await service.approve('c1');
      expect(prisma.conversation.update.mock.calls[0][0].data.aiMode).toBe('ai_on');
    });
    it('block pauses ai', async () => {
      prisma.conversation.update.mockResolvedValue({});
      await service.block('c1');
      expect(prisma.conversation.update.mock.calls[0][0].data.aiMode).toBe('ai_paused');
    });
  });

  describe('dashboards', () => {
    it('dailyReport aggregates', async () => {
      const r = await service.dailyReport();
      expect(r).toHaveProperty('totalMessages');
      expect(r).toHaveProperty('reviewsByDecision');
    });
    it('botPerformance maps grouped results', async () => {
      prisma.hermesReview.groupBy.mockResolvedValue([
        { botId: 'b1', _count: { _all: 4 }, _avg: { confidenceScore: 80.4, riskScore: 12.6 } },
      ]);
      const r = await service.botPerformance();
      expect(r[0]).toEqual({ botId: 'b1', reviews: 4, avgConfidence: 80, avgRisk: 13 });
    });
  });
});
