import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const fallbackLogger = new Logger('AuditLog');

export interface LogAuditOptions {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  newValue?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
}

/**
 * Single audit-write path, shared by AuditService and call sites that already
 * have PrismaService injected (avoiding circular module deps). Fire-and-forget
 * — a dropped audit record must never crash the caller — but the drop itself
 * is never silent: it's always logged, and reported via `onError` when the
 * caller has an ErrorReporterService (AuditService does; bare call sites get
 * at least the structured log line below).
 */
export async function logAudit(
  prisma: PrismaService,
  opts: LogAuditOptions,
  onError?: (error: unknown, context: Record<string, unknown>) => void,
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
  } catch (error) {
    const context = { action: opts.action, entityType: opts.entityType, entityId: opts.entityId };
    fallbackLogger.error(
      `audit write failed for action=${opts.action}: ${error instanceof Error ? error.message : String(error)}`,
    );
    onError?.(error, context);
  }
}
