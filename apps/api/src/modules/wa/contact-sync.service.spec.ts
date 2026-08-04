import { ContactSyncService } from './contact-sync.service';

describe('ContactSyncService.mergeCustomerInto', () => {
  function makeTx(overrides: Record<string, any> = {}) {
    return {
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      message: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      followUp: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      campaignRecipient: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      whatsappContact: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      learningProposal: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      customer: { delete: jest.fn().mockResolvedValue({}) },
      ...overrides,
    };
  }

  function service(tx: any) {
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    return new ContactSyncService(prisma, { getSock: () => undefined } as never);
  }

  it('no-ops when from === to', async () => {
    const tx = makeTx();
    const prisma: any = { $transaction: jest.fn() };
    await new ContactSyncService(prisma, { getSock: () => undefined } as never).mergeCustomerInto('x', 'x');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    void tx;
  });

  it('folds messages into the target conversation when one exists, then deletes the duplicate', async () => {
    const tx = makeTx();
    tx.conversation.findMany.mockResolvedValue([{ id: 'fc1', whatsappAccountId: 'acc1' }]);
    tx.conversation.findFirst.mockResolvedValue({ id: 'tc1' });
    await service(tx).mergeCustomerInto('from1', 'to1');
    expect(tx.message.updateMany).toHaveBeenCalledWith({ where: { conversationId: 'fc1' }, data: { conversationId: 'tc1' } });
    expect(tx.conversation.delete).toHaveBeenCalledWith({ where: { id: 'fc1' } });
    expect(tx.customer.delete).toHaveBeenCalledWith({ where: { id: 'from1' } });
  });

  it('re-points the conversation when the target has none on that account', async () => {
    const tx = makeTx();
    tx.conversation.findMany.mockResolvedValue([{ id: 'fc1', whatsappAccountId: 'acc1' }]);
    tx.conversation.findFirst.mockResolvedValue(null);
    await service(tx).mergeCustomerInto('from1', 'to1');
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: 'fc1' }, data: { customerId: 'to1' } });
    expect(tx.conversation.delete).not.toHaveBeenCalled();
    expect(tx.customer.delete).toHaveBeenCalledWith({ where: { id: 'from1' } });
  });
});
