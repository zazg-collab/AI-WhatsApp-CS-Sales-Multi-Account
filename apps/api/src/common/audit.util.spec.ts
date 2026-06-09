import { logAudit } from './audit.util';

describe('logAudit', () => {
  it('creates an audit log row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { auditLog: { create } } as any;
    await logAudit(prisma, {
      userId: 'u1',
      action: 'test_action',
      entityType: 'Thing',
      entityId: 't1',
      newValue: { a: 1 },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        action: 'test_action',
        entityType: 'Thing',
        entityId: 't1',
        newValue: { a: 1 },
      }),
    });
  });

  it('never throws when prisma fails', async () => {
    const prisma = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    } as any;
    await expect(
      logAudit(prisma, { action: 'x' }),
    ).resolves.toBeUndefined();
  });
});
