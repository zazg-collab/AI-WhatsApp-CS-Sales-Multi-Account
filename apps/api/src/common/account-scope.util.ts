import { PrismaService } from '../prisma/prisma.service';

/** Minimal caller shape — id + role is all account scoping needs. */
export interface ScopedUser {
  id: string;
  role: string;
}

/**
 * The WhatsApp account IDs a user may access.
 *
 * Returns `null` for unrestricted roles (owner / supervisor / viewer have full
 * oversight). For `admin`, mirrors the realtime gateway (events.gateway.ts):
 * accounts assigned to them, plus unassigned accounts (so a pilot with no
 * explicit assignment still works; an account claimed by another admin is
 * invisible).
 */
export async function allowedAccountIds(
  prisma: PrismaService,
  user?: ScopedUser,
): Promise<string[] | null> {
  if (!user || user.role !== 'admin') return null;
  const accounts = await prisma.whatsappAccount.findMany({
    where: { OR: [{ assignedAdminId: user.id }, { assignedAdminId: null }] },
    select: { id: true },
  });
  return accounts.map((a) => a.id);
}

/**
 * Resolve the effective account filter for a list query, honouring both the
 * user's scope and any explicit `accountId` query param. Returns either `null`
 * (no account constraint) or a Prisma `{ in: [...] }` filter. An empty array
 * means "no access" — the query should return nothing.
 */
export function accountFilter(
  scope: string[] | null,
  requestedAccountId?: string,
): { in: string[] } | string | undefined {
  if (scope === null) return requestedAccountId || undefined;
  if (requestedAccountId) {
    return { in: scope.includes(requestedAccountId) ? [requestedAccountId] : [] };
  }
  return { in: scope };
}
