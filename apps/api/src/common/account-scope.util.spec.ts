import { NotFoundException } from '@nestjs/common';
import {
  allowedAccountIds,
  accountFilter,
  canAccessAccount,
  assertConversationScope,
} from './account-scope.util';

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

  // H2 regression — cross-account data access must be blocked.
  describe('canAccessAccount', () => {
    it('unrestricted role can access any account', async () => {
      const prisma: any = { whatsappAccount: { findMany: jest.fn() } };
      expect(await canAccessAccount(prisma, 'any', { id: 'u1', role: 'owner' })).toBe(true);
    });

    it('admin can access an account in their scope', async () => {
      const prisma: any = {
        whatsappAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      };
      expect(await canAccessAccount(prisma, 'a1', { id: 'u1', role: 'admin' })).toBe(true);
    });

    it('admin cannot access an account outside their scope', async () => {
      const prisma: any = {
        whatsappAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      };
      expect(await canAccessAccount(prisma, 'other', { id: 'u1', role: 'admin' })).toBe(false);
    });
  });

  describe('assertConversationScope', () => {
    it('throws NotFound when the conversation does not exist', async () => {
      const prisma: any = {
        conversation: { findUnique: jest.fn().mockResolvedValue(null) },
        whatsappAccount: { findMany: jest.fn() },
      };
      await expect(assertConversationScope(prisma, 'c1', { id: 'u1', role: 'admin' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound (not Forbidden) when conversation is outside admin scope — no existence leak', async () => {
      const prisma: any = {
        conversation: { findUnique: jest.fn().mockResolvedValue({ whatsappAccountId: 'other' }) },
        whatsappAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      };
      await expect(assertConversationScope(prisma, 'c1', { id: 'u1', role: 'admin' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the account id when the caller is in scope', async () => {
      const prisma: any = {
        conversation: { findUnique: jest.fn().mockResolvedValue({ whatsappAccountId: 'a1' }) },
        whatsappAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      };
      expect(await assertConversationScope(prisma, 'c1', { id: 'u1', role: 'admin' })).toBe('a1');
    });

    it('returns the account id for unrestricted roles without checking scope', async () => {
      const prisma: any = {
        conversation: { findUnique: jest.fn().mockResolvedValue({ whatsappAccountId: 'a9' }) },
        whatsappAccount: { findMany: jest.fn() },
      };
      expect(await assertConversationScope(prisma, 'c1', { id: 'u1', role: 'owner' })).toBe('a9');
      expect(prisma.whatsappAccount.findMany).not.toHaveBeenCalled();
    });
  });
});
