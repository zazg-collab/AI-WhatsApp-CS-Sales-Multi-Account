import { AgentService } from './agent.service';

describe('AgentService', () => {
  let service: AgentService;
  let prisma: any;
  let dashboard: any;
  let hermes: any;

  beforeEach(() => {
    prisma = {
      followUp: { findMany: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    dashboard = {
      getSummary: jest.fn().mockResolvedValue({ totalConversations: 3 }),
      getPerformanceOverview: jest.fn().mockResolvedValue({ rangeDays: 7 }),
      getLeadFunnel: jest.fn().mockResolvedValue([{ stage: 'hot', count: 2 }]),
    };
    hermes = {
      dailyReport: jest.fn().mockResolvedValue({ reviews: 0 }),
      knowledgeGaps: jest.fn().mockResolvedValue([]),
      alerts: jest.fn().mockResolvedValue([]),
    };
    service = new AgentService(prisma, dashboard, hermes);
  });

  it('assembles a consolidated read-only report and clamps days', async () => {
    const r = await service.crmReport(999);
    expect(r.rangeDays).toBe(90); // clamped
    expect(r.scope).toBe('supervisor-read-only');
    expect(r.summary).toEqual({ totalConversations: 3 });
    expect(r.leadFunnel).toEqual([{ stage: 'hot', count: 2 }]);
    expect(dashboard.getPerformanceOverview).toHaveBeenCalledWith(90);
    expect(hermes.knowledgeGaps).toHaveBeenCalledWith(20);
  });

  it('defaults to 7 days when given a non-finite value', async () => {
    const r = await service.crmReport(NaN);
    expect(r.rangeDays).toBe(7);
  });

  it('maps follow-ups with customer name/phone and message fallback', async () => {
    prisma.followUp.findMany.mockResolvedValue([
      {
        id: 'f1',
        scheduledAt: new Date('2026-06-20T00:00:00Z'),
        messageTemplate: null,
        aiGeneratedMessage: 'Halo kak',
        customer: { name: 'Budi', phoneNumber: '628123' },
      },
    ]);
    const r = await service.crmReport(7);
    expect(r.followUps[0]).toMatchObject({
      id: 'f1',
      message: 'Halo kak',
      customerName: 'Budi',
      customerPhone: '628123',
    });
  });
});
