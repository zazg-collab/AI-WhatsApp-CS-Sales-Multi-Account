import { NotFoundException } from '@nestjs/common';
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

/**
 * True when `user` is allowed to touch a resource on `whatsappAccountId`.
 * Unrestricted roles (scope === null) always pass.
 */
export async function canAccessAccount(
  prisma: PrismaService,
  whatsappAccountId: string,
  user?: ScopedUser,
): Promise<boolean> {
  const scope = await allowedAccountIds(prisma, user);
  return scope === null || scope.includes(whatsappAccountId);
}

/**
 * Guard a conversation read/mutation by the caller's account scope. Throws the
 * same NotFoundException the detail endpoint uses so callers can't probe which
 * conversation ids exist outside their scope. Returns the conversation's
 * account id for reuse.
 */
export async function assertConversationScope(
  prisma: PrismaService,
  conversationId: string,
  user?: ScopedUser,
): Promise<string> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { whatsappAccountId: true },
  });
  if (!conversation) throw new NotFoundException('Conversation not found');
  if (!(await canAccessAccount(prisma, conversation.whatsappAccountId, user))) {
    throw new NotFoundException('Conversation not found');
  }
  return conversation.whatsappAccountId;
}
