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
    const stages = Object.values(LeadStage);
    const counts = await Promise.all(
      stages.map((stage) =>
        this.prisma.customer.count({ where: { leadStage: stage } }).then((count) => ({ stage, count })),
      ),
    );
    return counts;
  }

  async getMessageVolume(days: number) {
    const safeDays = this.normalizeDays(days);
    const result: { date: string; count: number }[] = [];
    const now = new Date();

    for (let i = safeDays - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const count = await this.prisma.message.count({ where: { createdAt: { gte: start, lte: end } } });
      result.push({ date: start.toISOString().slice(0, 10), count });
    }

    return result;
  }

  async getAiModeBreakdown() {
    const modes = ['ai_on', 'ai_off', 'ai_draft', 'ai_supervised', 'ai_paused'];
    const counts = await Promise.all(
      modes.map((mode) =>
        this.prisma.conversation.count({ where: { aiMode: mode as never } }).then((count) => ({ mode, count })),
      ),
    );
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    return counts.map((c) => ({ ...c, percentage: total > 0 ? Math.round((c.count / total) * 100) : 0 }));
  }

  async getPerformanceOverview(days: number) {
    const safeDays = this.normalizeDays(days);
    const since = this.daysAgo(safeDays);
    const [response, aiQuality, campaign, messageVolume, topAccounts] = await Promise.all([
      this.calculateResponseMetrics(since),
      this.getAiQuality(safeDays),
      this.getCampaignPerformance(safeDays),
      this.getMessageVolume(safeDays),
      this.getTopAccounts(safeDays),
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

  private async getTopAccounts(days: number) {
    const since = this.daysAgo(days);
    const topAccountsRaw = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const convIds = topAccountsRaw.map((r) => r.conversationId);
    const convs = await this.prisma.conversation.findMany({
      where: { id: { in: convIds } },
      include: { whatsappAccount: true },
    });
    const convMap = new Map(convs.map((c) => [c.id, c]));
    const topAccountsMap = new Map<string, { id: string; name: string; messageCount: number }>();
    for (const r of topAccountsRaw) {
      const conv = convMap.get(r.conversationId);
      if (!conv) continue;
      const accId = conv.whatsappAccount.id;
      const existing = topAccountsMap.get(accId);
      if (existing) existing.messageCount += r._count.id;
      else topAccountsMap.set(accId, { id: accId, name: conv.whatsappAccount.accountName, messageCount: r._count.id });
    }
    return [...topAccountsMap.values()].sort((a, b) => b.messageCount - a.messageCount).slice(0, 5);
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
      const messages = conversation.messages;
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.senderType !== SenderType.customer) continue;
        const response = messages.slice(i + 1).find((candidate) => (
          candidate.senderType === SenderType.admin || candidate.senderType === SenderType.ai
        ));
        if (!response) continue;
        responseSeconds.push(Math.max(0, (response.createdAt.getTime() - message.createdAt.getTime()) / 1000));
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
