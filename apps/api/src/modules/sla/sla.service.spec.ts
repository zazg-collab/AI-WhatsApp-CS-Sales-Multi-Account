import { SlaService } from './sla.service';

function makeService(overrides: { responseMinutes?: number } = {}) {
  const prisma: any = {
    conversation: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const events: any = { emitToAccount: jest.fn() };
  const notifications: any = { send: jest.fn().mockResolvedValue(undefined) };
  const config: any = {
    get: (k: string) =>
      k === 'SLA_RESPONSE_MINUTES' ? overrides.responseMinutes ?? 15 : undefined,
  };
  const queue: any = { add: jest.fn().mockResolvedValue({}) };
  const service = new SlaService(prisma, events, notifications, config, queue);
  return { service, prisma, events, notifications, queue };
}

const longAgo = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
const justNow = new Date();

describe('SlaService', () => {
  it('arms a repeatable scan on init', async () => {
    const { service, queue } = makeService();
    await service.onModuleInit();
    expect(queue.add).toHaveBeenCalledWith('scan', {}, expect.objectContaining({ repeat: expect.any(Object) }));
  });

  it('flags a conversation whose last message is an overdue customer message', async () => {
    const { service, prisma, events, notifications } = makeService();
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        whatsappAccountId: 'a1',
        status: 'open',
        slaBreachedAt: null,
        messages: [{ senderType: 'customer', createdAt: longAgo }],
        customer: { name: 'Budi', phoneNumber: '628' },
        whatsappAccount: { id: 'a1', accountName: 'Sales' },
      },
    ]);
    const r = await service.scan();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { slaBreachedAt: expect.any(Date) },
    });
    expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'conversation:sla-breach', expect.anything());
    expect(notifications.send).toHaveBeenCalled();
    expect(r.breached).toBe(1);
  });

  it('does not flag a customer message still within SLA', async () => {
    const { service, prisma } = makeService();
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'c1', whatsappAccountId: 'a1', status: 'open', slaBreachedAt: null,
        messages: [{ senderType: 'customer', createdAt: justNow }],
        customer: { name: 'Budi', phoneNumber: '628' },
        whatsappAccount: { id: 'a1', accountName: 'Sales' },
      },
    ]);
    const r = await service.scan();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(r.breached).toBe(0);
  });

  it('clears a breach once an admin has replied', async () => {
    const { service, prisma, events } = makeService();
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'c1', whatsappAccountId: 'a1', status: 'open', slaBreachedAt: new Date(),
        messages: [{ senderType: 'admin', createdAt: justNow }],
        customer: { name: 'Budi', phoneNumber: '628' },
        whatsappAccount: { id: 'a1', accountName: 'Sales' },
      },
    ]);
    const r = await service.scan();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { slaBreachedAt: null },
    });
    expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'conversation:sla-cleared', expect.anything());
    expect(r.cleared).toBe(1);
  });

  it('does not re-flag an already-breached conversation', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'c1', whatsappAccountId: 'a1', status: 'open', slaBreachedAt: new Date(),
        messages: [{ senderType: 'customer', createdAt: longAgo }],
        customer: { name: 'Budi', phoneNumber: '628' },
        whatsappAccount: { id: 'a1', accountName: 'Sales' },
      },
    ]);
    const r = await service.scan();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
    expect(r).toEqual({ breached: 0, cleared: 0 });
  });
});
