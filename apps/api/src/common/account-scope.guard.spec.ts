import { NotFoundException } from '@nestjs/common';
import { AccountScopeGuard } from './account-scope.guard';

function ctxWith(params: Record<string, string>, user: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params, user }),
    }),
  } as never;
}

describe('AccountScopeGuard', () => {
  let prisma: any;
  let guard: AccountScopeGuard;

  beforeEach(() => {
    prisma = { whatsappAccount: { findMany: jest.fn().mockResolvedValue([]) } };
    guard = new AccountScopeGuard(prisma);
  });

  it('passes through routes with no :id param', async () => {
    await expect(guard.canActivate(ctxWith({}, { id: 'admin1', role: 'admin' }))).resolves.toBe(true);
  });

  it('passes unrestricted roles regardless of scope', async () => {
    await expect(
      guard.canActivate(ctxWith({ id: 'acc1' }, { id: 'owner1', role: 'owner' })),
    ).resolves.toBe(true);
  });

  it('passes a scoped admin whose assigned accounts include the route id', async () => {
    prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'acc1' }]);
    await expect(
      guard.canActivate(ctxWith({ id: 'acc1' }, { id: 'admin1', role: 'admin' })),
    ).resolves.toBe(true);
  });

  it('rejects a scoped admin whose assigned accounts do not include the route id (broken-access-control regression)', async () => {
    prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'acc2' }]);
    await expect(
      guard.canActivate(ctxWith({ id: 'acc1' }, { id: 'admin1', role: 'admin' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
