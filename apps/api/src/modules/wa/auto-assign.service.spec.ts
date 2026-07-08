import { AutoAssignService } from './auto-assign.service';

function make(strategy?: string) {
  const prisma: any = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    conversation: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const config: any = { get: () => strategy };
  return { service: new AutoAssignService(prisma, config), prisma };
}

describe('AutoAssignService', () => {
  it('is disabled by default and returns null', async () => {
    const { service, prisma } = make(undefined);
    expect(service.enabled).toBe(false);
    expect(await service.pickAdmin('a1')).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('round-robin rotates through admins per account', async () => {
    const { service, prisma } = make('round_robin');
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
    expect(await service.pickAdmin('a1')).toBe('u1');
    expect(await service.pickAdmin('a1')).toBe('u2');
    expect(await service.pickAdmin('a1')).toBe('u3');
    expect(await service.pickAdmin('a1')).toBe('u1'); // wraps
  });

  it('least-busy picks the admin with the fewest open conversations', async () => {
    const { service, prisma } = make('least_busy');
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    prisma.conversation.groupBy.mockResolvedValue([
      { assignedAdminId: 'u1', _count: { _all: 5 } },
      { assignedAdminId: 'u2', _count: { _all: 1 } },
    ]);
    expect(await service.pickAdmin('a1')).toBe('u2');
  });

  it('returns null when there are no candidate admins', async () => {
    const { service } = make('least_busy');
    expect(await service.pickAdmin('a1')).toBeNull();
  });
});
