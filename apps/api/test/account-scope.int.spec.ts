import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  allowedAccountIds,
  assertConversationScope,
  canAccessAccount,
} from '../src/common/account-scope.util';

/**
 * Account-scope ISOLATION against a REAL database.
 *
 * Every other test mocks PrismaService, so a wrong/forgotten `WHERE` clause —
 * the most damaging bug class in a multi-admin CRM — would pass the whole unit
 * suite. This spec seeds real rows and proves the actual SQL honours the admin
 * boundary. It runs only when DATABASE_URL is set (CI's Postgres job); locally
 * it skips with a notice rather than failing.
 */
const RUN = !!process.env.DATABASE_URL;
const d = RUN ? describe : describe.skip;

if (!RUN) {
  // eslint-disable-next-line no-console
  console.warn('[account-scope.int] SKIPPED — set DATABASE_URL to run real-DB isolation tests');
}

d('account scope isolation (real DB)', () => {
  const prisma = new PrismaService();
  const tag = `int-${Date.now()}`;

  let adminA: string;
  let adminB: string;
  let acctA: string; // assigned to adminA
  let acctB: string; // assigned to adminB
  let acctU: string; // unassigned
  let convA: string;
  let convB: string;
  let convU: string;

  beforeAll(async () => {
    await prisma.$connect();

    const mkUser = async (role: any, label: string) =>
      (await prisma.user.create({
        data: { name: `${tag}-${label}`, email: `${tag}-${label}@x.com`, passwordHash: 'x', role },
      })).id;
    adminA = await mkUser('admin', 'adminA');
    adminB = await mkUser('admin', 'adminB');

    const mkAccount = async (assignedAdminId: string | null, n: string) =>
      (await prisma.whatsappAccount.create({
        data: { accountName: `${tag}-${n}`, phoneNumber: `${tag}-${n}`, assignedAdminId },
      })).id;
    acctA = await mkAccount(adminA, 'A');
    acctB = await mkAccount(adminB, 'B');
    acctU = await mkAccount(null, 'U');

    const customer = await prisma.customer.create({
      data: { phoneNumber: `${tag}-cust`, sourceAccountId: acctA },
    });
    const mkConv = async (whatsappAccountId: string) =>
      (await prisma.conversation.create({
        data: { customerId: customer.id, whatsappAccountId },
      })).id;
    convA = await mkConv(acctA);
    convB = await mkConv(acctB);
    convU = await mkConv(acctU);
  });

  afterAll(async () => {
    // Children first to satisfy FKs.
    await prisma.conversation.deleteMany({ where: { id: { in: [convA, convB, convU] } } });
    await prisma.customer.deleteMany({ where: { phoneNumber: `${tag}-cust` } });
    await prisma.whatsappAccount.deleteMany({ where: { id: { in: [acctA, acctB, acctU] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminA, adminB] } } });
    await prisma.$disconnect();
  });

  it('admin scope = own assigned accounts + unassigned (never another admin\'s)', async () => {
    const scope = await allowedAccountIds(prisma, { id: adminA, role: 'admin' });
    expect(scope).toEqual(expect.arrayContaining([acctA, acctU]));
    expect(scope).not.toContain(acctB);
  });

  it('unrestricted roles get a null scope (full oversight)', async () => {
    for (const role of ['owner', 'supervisor', 'viewer']) {
      expect(await allowedAccountIds(prisma, { id: 'whoever', role })).toBeNull();
    }
  });

  it('canAccessAccount blocks an admin from another admin\'s account', async () => {
    expect(await canAccessAccount(prisma, acctA, { id: adminA, role: 'admin' })).toBe(true);
    expect(await canAccessAccount(prisma, acctU, { id: adminA, role: 'admin' })).toBe(true);
    expect(await canAccessAccount(prisma, acctB, { id: adminA, role: 'admin' })).toBe(false);
  });

  it('assertConversationScope throws NotFound across the admin boundary', async () => {
    await expect(assertConversationScope(prisma, convA, { id: adminA, role: 'admin' })).resolves.toBe(acctA);
    await expect(assertConversationScope(prisma, convU, { id: adminA, role: 'admin' })).resolves.toBe(acctU);
    await expect(
      assertConversationScope(prisma, convB, { id: adminA, role: 'admin' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('owner sees every conversation regardless of assignment', async () => {
    for (const conv of [convA, convB, convU]) {
      await expect(assertConversationScope(prisma, conv, { id: adminB, role: 'owner' })).resolves.toBeDefined();
    }
  });
});
