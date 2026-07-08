import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationStatus } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';

type Strategy = 'off' | 'round_robin' | 'least_busy';

/**
 * Picks an admin to own a new (or still-unassigned) conversation. Strategy is
 * env-driven and defaults to `off` so existing behaviour is unchanged unless
 * explicitly enabled:
 *   round_robin → rotate through active admins (per-account cursor)
 *   least_busy  → fewest currently-open assigned conversations wins
 * Candidates are active, non-deleted users with role admin or supervisor.
 */
@Injectable()
export class AutoAssignService {
  private readonly strategy: Strategy;
  private readonly cursor = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const s = (config.get<string>('AUTO_ASSIGN_STRATEGY') ?? 'off').toLowerCase();
    this.strategy = s === 'round_robin' || s === 'least_busy' ? s : 'off';
  }

  get enabled(): boolean {
    return this.strategy !== 'off';
  }

  async pickAdmin(accountId: string): Promise<string | null> {
    if (!this.enabled) return null;

    const admins = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active', role: { in: ['admin', 'supervisor'] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admins.length === 0) return null;

    if (this.strategy === 'round_robin') {
      const next = ((this.cursor.get(accountId) ?? -1) + 1) % admins.length;
      this.cursor.set(accountId, next);
      return admins[next].id;
    }

    // least_busy
    const counts = await this.prisma.conversation.groupBy({
      by: ['assignedAdminId'],
      where: {
        assignedAdminId: { in: admins.map((a) => a.id) },
        status: { not: ConversationStatus.resolved },
      },
      _count: { _all: true },
    });
    const load = new Map(counts.map((c) => [c.assignedAdminId, c._count._all]));

    let best = admins[0].id;
    let bestLoad = load.get(best) ?? 0;
    for (const a of admins) {
      const l = load.get(a.id) ?? 0;
      if (l < bestLoad) {
        best = a.id;
        bestLoad = l;
      }
    }
    return best;
  }
}
