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
        aggregate: jest.fn().mockResolvedValue({ _sum: { reopenCount: 0 } }),
      },
      followUp: { count: jest.fn().mockResolvedValue(0) },
      message: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      customer: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ avg_seconds: null }]),
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

  describe('getResponseTime', () => {
    it('counts one first-response time per customer burst', async () => {
      const base = Date.now();
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'c1',
          messages: [
            { senderType: 'customer', senderId: null, createdAt: new Date(base) },
            { senderType: 'customer', senderId: null, createdAt: new Date(base + 60_000) },
            { senderType: 'customer', senderId: null, createdAt: new Date(base + 120_000) },
            { senderType: 'admin', senderId: 'a1', createdAt: new Date(base + 180_000) },
          ],
        },
      ]);
      const r = await service.getResponseTime(7);
      // 3 consecutive customer messages + 1 reply = 1 sample, timed from the
      // first customer message (180s), not 3 inflated samples.
      expect(r.sampleSize).toBe(1);
      expect(r.avgSeconds).toBe(180);
      expect(r.p95Seconds).toBe(180);
    });

    it('measures each burst separately across a back-and-forth', async () => {
      const base = Date.now();
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'c1',
          messages: [
            { senderType: 'customer', senderId: null, createdAt: new Date(base) },
            { senderType: 'ai', senderId: null, createdAt: new Date(base + 10_000) },
            { senderType: 'customer', senderId: null, createdAt: new Date(base + 20_000) },
            { senderType: 'admin', senderId: 'a1', createdAt: new Date(base + 50_000) },
          ],
        },
      ]);
      const r = await service.getResponseTime(7);
      expect(r.sampleSize).toBe(2); // 10s then 30s
      expect(r.avgSeconds).toBe(20);
    });
  });
});
