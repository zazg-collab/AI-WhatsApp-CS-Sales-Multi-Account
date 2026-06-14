import { allowedAccountIds, accountFilter } from './account-scope.util';

describe('account-scope', () => {
  describe('allowedAccountIds', () => {
    it('returns null (unrestricted) when no user', async () => {
      const prisma: any = { whatsappAccount: { findMany: jest.fn() } };
      expect(await allowedAccountIds(prisma)).toBeNull();
      expect(prisma.whatsappAccount.findMany).not.toHaveBeenCalled();
    });

    it.each(['owner', 'supervisor', 'viewer'])(
      'returns null (unrestricted) for role %s',
      async (role) => {
        const prisma: any = { whatsappAccount: { findMany: jest.fn() } };
        expect(await allowedAccountIds(prisma, { id: 'u1', role })).toBeNull();
        expect(prisma.whatsappAccount.findMany).not.toHaveBeenCalled();
      },
    );

    it('restricts admin to assigned + unassigned accounts', async () => {
      const prisma: any = {
        whatsappAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]) },
      };
      const ids = await allowedAccountIds(prisma, { id: 'u1', role: 'admin' });
      expect(ids).toEqual(['a1', 'a2']);
      expect(prisma.whatsappAccount.findMany).toHaveBeenCalledWith({
        where: { OR: [{ assignedAdminId: 'u1' }, { assignedAdminId: null }] },
        select: { id: true },
      });
    });
  });

  describe('accountFilter', () => {
    it('no scope, no requested account → undefined (no constraint)', () => {
      expect(accountFilter(null)).toBeUndefined();
    });

    it('no scope, requested account → that account', () => {
      expect(accountFilter(null, 'a1')).toBe('a1');
    });

    it('scoped, no requested account → in scope', () => {
      expect(accountFilter(['a1', 'a2'])).toEqual({ in: ['a1', 'a2'] });
    });

    it('scoped, requested account inside scope → only that account', () => {
      expect(accountFilter(['a1', 'a2'], 'a1')).toEqual({ in: ['a1'] });
    });

    it('scoped, requested account outside scope → empty (no access)', () => {
      expect(accountFilter(['a1', 'a2'], 'zzz')).toEqual({ in: [] });
    });
  });
});
