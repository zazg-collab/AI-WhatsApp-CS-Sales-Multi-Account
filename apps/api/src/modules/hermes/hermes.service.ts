import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  HermesDecision,
  HermesReview,
  RiskLevel,
  SenderType,
} from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { AiProviderService } from '../ai/ai-provider.service';
import { PromptBuilderService } from '../ai/prompt-builder.service';
import { HERMES_SYSTEM } from './hermes-prompt';
import {
  decisionFromConfidence,
  evaluateRules,
  highestRisk,
  mostRestrictive,
} from './rules.engine';

interface LlmReview {
  decision: HermesDecision;
  confidence_score: number;
  risk_score: number;
  risk_level: RiskLevel;
  reason: string;
  recommendation: string;
}

const ACTIONABLE: HermesDecision[] = [
  HermesDecision.block,
  HermesDecision.pause_ai,
  HermesDecision.takeover_required,
];

@Injectable()
export class HermesService {
  private readonly logger = new Logger(HermesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly events: EventsGateway,
  ) {}

  /**
   * Review a draft reply for a conversation. Combines a deterministic rules
   * pass (PRD 16) with an LLM judgement (PRD 15.2), takes the most
   * restrictive decision, persists a HermesReview, and emits an alert when
   * the outcome needs human attention.
   */
  async review(conversationId: string, draftText: string): Promise<HermesReview> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          where: { senderType: SenderType.customer },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const lastCustomerText = conversation.messages[0]?.content ?? '';

    // 1. Deterministic rules over customer message + draft.
    const ruleHit = evaluateRules(`${lastCustomerText}\n${draftText}`);

    // 2. LLM judgement.
    const llm = await this.llmReview(conversationId, draftText);

    // 3. Merge — most restrictive wins; confidence gate applies too.
    let decision = mostRestrictive(
      llm.decision,
      decisionFromConfidence(llm.confidence_score),
    );
    let riskLevel = llm.risk_level;
    let reason = llm.reason;

    if (ruleHit) {
      decision = mostRestrictive(decision, ruleHit.decision);
      riskLevel = highestRisk(riskLevel, ruleHit.riskLevel);
      reason = `${ruleHit.reason}. ${reason}`;
    }

    const review = await this.prisma.hermesReview.create({
      data: {
        conversationId,
        botId: conversation.botId,
        confidenceScore: llm.confidence_score,
        riskScore: llm.risk_score,
        riskLevel,
        decision,
        reason,
        recommendation: llm.recommendation,
      },
    });

    if (ACTIONABLE.includes(decision) || riskLevel === RiskLevel.critical) {
      this.events.emit('hermes:alert', { conversationId, review });
    }

    return review;
  }

  private async llmReview(
    conversationId: string,
    draftText: string,
  ): Promise<LlmReview> {
    const context = await this.prompts.buildForConversation(conversationId, 20);
    const history = context.filter((m) => m.role !== 'system');

    const raw = await this.provider.chat(
      [
        { role: 'system', content: HERMES_SYSTEM },
        ...history,
        {
          role: 'user',
          content: `Draft jawaban AI yang akan dikirim:\n"""${draftText}"""\n\nNilai draft ini. Balas HANYA JSON.`,
        },
      ],
      { temperature: 0, json: true, maxTokens: 350 },
    );

    return this.parse(raw);
  }

  private parse(raw: string): LlmReview {
    const fallback: LlmReview = {
      decision: HermesDecision.draft,
      confidence_score: 50,
      risk_score: 50,
      risk_level: RiskLevel.medium,
      reason: 'Tidak dapat mem-parsing penilaian Hermes; default ke draft',
      recommendation: 'Admin tinjau manual',
    };
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      const json = JSON.parse(raw.slice(start, end + 1));
      const decision = (Object.values(HermesDecision) as string[]).includes(
        json.decision,
      )
        ? (json.decision as HermesDecision)
        : HermesDecision.draft;
      const risk = (Object.values(RiskLevel) as string[]).includes(
        json.risk_level,
      )
        ? (json.risk_level as RiskLevel)
        : RiskLevel.medium;
      return {
        decision,
        confidence_score: clamp(json.confidence_score),
        risk_score: clamp(json.risk_score),
        risk_level: risk,
        reason: String(json.reason ?? ''),
        recommendation: String(json.recommendation ?? ''),
      };
    } catch (err) {
      this.logger.warn(`Hermes parse failed: ${err}`);
      return fallback;
    }
  }

  // ── Dashboards (PRD 7.18 / section 8) ───────────────────

  /** Recent reviews that need human attention. */
  alerts(limit = 50) {
    return this.prisma.hermesReview.findMany({
      where: {
        OR: [
          { decision: { in: ACTIONABLE } },
          { riskLevel: { in: [RiskLevel.high, RiskLevel.critical] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { conversation: { include: { customer: true } } },
    });
  }

  async dailyReport() {
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const [messages, newCustomers, reviews, hotLeads] = await Promise.all([
      this.prisma.message.count({ where: { createdAt: { gte: since } } }),
      this.prisma.customer.count({ where: { createdAt: { gte: since } } }),
      this.prisma.hermesReview.groupBy({
        by: ['decision'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.customer.count({
        where: { leadStage: { in: ['hot', 'very_hot'] } },
      }),
    ]);

    const byDecision: Record<string, number> = {};
    for (const r of reviews) byDecision[r.decision] = r._count._all;

    return {
      date: since.toISOString().slice(0, 10),
      totalMessages: messages,
      newCustomers,
      hotLeads,
      reviewsByDecision: byDecision,
    };
  }

  async botPerformance() {
    const grouped = await this.prisma.hermesReview.groupBy({
      by: ['botId'],
      _avg: { confidenceScore: true, riskScore: true },
      _count: { _all: true },
    });
    return grouped.map((g) => ({
      botId: g.botId,
      reviews: g._count._all,
      avgConfidence: Math.round(g._avg.confidenceScore ?? 0),
      avgRisk: Math.round(g._avg.riskScore ?? 0),
    }));
  }

  /**
   * Knowledge gaps: AI replies that fell back to "konfirmasi ke admin"
   * indicate the knowledge base could not answer (PRD 8.4).
   */
  knowledgeGaps(limit = 50) {
    return this.prisma.message.findMany({
      where: {
        senderType: SenderType.ai,
        content: { contains: 'konfirmasi dulu ke admin', mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { conversation: { include: { customer: true } } },
    });
  }

  /**
   * Compact real-time snapshot of how every chatbot is doing — fed to the
   * Hermes supervisor assistant so its answers are grounded in actual data.
   */
  async performanceSnapshot() {
    const [report, perf, bots, leadDist, gapCount, recentAlerts] =
      await Promise.all([
        this.dailyReport(),
        this.botPerformance(),
        this.prisma.bot.findMany({ select: { id: true, botName: true } }),
        this.prisma.customer.groupBy({
          by: ['leadStage'],
          _count: { _all: true },
        }),
        this.prisma.message.count({
          where: {
            senderType: SenderType.ai,
            content: {
              contains: 'konfirmasi dulu ke admin',
              mode: 'insensitive',
            },
          },
        }),
        this.alerts(15),
      ]);

    const botName = new Map(bots.map((b) => [b.id, b.botName]));

    return {
      today: report,
      leadDistribution: Object.fromEntries(
        leadDist.map((l) => [l.leadStage, l._count._all]),
      ),
      knowledgeGapCount: gapCount,
      bots: perf.map((p) => ({
        bot: p.botId ? (botName.get(p.botId) ?? p.botId) : 'unassigned',
        reviews: p.reviews,
        avgConfidence: p.avgConfidence,
        avgRisk: p.avgRisk,
      })),
      alerts: recentAlerts.map((a) => ({
        customer: a.conversation?.customer?.name ?? a.conversation?.customer?.phoneNumber,
        decision: a.decision,
        riskLevel: a.riskLevel,
        reason: a.reason,
      })),
    };
  }

  /**
   * Conversational supervisor assistant (PRD 8.7). The admin/owner asks about
   * chatbot performance and Hermes answers using the live snapshot as context.
   */
  async ask(question: string): Promise<{ answer: string }> {
    const snapshot = await this.performanceSnapshot();
    const answer = await this.provider.chat(
      [
        {
          role: 'system',
          content: `Kamu adalah Hermes, supervisor assistant yang membantu owner/admin memantau kinerja banyak chatbot WhatsApp CS/Sales.
Jawab pertanyaan berdasarkan DATA berikut (JSON real-time). Jangan mengarang angka di luar data.
Beri jawaban ringkas, actionable, dalam Bahasa Indonesia. Jika relevan, sebutkan bot/customer spesifik dan rekomendasi konkret.

DATA:
${JSON.stringify(snapshot)}`,
        },
        { role: 'user', content: question },
      ],
      { temperature: 0.3, maxTokens: 600 },
    );
    return { answer };
  }

  async approve(conversationId: string) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiMode: 'ai_on', takeoverStatus: 'returned_to_ai' },
    });
  }

  async block(conversationId: string) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiMode: 'ai_paused', takeoverStatus: 'waiting_admin' },
    });
  }
}

function clamp(n: unknown): number {
  return Math.max(0, Math.min(100, Number(n) || 0));
}
