import { ClosingAnalyticsService } from './closing-analytics.service';

const now = new Date('2026-06-18T12:00:00Z');

const makePrisma = () => ({
  customer: {
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { leadScore: null } }),
  },
  conversation: {
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { csatScore: null }, _count: { csatScore: 0 } }),
  },
  auditLog: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  bot: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  message: {
    count: jest.fn().mockResolvedValue(0),
  },
});

describe('ClosingAnalyticsService', () => {
  let svc: ClosingAnalyticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new ClosingAnalyticsService(prisma as any);
  });

  describe('getFunnelConversion', () => {
    it('returns all four stages, each with population and conversionRate', async () => {
      prisma.customer.groupBy.mockResolvedValue([
        { leadStage: 'cold', _count: { _all: 40 } },
        { leadStage: 'warm', _count: { _all: 20 } },
        { leadStage: 'hot', _count: { _all: 8 } },
        { leadStage: 'very_hot', _count: { _all: 2 } },
      ]);
      prisma.customer.count
        .mockResolvedValueOnce(70) // totalCustomers
        .mockResolvedValueOnce(10); // closingCustomers
      prisma.conversation.findMany.mockResolvedValue([
        { customer: { leadStage: 'hot' } },
        { customer: { leadStage: 'hot' } },
        { customer: { leadStage: 'very_hot' } },
      ]);

      const result = await svc.getFunnelConversion(30);

      expect(result.stages).toHaveLength(4);
      expect(result.stages[0].stage).toBe('cold');
      expect(result.stages[2].stage).toBe('hot');
      expect(result.stages[2].resolvedConversations).toBe(2);
      expect(result.closeRate).toBe(14); // 10/70 ≈ 14%
      expect(result.transitions.upgrades).toBe(0);
    });

    it('counts upgrade and downgrade transitions from audit_log', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        { oldValue: { stage: 'cold' }, newValue: { stage: 'warm' }, createdAt: new Date() },
        { oldValue: { stage: 'warm' }, newValue: { stage: 'hot' }, createdAt: new Date() },
        { oldValue: { stage: 'hot' }, newValue: { stage: 'cold' }, createdAt: new Date() },
      ]);

      const result = await svc.getFunnelConversion(7);
      expect(result.transitions.upgrades).toBe(2);
      expect(result.transitions.downgrades).toBe(1);
    });
  });

  describe('getBotAttribution', () => {
    it('returns empty bots array when no bots exist', async () => {
      const result = await svc.getBotAttribution(30);
      expect(result.bots).toEqual([]);
    });

    it('computes resolutionRate and hotLeadRate per bot', async () => {
      prisma.bot.findMany.mockResolvedValue([
        { id: 'b1', botName: 'SalesBot', persona: { name: 'Rina' } },
      ]);
      prisma.conversation.count
        .mockResolvedValueOnce(10) // totalConversations
        .mockResolvedValueOnce(4) // resolvedConversations
        .mockResolvedValueOnce(3); // hotLeads

      const result = await svc.getBotAttribution(30);
      expect(result.bots).toHaveLength(1);
      const bot = result.bots[0];
      expect(bot.botName).toBe('SalesBot');
      expect(bot.personaName).toBe('Rina');
      expect(bot.resolutionRate).toBe(40);
      expect(bot.hotLeadRate).toBe(30);
    });
  });

  describe('getWinLoss', () => {
    it('classifies resolved conversations into wins and losses', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'c1', updatedAt: now, labels: ['promo'], slaBreachedAt: null, csatScore: 5, customer: { leadStage: 'hot' } },
        { id: 'c2', updatedAt: now, labels: ['complaint'], slaBreachedAt: null, csatScore: 2, customer: { leadStage: 'cold' } },
        { id: 'c3', updatedAt: now, labels: ['complaint'], slaBreachedAt: new Date(), csatScore: 1, customer: { leadStage: 'warm' } },
      ]);

      const result = await svc.getWinLoss(7);

      expect(result.wins).toBe(1);
      expect(result.losses).toBe(2);
      expect(result.slaLosses).toBe(1);
      expect(result.winRate).toBe(33);
      expect(result.topWinLabels[0]).toEqual({ label: 'promo', count: 1 });
      expect(result.topLossLabels[0]).toEqual({ label: 'complaint', count: 2 });
    });

    it('returns zero totals when no resolved conversations', async () => {
      const result = await svc.getWinLoss(7);
      expect(result.wins).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.daily).toHaveLength(7);
    });

    it('fills all days with zeros when no data', async () => {
      const result = await svc.getWinLoss(7);
      expect(result.daily.every((d) => d.wins === 0 && d.losses === 0)).toBe(true);
    });
  });
});
