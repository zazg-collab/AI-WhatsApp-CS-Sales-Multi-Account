import { Injectable } from '@nestjs/common';
import { LeadStage, SenderType } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';

const STAGE_ORDER: Record<LeadStage, number> = {
  cold: 0,
  warm: 1,
  hot: 2,
  very_hot: 3,
};

const CLOSING_STAGES: LeadStage[] = [LeadStage.hot, LeadStage.very_hot];

/**
 * Sales-closing analytics: funnel conversion rates, attribution by bot/persona,
 * and win/loss breakdown. All metrics are read-only aggregates over existing
 * tables — no new schema required. Stage-transition velocity data accumulates in
 * audit_logs via ai_lead_stage_changed events written by AiService.leadScore().
 */
@Injectable()
export class ClosingAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Funnel conversion summary:
   * - Per-stage: current population + resolved-conversation rate (win proxy)
   * - Stage transition events from audit_log (populated going-forward by AI scoring)
   * - Overall close rate: customers who reached hot/very_hot / total customers
   */
  async getFunnelConversion(days: number) {
    const since = this.daysAgo(days);

    const [stageCounts, stageTransitions, totalCustomers, closingCustomers] = await Promise.all([
      // Current population snapshot (all-time) — used only for the funnel bar sizes,
      // never mixed into a rate with a time-windowed numerator.
      this.prisma.customer.groupBy({ by: ['leadStage'], _count: { _all: true } }),

      // Stage-transition events logged by AiService (may be empty on a fresh instance).
      this.prisma.auditLog.findMany({
        where: { action: 'ai_lead_stage_changed', createdAt: { gte: since } },
        select: { oldValue: true, newValue: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),

      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { leadStage: { in: CLOSING_STAGES } } }),
    ]);

    // Both counts below are scoped to the same `since` window, so the resulting
    // rate compares apples to apples (unlike resolved-in-window / all-time population).
    const [resolvedCountByStage, activeCountByStage] = await Promise.all([
      this.resolvedPerStage(since),
      this.activePerStage(since),
    ]);

    // Stage snapshot sorted cold → very_hot.
    const stages = Object.values(LeadStage)
      .sort((a, b) => STAGE_ORDER[a] - STAGE_ORDER[b])
      .map((stage) => {
        const pop = stageCounts.find((s) => s.leadStage === stage)?._count._all ?? 0;
        const resolved = resolvedCountByStage[stage] ?? 0;
        const active = activeCountByStage[stage] ?? 0;
        return {
          stage,
          population: pop,
          resolvedConversations: resolved,
          // Conversion rate = resolved / active conversations at this stage, both
          // scoped to the same `days` window (win proxy for the selected period).
          conversionRate: active > 0 ? Math.round((resolved / active) * 100) : 0,
        };
      });

    // Transition velocity: upgrades vs downgrades in period.
    let upgrades = 0;
    let downgrades = 0;
    const stageChangesPerDay = new Map<string, { upgrades: number; downgrades: number }>();

    for (const event of stageTransitions) {
      const old = (event.oldValue as { stage?: LeadStage })?.stage;
      const next = (event.newValue as { stage?: LeadStage })?.stage;
      if (!old || !next) continue;
      if (STAGE_ORDER[next] > STAGE_ORDER[old]) upgrades++;
      else if (STAGE_ORDER[next] < STAGE_ORDER[old]) downgrades++;
      const day = event.createdAt.toISOString().slice(0, 10);
      const entry = stageChangesPerDay.get(day) ?? { upgrades: 0, downgrades: 0 };
      if (STAGE_ORDER[next] > STAGE_ORDER[old]) entry.upgrades++;
      else if (STAGE_ORDER[next] < STAGE_ORDER[old]) entry.downgrades++;
      stageChangesPerDay.set(day, entry);
    }

    const velocity = Array.from(stageChangesPerDay.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      rangeDays: days,
      stages,
      transitions: { upgrades, downgrades, velocity },
      closeRate: totalCustomers > 0 ? Math.round((closingCustomers / totalCustomers) * 100) : 0,
      totalCustomers,
      closingCustomers,
    };
  }

  /**
   * Revenue / close attribution per bot:
   * For each bot, aggregate: unique customers served, hot/very_hot leads,
   * resolved conversations, avg lead score, avg CSAT, avg response time.
   */
  async getBotAttribution(days: number) {
    const since = this.daysAgo(days);

    const bots = await this.prisma.bot.findMany({
      select: { id: true, botName: true, persona: { select: { name: true } } },
    });

    const results = await Promise.all(
      bots.map(async (bot) => {
        const [
          totalConversations,
          resolvedConversations,
          hotLeads,
          avgLeadScore,
          csatData,
        ] = await Promise.all([
          this.prisma.conversation.count({
            where: { botId: bot.id, updatedAt: { gte: since } },
          }),
          this.prisma.conversation.count({
            where: { botId: bot.id, status: 'resolved', updatedAt: { gte: since } },
          }),
          this.prisma.conversation.count({
            where: {
              botId: bot.id,
              updatedAt: { gte: since },
              customer: { leadStage: { in: CLOSING_STAGES } },
            },
          }),
          this.prisma.customer.aggregate({
            where: { conversations: { some: { botId: bot.id, updatedAt: { gte: since } } } },
            _avg: { leadScore: true },
          }),
          this.prisma.conversation.aggregate({
            where: { botId: bot.id, csatScore: { not: null }, csatRespondedAt: { gte: since } },
            _avg: { csatScore: true },
            _count: { csatScore: true },
          }),
        ]);

        const aiMessages = await this.prisma.message.count({
          where: {
            senderType: SenderType.ai,
            createdAt: { gte: since },
            conversation: { botId: bot.id },
          },
        });

        return {
          botId: bot.id,
          botName: bot.botName,
          personaName: bot.persona?.name ?? null,
          totalConversations,
          resolvedConversations,
          resolutionRate: totalConversations > 0 ? Math.round((resolvedConversations / totalConversations) * 100) : 0,
          hotLeads,
          hotLeadRate: totalConversations > 0 ? Math.round((hotLeads / totalConversations) * 100) : 0,
          avgLeadScore: Math.round(avgLeadScore._avg.leadScore ?? 0),
          avgCsat: csatData._avg.csatScore ? Math.round(csatData._avg.csatScore * 10) / 10 : null,
          csatResponses: csatData._count.csatScore,
          aiMessages,
        };
      }),
    );

    return {
      rangeDays: days,
      bots: results.sort((a, b) => b.hotLeads - a.hotLeads),
    };
  }

  /**
   * Win/loss analysis for resolved conversations in range:
   * - "Win" = resolved with customer at hot/very_hot stage
   * - "Loss" = resolved with customer at cold/warm stage
   * - SLA loss = resolved with slaBreachedAt set (service failure)
   * - Top labels from won vs lost conversations
   * - Daily win/loss trend
   */
  async getWinLoss(days: number) {
    const since = this.daysAgo(days);

    const resolved = await this.prisma.conversation.findMany({
      where: { status: 'resolved', updatedAt: { gte: since } },
      select: {
        id: true,
        updatedAt: true,
        labels: true,
        slaBreachedAt: true,
        csatScore: true,
        customer: { select: { leadStage: true } },
      },
      take: 5000,
    });

    let wins = 0;
    let losses = 0;
    let slaLosses = 0;
    const winLabels = new Map<string, number>();
    const lossLabels = new Map<string, number>();
    const dailyMap = new Map<string, { wins: number; losses: number }>();

    for (const conv of resolved) {
      const isWin = CLOSING_STAGES.includes(conv.customer.leadStage as LeadStage);
      const day = conv.updatedAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(day) ?? { wins: 0, losses: 0 };

      if (isWin) {
        wins++;
        entry.wins++;
        for (const label of conv.labels) winLabels.set(label, (winLabels.get(label) ?? 0) + 1);
      } else {
        losses++;
        entry.losses++;
        for (const label of conv.labels) lossLabels.set(label, (lossLabels.get(label) ?? 0) + 1);
        if (conv.slaBreachedAt) slaLosses++;
      }
      dailyMap.set(day, entry);
    }

    const total = wins + losses;
    const topWinLabels = sortedTopLabels(winLabels, 8);
    const topLossLabels = sortedTopLabels(lossLabels, 8);

    const daily = this.fillDailyGaps(dailyMap, since, days).map((entry) => ({
      date: entry.date,
      wins: entry.wins,
      losses: entry.losses,
    }));

    return {
      rangeDays: days,
      wins,
      losses,
      slaLosses,
      winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      total,
      topWinLabels,
      topLossLabels,
      daily,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async resolvedPerStage(since: Date): Promise<Partial<Record<LeadStage, number>>> {
    // groupBy across relations (conversation -> customer.leadStage) isn't
    // directly supported by Prisma, so we group in JS via a lightweight findMany.
    const resolved = await this.prisma.conversation.findMany({
      where: { status: 'resolved', updatedAt: { gte: since } },
      select: { customer: { select: { leadStage: true } } },
      take: 10000,
    });
    return this.countByStage(resolved);
  }

  /** Conversations touched in the window, grouped by the customer's current stage. */
  private async activePerStage(since: Date): Promise<Partial<Record<LeadStage, number>>> {
    const active = await this.prisma.conversation.findMany({
      where: { updatedAt: { gte: since } },
      select: { customer: { select: { leadStage: true } } },
      take: 10000,
    });
    return this.countByStage(active);
  }

  private countByStage(rows: { customer: { leadStage: LeadStage } }[]): Partial<Record<LeadStage, number>> {
    const out: Partial<Record<LeadStage, number>> = {};
    for (const row of rows) {
      const s = row.customer.leadStage;
      out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  }

  /** Ensure every day in the range appears in the output (zero-fill gaps). */
  private fillDailyGaps(
    map: Map<string, { wins: number; losses: number }>,
    since: Date,
    days: number,
  ): { date: string; wins: number; losses: number }[] {
    const result: { date: string; wins: number; losses: number }[] = [];
    const safeDays = Math.min(Math.max(days, 1), 90);
    const now = new Date();
    for (let i = safeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (d >= since) {
        result.push({ date: dateStr, ...(map.get(dateStr) ?? { wins: 0, losses: 0 }) });
      }
    }
    return result;
  }

  private daysAgo(days: number): Date {
    const safe = Number.isFinite(days) ? Math.min(Math.max(days, 1), 90) : 7;
    return new Date(Date.now() - safe * 24 * 60 * 60 * 1000);
  }
}

function sortedTopLabels(map: Map<string, number>, limit: number): { label: string; count: number }[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}
