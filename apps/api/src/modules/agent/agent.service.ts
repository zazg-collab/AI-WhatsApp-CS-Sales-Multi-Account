import { Injectable } from '@nestjs/common';
import { FollowUpStatus, LeadStage } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { SentinelService } from '../sentinel/sentinel.service';

/**
 * Assembles a read-only CRM report for an external supervisor agent (the Hermes
 * Agent gateway). Reuses existing report services so the agent sees exactly the
 * same numbers as the dashboard — no parallel, drift-prone calculations.
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly sentinel: SentinelService,
  ) {}

  async crmReport(days: number) {
    const rangeDays = Number.isFinite(days) ? Math.min(Math.max(days, 1), 90) : 7;

    const [summary, performance, leadFunnel, dailyReport, knowledgeGaps, alerts, followUps, hotLeads] =
      await Promise.all([
        this.dashboard.getSummary(),
        this.dashboard.getPerformanceOverview(rangeDays),
        this.dashboard.getLeadFunnel(),
        this.sentinel.dailyReport(),
        this.sentinel.knowledgeGaps(20),
        this.sentinel.alerts(20),
        this.pendingFollowUps(),
        this.recentHotLeads(),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      rangeDays,
      scope: 'supervisor-read-only',
      summary,
      performance,
      leadFunnel,
      dailyReport,
      followUps,
      hotLeads,
      knowledgeGaps,
      alerts,
    };
  }

  /** Scheduled follow-ups the team still owes customers. */
  private async pendingFollowUps() {
    const rows = await this.prisma.followUp.findMany({
      where: { status: FollowUpStatus.scheduled },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
      select: {
        id: true,
        scheduledAt: true,
        messageTemplate: true,
        aiGeneratedMessage: true,
        customer: { select: { name: true, phoneNumber: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      scheduledAt: r.scheduledAt,
      message: r.messageTemplate ?? r.aiGeneratedMessage ?? null,
      customerName: r.customer?.name ?? null,
      customerPhone: r.customer?.phoneNumber ?? null,
    }));
  }

  /** Most recently active hot / very-hot leads — the ones worth chasing. */
  private async recentHotLeads() {
    const rows = await this.prisma.customer.findMany({
      where: { leadStage: { in: [LeadStage.hot, LeadStage.very_hot] } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        leadStage: true,
        leadScore: true,
        updatedAt: true,
      },
    });
    return rows;
  }
}
