import { PrismaService } from '../prisma/prisma.service';

/**
 * Lightweight fire-and-forget audit helper. Used directly in services that
 * already have PrismaService injected, avoiding circular module deps.
 */
export async function logAudit(
  prisma: PrismaService,
  opts: {
    userId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    newValue?: Record<string, unknown>;
    oldValue?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        newValue: opts.newValue as never,
        oldValue: opts.oldValue as never,
      },
    });
  } catch {
    // audit failures must never crash the caller
  }
}
