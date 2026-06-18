import { Injectable } from '@nestjs/common';
import {
  CampaignRecipientStatus,
  FollowUpStatus,
  LeadStage,
  SenderType,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalConversations,
      activeConversations,
      aiOnConversations,
      pendingFollowUps,
      messagesLast24h,
      hotLeadsToday,
      warmLeadsToday,
      coldLeadsToday,
      responseMetrics,
    ] = await Promise.all([
      this.prisma.conversation.count(),
      this.prisma.conversation.count({ where: { takeoverStatus: 'waiting_admin' } }),
      this.prisma.conversation.count({ where: { aiMode: 'ai_on' } }),
      this.prisma.followUp.count({ where: { status: FollowUpStatus.scheduled } }),
      this.prisma.message.count({ where: { createdAt: { gte: yesterday } } }),
      this.prisma.customer.count({
        where: { leadStage: LeadStage.hot, updatedAt: { gte: yesterday } },
      }),
      this.prisma.customer.count({
        where: { leadStage: LeadStage.warm, updatedAt: { gte: yesterday } },
      }),
      this.prisma.customer.count({
        where: { leadStage: LeadStage.cold, updatedAt: { gte: yesterday } },
      }),
      this.calculateResponseMetrics(yesterday),
    ]);

    const topAccounts = await this.getTopAccounts(7);

    return {
      totalConversations,
      activeConversations,
      aiOnConversations,
      pendingFollowUps,
      leadsToday: { hot: hotLeadsToday, warm: warmLeadsToday, cold: coldLeadsToday },
      messagesLast24h,
      avgResponseTime: responseMetrics.avgSeconds,
      topAccounts,
    };
  }

  async getLeadFunnel() {
    const counts = await this.prisma.customer.groupBy({
      by: ['leadStage'],
      _count: { _all: true },
    });
    return counts.map((row) => ({ stage: row.leadStage, count: row._count._all }));
  }

  async getMessageVolume(days: number) {
    const safeDays = this.normalizeDays(days);
    const since = this.daysAgo(safeDays);

    const messages = await this.prisma.message.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const byDate = new Map<string, number>();
    for (const msg of messages) {
      const date = msg.createdAt.toISOString().slice(0, 10);
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }

    const result: { date: string; count: number }[] = [];
    const now = new Date();

    for (let i = safeDays - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      result.push({ date: dateStr, count: byDate.get(dateStr) ?? 0 });
    }

    return result;
  }

  async getAiModeBreakdown() {
    const counts = await this.prisma.conversation.groupBy({
      by: ['aiMode'],
      _count: { _all: true },
    });
    const total = counts.reduce((sum, c) => sum + c._count._all, 0);
    return counts.map((c) => ({
      mode: c.aiMode,
      count: c._count._all,
      percentage: total > 0 ? Math.round((c._count._all / total) * 100) : 0,
    }));
  }

  async getPerformanceOverview(days: number) {
    const safeDays = this.normalizeDays(days);
    const since = this.daysAgo(safeDays);
    const [response, aiQuality, campaign, messageVolume, topAccounts, csat] = await Promise.all([
      this.calculateResponseMetrics(since),
      this.getAiQuality(safeDays),
      this.getCampaignPerformance(safeDays),
      this.getMessageVolume(safeDays),
      this.getTopAccounts(safeDays),
      this.getCsat(safeDays),
    ]);

    const [messages, conversations, customers] = await Promise.all([
      this.prisma.message.count({ where: { createdAt: { gte: since } } }),
      this.prisma.conversation.count({ where: { updatedAt: { gte: since } } }),
      this.prisma.customer.count({ where: { updatedAt: { gte: since } } }),
    ]);

    return {
      rangeDays: safeDays,
      since,
      totals: { messages, conversations, customers },
      response,
      aiQuality,
      campaign,
      messageVolume,
      topAccounts,
      csat,
    };
  }

  /** Customer satisfaction (CSAT) aggregate over conversations rated in range. */
  async getCsat(days: number) {
    const since = this.daysAgo(this.normalizeDays(days));
    const rated = await this.prisma.conversation.findMany({
      where: { csatRespondedAt: { gte: since }, csatScore: { not: null } },
      select: { csatScore: true },
      take: 5000,
    });
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    for (const r of rated) {
      const s = r.csatScore as number;
      if (s >= 1 && s <= 5) {
        distribution[s] += 1;
        total += s;
      }
    }
    const responses = rated.length;
    const requested = await this.prisma.conversation.count({
      where: { csatRequestedAt: { gte: since } },
    });
    return {
      responses,
      requested,
      responseRate: requested > 0 ? Math.round((responses / requested) * 100) : 0,
      avgScore: responses > 0 ? Math.round((total / responses) * 10) / 10 : 0,
      distribution,
    };
  }

  async getResponseTime(days: number) {
    return this.calculateResponseMetrics(this.daysAgo(this.normalizeDays(days)));
  }

  async getAiQuality(days: number) {
    const since = this.daysAgo(this.normalizeDays(days));
    const [reviews, decisions, riskLevels, fallbackCount, aiMessages] = await Promise.all([
      this.prisma.hermesReview.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { confidenceScore: true, riskScore: true },
        _count: { _all: true },
      }),
      this.prisma.hermesReview.groupBy({
        by: ['decision'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.hermesReview.groupBy({
        by: ['riskLevel'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.message.count({
        where: {
          senderType: SenderType.ai,
          createdAt: { gte: since },
          content: { contains: 'konfirmasi dulu ke admin', mode: 'insensitive' },
        },
      }),
      this.prisma.message.count({ where: { senderType: SenderType.ai, createdAt: { gte: since } } }),
    ]);

    return {
      reviewCount: reviews._count._all,
      avgConfidence: Math.round(reviews._avg.confidenceScore ?? 0),
      avgRisk: Math.round(reviews._avg.riskScore ?? 0),
      fallbackCount,
      fallbackRate: aiMessages > 0 ? Math.round((fallbackCount / aiMessages) * 100) : 0,
      decisions: Object.fromEntries(decisions.map((d) => [d.decision, d._count._all])),
      riskLevels: Object.fromEntries(riskLevels.map((r) => [r.riskLevel, r._count._all])),
    };
  }

  async getCampaignPerformance(days: number) {
    const since = this.daysAgo(this.normalizeDays(days));
    const [campaignCount, recipientStats, recentCampaigns] = await Promise.all([
      this.prisma.campaign.count({ where: { createdAt: { gte: since } } }),
      this.prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { id: true },
      }),
      this.prisma.campaign.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { _count: { select: { recipients: true } } },
      }),
    ]);

    const byStatus = Object.fromEntries(recipientStats.map((row) => [row.status, row._count.id]));
    const sent = byStatus[CampaignRecipientStatus.sent] ?? 0;
    const failed = byStatus[CampaignRecipientStatus.failed] ?? 0;
    const totalRecipients = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      campaignCount,
      totalRecipients,
      sent,
      failed,
      successRate: totalRecipients > 0 ? Math.round((sent / totalRecipients) * 100) : 0,
      failureRate: totalRecipients > 0 ? Math.round((failed / totalRecipients) * 100) : 0,
      byStatus,
      recentCampaigns: recentCampaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        recipients: campaign._count.recipients,
        createdAt: campaign.createdAt,
      })),
    };
  }

  /**
   * Per-admin workload report (extends the assignment feature): for each
   * non-viewer user, how many conversations are assigned to them, how many they
   * resolved in range, how many messages they sent, and their average reply
   * time. Sorted by messages sent.
   */
  async getAdminWorkload(days: number) {
    const safeDays = this.normalizeDays(days);
    const since = this.daysAgo(safeDays);

    const [admins, sentGroups, assignedGroups, resolvedGroups, responseByAdmin] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { deletedAt: null, role: { not: 'viewer' } },
          select: { id: true, name: true, role: true },
        }),
        this.prisma.message.groupBy({
          by: ['senderId'],
          where: { senderType: SenderType.admin, senderId: { not: null }, createdAt: { gte: since } },
          _count: { _all: true },
        }),
        this.prisma.conversation.groupBy({
          by: ['assignedAdminId'],
          where: { assignedAdminId: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.conversation.groupBy({
          by: ['assignedAdminId'],
          where: { assignedAdminId: { not: null }, status: 'resolved', updatedAt: { gte: since } },
          _count: { _all: true },
        }),
        this.adminResponseTimes(since),
      ]);

    const sentByAdmin = Object.fromEntries(sentGroups.map((g) => [g.senderId, g._count._all]));
    const assignedByAdmin = Object.fromEntries(assignedGroups.map((g) => [g.assignedAdminId, g._count._all]));
    const resolvedByAdmin = Object.fromEntries(resolvedGroups.map((g) => [g.assignedAdminId, g._count._all]));

    const rows = admins
      .map((admin) => ({
        id: admin.id,
        name: admin.name,
        role: admin.role,
        assigned: assignedByAdmin[admin.id] ?? 0,
        resolved: resolvedByAdmin[admin.id] ?? 0,
        messagesSent: sentByAdmin[admin.id] ?? 0,
        avgResponseSeconds: responseByAdmin[admin.id]?.avg ?? 0,
        responseSamples: responseByAdmin[admin.id]?.count ?? 0,
      }))
      .sort((a, b) => b.messagesSent - a.messagesSent);

    return { rangeDays: safeDays, since, admins: rows };
  }

  /** Average reply time (seconds) per admin who answered a customer in range. */
  private async adminResponseTimes(since: Date) {
    const conversations = await this.prisma.conversation.findMany({
      where: { messages: { some: { senderType: SenderType.admin, createdAt: { gte: since } } } },
      select: {
        messages: {
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'asc' },
          select: { senderType: true, senderId: true, createdAt: true },
        },
      },
      take: 500,
    });

    const acc: Record<string, { total: number; count: number }> = {};
    for (const conversation of conversations) {
      // Measure first-response time per customer burst: a run of consecutive
      // customer messages counts once, from the first message to the reply.
      let askedAt: Date | null = null;
      for (const message of conversation.messages) {
        if (message.senderType === SenderType.customer) {
          if (!askedAt) askedAt = message.createdAt; // first of the burst
          continue;
        }
        if (!askedAt) continue; // reply with no pending customer question
        // Only attribute when an admin (not the AI) answered first.
        if (message.senderType === SenderType.admin && message.senderId) {
          const seconds = Math.max(0, (message.createdAt.getTime() - askedAt.getTime()) / 1000);
          const entry = (acc[message.senderId] ??= { total: 0, count: 0 });
          entry.total += seconds;
          entry.count += 1;
        }
        // Any agent reply (admin or ai) closes the burst; system/hermes ignored.
        if (message.senderType === SenderType.admin || message.senderType === SenderType.ai) {
          askedAt = null;
        }
      }
    }

    return Object.fromEntries(
      Object.entries(acc).map(([id, value]) => [
        id,
        { avg: Math.round(value.total / value.count), count: value.count },
      ]),
    );
  }

  private async getTopAccounts(days: number) {
    const since = this.daysAgo(days);
    const messages = await this.prisma.message.findMany({
      where: { createdAt: { gte: since } },
      select: { conversation: { select: { whatsappAccount: { select: { id: true, accountName: true } } } } },
    });

    const accountMap = new Map<string, { id: string; name: string; messageCount: number }>();
    for (const msg of messages) {
      const accId = msg.conversation.whatsappAccount.id;
      const existing = accountMap.get(accId);
      if (existing) {
        existing.messageCount += 1;
      } else {
        accountMap.set(accId, {
          id: accId,
          name: msg.conversation.whatsappAccount.accountName,
          messageCount: 1,
        });
      }
    }

    return [...accountMap.values()].sort((a, b) => b.messageCount - a.messageCount).slice(0, 5);
  }

  private async calculateResponseMetrics(since: Date) {
    const conversations = await this.prisma.conversation.findMany({
      where: { messages: { some: { createdAt: { gte: since } } } },
      select: {
        id: true,
        messages: {
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'asc' },
          select: { senderType: true, createdAt: true },
        },
      },
      take: 500,
    });

    const responseSeconds: number[] = [];
    for (const conversation of conversations) {
      // First-response time per customer burst: consecutive customer messages
      // count once (from the first), so chatty customers don't inflate the avg.
      let askedAt: Date | null = null;
      for (const message of conversation.messages) {
        if (message.senderType === SenderType.customer) {
          if (!askedAt) askedAt = message.createdAt;
          continue;
        }
        if (message.senderType === SenderType.admin || message.senderType === SenderType.ai) {
          if (askedAt) {
            responseSeconds.push(Math.max(0, (message.createdAt.getTime() - askedAt.getTime()) / 1000));
            askedAt = null;
          }
        }
        // system/hermes messages don't close a pending customer question
      }
    }

    responseSeconds.sort((a, b) => a - b);
    const avgSeconds = responseSeconds.length
      ? Math.round(responseSeconds.reduce((sum, seconds) => sum + seconds, 0) / responseSeconds.length)
      : 0;
    const p95Seconds = responseSeconds.length
      ? Math.round(responseSeconds[Math.floor((responseSeconds.length - 1) * 0.95)])
      : 0;
    return { avgSeconds, p95Seconds, sampleSize: responseSeconds.length };
  }

  private daysAgo(days: number) {
    return new Date(Date.now() - this.normalizeDays(days) * 24 * 60 * 60 * 1000);
  }

  private normalizeDays(days: number) {
    return Number.isFinite(days) ? Math.min(Math.max(days, 1), 90) : 7;
  }
}
