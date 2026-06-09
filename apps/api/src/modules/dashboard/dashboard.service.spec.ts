import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      conversation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      followUp: { count: jest.fn().mockResolvedValue(0) },
      message: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
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
    it('returns count per stage', async () => {
      prisma.customer.count.mockResolvedValue(3);
      const r = await service.getLeadFunnel();
      expect(r.length).toBeGreaterThan(0);
      expect(r[0]).toHaveProperty('stage');
      expect(r[0]).toHaveProperty('count', 3);
    });
  });

  describe('getAiModeBreakdown', () => {
    it('computes percentages, 0 when no data', async () => {
      prisma.conversation.count.mockResolvedValue(0);
      const r = await service.getAiModeBreakdown();
      expect(r).toHaveLength(5);
      expect(r.every((c) => c.percentage === 0)).toBe(true);
    });
    it('computes percentages with data', async () => {
      prisma.conversation.count.mockResolvedValue(10);
      const r = await service.getAiModeBreakdown();
      // 5 modes x 10 = 50 total, each 20%
      expect(r[0].percentage).toBe(20);
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
