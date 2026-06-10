import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ConversationStatus, SenderType } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { isWithinBusinessHours } from '../../common/business-hours.util';

/**
 * SLA monitor for "stale" chats: a conversation whose most recent message is
 * from the customer and has gone unanswered longer than SLA_RESPONSE_MINUTES.
 *
 * Breach state lives in `conversations.sla_breached_at` so it survives across
 * scans and can drive a badge in the UI. The scan is the single owner of that
 * column — it both sets it (newly overdue) and clears it (answered/resolved) —
 * so the send/ingest paths need no changes. Runs as a repeatable BullMQ job.
 */
@Injectable()
export class SlaService implements OnModuleInit {
  private readonly logger = new Logger(SlaService.name);
  private readonly responseMinutes: number;
  private readonly intervalMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly notifications: NotificationsService,
    config: ConfigService,
    @InjectQueue('sla') private readonly slaQueue: Queue,
  ) {
    this.responseMinutes = this.positiveInt(config.get('SLA_RESPONSE_MINUTES'), 15);
    this.intervalMs = this.positiveInt(config.get('SLA_SCAN_INTERVAL_MS'), 60_000);
  }

  async onModuleInit() {
    // Register the recurring scan. BullMQ dedupes repeatable jobs by key, so
    // re-adding on every boot is safe (no duplicate schedules).
    try {
      await this.slaQueue.add(
        'scan',
        {},
        { repeat: { every: this.intervalMs }, jobId: 'sla-scan' },
      );
      this.logger.log(
        `SLA monitor armed: every ${this.intervalMs}ms, threshold ${this.responseMinutes}m`,
      );
    } catch (err) {
      this.logger.warn(`Could not schedule SLA scan: ${err}`);
    }
  }

  /**
   * One scan pass: flag newly-overdue conversations and clear ones that have
   * since been answered or resolved. Returns a small summary for tests/logs.
   */
  async scan() {
    const cutoff = new Date(Date.now() - this.responseMinutes * 60_000);
    const horizon = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.conversation.findMany({
      where: {
        OR: [
          // Active, recently-touched conversations that might be overdue…
          { status: { not: ConversationStatus.resolved }, lastMessageAt: { gte: horizon } },
          // …and any already-flagged ones, so we can clear them.
          { slaBreachedAt: { not: null } },
        ],
      },
      take: 1000,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { senderType: true, createdAt: true },
        },
        customer: { select: { name: true, phoneNumber: true } },
        whatsappAccount: {
          select: {
            id: true,
            accountName: true,
            businessHoursEnabled: true,
            businessHoursStart: true,
            businessHoursEnd: true,
            businessDays: true,
            businessTimezone: true,
          },
        },
      },
    });

    const newlyBreached: { name: string; account: string }[] = [];
    let cleared = 0;

    for (const c of candidates) {
      const last = c.messages[0];
      const awaiting =
        !!last &&
        last.senderType === SenderType.customer &&
        c.status !== ConversationStatus.resolved;
      // Don't accrue SLA breaches while the account is outside business hours
      // (nobody's expected to reply). Clearing still proceeds normally.
      const overdue =
        awaiting && last.createdAt < cutoff && isWithinBusinessHours(c.whatsappAccount);

      if (overdue && !c.slaBreachedAt) {
        await this.prisma.conversation.update({
          where: { id: c.id },
          data: { slaBreachedAt: new Date() },
        });
        this.events.emitToAccount(c.whatsappAccountId, 'conversation:sla-breach', {
          conversationId: c.id,
          waitingSince: last.createdAt,
        });
        newlyBreached.push({
          name: c.customer.name ?? c.customer.phoneNumber,
          account: c.whatsappAccount.accountName,
        });
      } else if (!awaiting && c.slaBreachedAt) {
        await this.prisma.conversation.update({
          where: { id: c.id },
          data: { slaBreachedAt: null },
        });
        this.events.emitToAccount(c.whatsappAccountId, 'conversation:sla-cleared', {
          conversationId: c.id,
        });
        cleared += 1;
      }
    }

    if (newlyBreached.length > 0) {
      const lines = newlyBreached
        .slice(0, 10)
        .map((b) => `• ${b.name} (${b.account})`)
        .join('\n');
      const extra =
        newlyBreached.length > 10 ? `\n…dan ${newlyBreached.length - 10} lainnya` : '';
      // Fire-and-forget; no-ops if notifications are unconfigured.
      this.notifications
        .send(
          `⏰ ${newlyBreached.length} chat belum dibalas > ${this.responseMinutes} menit:\n${lines}${extra}`,
        )
        .catch(() => undefined);
    }

    if (newlyBreached.length || cleared) {
      this.logger.log(`SLA scan: ${newlyBreached.length} breached, ${cleared} cleared`);
    }
    return { breached: newlyBreached.length, cleared };
  }

  private positiveInt(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
}
