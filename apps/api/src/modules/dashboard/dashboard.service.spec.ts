import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      conversation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      followUp: { count: jest.fn().mockResolvedValue(0) },
      message: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      customer: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new DashboardService(prisma);
  });

  describe('getSummary', () => {
    it('aggregates counts', async () => {
      prisma.conversation.count.mockResolvedValue(5);
      const r = await service.getSummary();
      expect(r.totalConversations).toBe(5);
      expect(r.leadsToday).toEqual({ hot: 0, warm: 0, cold: 0 });
      expect(r.avgResponseTime).toBe(0);
      expect(Array.isArray(r.topAccounts)).toBe(true);
    });
  });

  describe('getLeadFunnel', () => {
    it('returns count per stage via groupBy', async () => {
      prisma.customer.groupBy.mockResolvedValue([
        { leadStage: 'hot', _count: { _all: 3 } },
        { leadStage: 'warm', _count: { _all: 2 } },
      ]);
      const r = await service.getLeadFunnel();
      expect(r).toHaveLength(2);
      expect(r[0]).toEqual({ stage: 'hot', count: 3 });
      expect(r[1]).toEqual({ stage: 'warm', count: 2 });
    });
  });

  describe('getAiModeBreakdown', () => {
    it('computes percentages, 0 when no data', async () => {
      prisma.conversation.groupBy.mockResolvedValue([]);
      const r = await service.getAiModeBreakdown();
      expect(r).toHaveLength(0);
    });
    it('computes percentages with data via groupBy', async () => {
      prisma.conversation.groupBy.mockResolvedValue([
        { aiMode: 'ai_on', _count: { _all: 10 } },
        { aiMode: 'ai_off', _count: { _all: 10 } },
      ]);
      const r = await service.getAiModeBreakdown();
      expect(r).toHaveLength(2);
      expect(r[0]).toEqual({ mode: 'ai_on', count: 10, percentage: 50 });
      expect(r[1]).toEqual({ mode: 'ai_off', count: 10, percentage: 50 });
    });
  });

  describe('getMessageVolume', () => {
    it('returns one entry per day, clamped', async () => {
      const r = await service.getMessageVolume(3);
      expect(r).toHaveLength(3);
      expect(r[0]).toHaveProperty('date');
    });
  });
});
