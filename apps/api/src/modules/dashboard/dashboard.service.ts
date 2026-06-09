import { Injectable } from '@nestjs/common';
import { FollowUpStatus, LeadStage } from '@hermes/database';
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
    ]);

    // Top accounts by message count in last 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const topAccountsRaw = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    // Get account names
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
      if (existing) {
        existing.messageCount += r._count.id;
      } else {
        topAccountsMap.set(accId, {
          id: accId,
          name: conv.whatsappAccount.accountName,
          messageCount: r._count.id,
        });
      }
    }
    const topAccounts = [...topAccountsMap.values()]
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 5);

    // Avg response time (AI/admin response after customer message, in seconds)
    // Simplified: return 0 if no data
    const avgResponseTime = 0;

    return {
      totalConversations,
      activeConversations,
      aiOnConversations,
      pendingFollowUps,
      leadsToday: {
        hot: hotLeadsToday,
        warm: warmLeadsToday,
        cold: coldLeadsToday,
      },
      messagesLast24h,
      avgResponseTime,
      topAccounts,
    };
  }

  async getLeadFunnel() {
    const stages = Object.values(LeadStage);
    const counts = await Promise.all(
      stages.map((stage) =>
        this.prisma.customer.count({ where: { leadStage: stage } }).then((count) => ({
          stage,
          count,
        })),
      ),
    );
    return counts;
  }

  async getMessageVolume(days: number) {
    const result: { date: string; count: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const count = await this.prisma.message.count({
        where: { createdAt: { gte: start, lte: end } },
      });

      result.push({
        date: start.toISOString().slice(0, 10),
        count,
      });
    }

    return result;
  }

  async getAiModeBreakdown() {
    const modes = ['ai_on', 'ai_off', 'ai_draft', 'ai_supervised', 'ai_paused'];
    const counts = await Promise.all(
      modes.map((mode) =>
        this.prisma.conversation.count({ where: { aiMode: mode as any } }).then((count) => ({
          mode,
          count,
        })),
      ),
    );
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    return counts.map((c) => ({
      ...c,
      percentage: total > 0 ? Math.round((c.count / total) * 100) : 0,
    }));
  }
}
