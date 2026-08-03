import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import {
  SentinelDecision,
  SentinelReview,
  RiskLevel,
  SenderType,
} from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { PromptBuilderService } from '../ai/prompt-builder.service';
import { ShippingService } from '../shipping/shipping.service'; // >>> ANGGA <<<
import { SettingsService } from '../settings/settings.service';
import { HermesAgentClient } from './hermes-agent.client';
import { MetricsService } from '../../common/metrics/metrics.service';
import { sentinelSystemPrompt, SENTINEL_PROMPT_VERSION } from './sentinel-prompt';
import {
  t,
  SENTINEL_PARSE_FALLBACK,
  SENTINEL_SUPERVISOR_SYSTEM,
  SENTINEL_BOT_INSIGHT_SYSTEM,
  SENTINEL_BOT_INSIGHT_QUESTION,
  FALLBACK_PHRASE,
} from '../../i18n/bot-prompts';

/** All fallback phrase variants across all languages — used for DB gap detection. */
const FALLBACK_MARKERS = Object.values(FALLBACK_PHRASE) as string[];
import {
  checkKnowledgeGrounding,
  checkForbiddenWords, // >>> ANGGA <<<
  checkShippingEscalation, // >>> ANGGA <<<
  checkPriceGrounding,
  decisionFromConfidence,
  evaluateRules,
  highestRisk,
  mostRestrictive,
} from './rules.engine';
import { logAudit } from '../../common/audit.util';

interface LlmReview {
  decision: SentinelDecision;
  confidence_score: number;
  risk_score: number;
  risk_level: RiskLevel;
  reason: string;
  recommendation: string;
}

const ACTIONABLE: SentinelDecision[] = [
  SentinelDecision.block,
  SentinelDecision.pause_ai,
  SentinelDecision.takeover_required,
];

@Injectable()
export class SentinelService {
  private readonly logger = new Logger(SentinelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly events: EventsGateway,
    private readonly notifications: NotificationsService,
    private readonly agent: HermesAgentClient,
    private readonly settings: SettingsService,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() private readonly shipping?: ShippingService, // >>> ANGGA <<<
  ) {}

  /**
   * Review a draft reply for a conversation. Combines a deterministic rules
   * pass (PRD 16) with an LLM judgement (PRD 15.2), takes the most
   * restrictive decision, persists a SentinelReview, and emits an alert when
   * the outcome needs human attention.
   *
   * @param opts.multiTopicBurst The customer sent several distinct-topic
   * messages before this reply was generated — one combined reply answering
   * several questions at once is more likely to get one of them wrong, so
   * this floors the decision at `draft` (never auto-approved) regardless of
   * how confident the LLM judge is.
   */
  async review(
    conversationId: string,
    draftText: string,
    opts: { multiTopicBurst?: boolean } = {},
  ): Promise<SentinelReview> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          where: { senderType: SenderType.customer },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        // >>> ANGGA: persona dibutuhkan untuk menegakkan forbiddenWords
        bot: { include: { persona: true } },
        // <<< ANGGA
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const lastCustomerText = conversation.messages[0]?.content ?? '';
    const sentinelConfig = await this.settings.sentinel();

    // 1. Deterministic rules over customer message + draft.
    const ruleHit = evaluateRules(`${lastCustomerText}\n${draftText}`, sentinelConfig.riskKeywords);

    // 1b. Deterministic groundedness check: does the draft state a price-like
    // number that isn't anywhere in the actual knowledge/product data the bot
    // was given? Catches fabrication a flaky LLM judge might still approve.
    const groundingText = await this.prompts.getGroundingText(conversationId);
    // >>> ANGGA: angka ongkir/COD yang sudah dibulatkan ikut jadi acuan sah,
    // supaya total yang benar tidak salah ditandai "mengarang" — dan sebaliknya
    // total yang TIDAK dihitung sistem tetap ketahan.
    const shippingNumbers = this.shipping
      ? await this.shipping.getGroundingNumbers(conversationId).catch(() => '')
      : '';
    const groundingHit = checkPriceGrounding(draftText, groundingText, shippingNumbers);
    // <<< ANGGA

    // 1c. RAG discipline: nothing retrieved + bot didn't punt to the fallback
    // phrase → it likely answered from outside the KB. Same n8n/Dify-style
    // "answer only from retrieved context" guarantee, enforced deterministically.
    const knowledgeHit = checkKnowledgeGrounding(draftText, groundingText, lastCustomerText);

    // >>> ANGGA: 1d. Kata terlarang persona — hanya diperiksa pada teks balasan
    // bot, bukan pesan pelanggan.
    const forbiddenHit = checkForbiddenWords(
      draftText,
      conversation.bot?.persona?.forbiddenWords,
    );

    // 1e. Sistem ongkir tidak bisa memberi angka PADAHAL pelanggan sudah
    // mengarah ke checkout -> naikkan ke admin (LAMPIRAN §3 + Rule 10).
    const shippingHit = checkShippingEscalation(
      this.shipping?.lastOutcome(conversationId) ?? null,
      lastCustomerText,
    );
    // <<< ANGGA

    // 2. LLM judgement.
    const llm = await this.llmReview(conversationId, draftText);

    // 3. Merge — most restrictive wins; confidence gate applies too.
    let decision = mostRestrictive(
      llm.decision,
      decisionFromConfidence(llm.confidence_score, sentinelConfig.draftConfidenceMin, sentinelConfig.autoSendConfidenceMin),
    );
    let riskLevel = llm.risk_level;
    let reason = llm.reason;

    if (ruleHit) {
      decision = mostRestrictive(decision, ruleHit.decision);
      riskLevel = highestRisk(riskLevel, ruleHit.riskLevel);
      reason = `${ruleHit.reason}. ${reason}`;
    }

    if (groundingHit) {
      decision = mostRestrictive(decision, groundingHit.decision);
      riskLevel = highestRisk(riskLevel, groundingHit.riskLevel);
      reason = `${groundingHit.reason}. ${reason}`;
    }

    if (knowledgeHit) {
      decision = mostRestrictive(decision, knowledgeHit.decision);
      riskLevel = highestRisk(riskLevel, knowledgeHit.riskLevel);
      reason = `${knowledgeHit.reason}. ${reason}`;
    }

    // >>> ANGGA
    if (forbiddenHit) {
      decision = mostRestrictive(decision, forbiddenHit.decision);
      riskLevel = highestRisk(riskLevel, forbiddenHit.riskLevel);
      reason = `${forbiddenHit.reason}. ${reason}`;
    }

    if (shippingHit) {
      decision = mostRestrictive(decision, shippingHit.decision);
      riskLevel = highestRisk(riskLevel, shippingHit.riskLevel);
      reason = `${shippingHit.reason}. ${reason}`;
    }
    // <<< ANGGA

    if (opts.multiTopicBurst && decision === SentinelDecision.approve) {
      decision = SentinelDecision.draft;
      reason = `Beberapa pesan beruntun dengan topik berbeda — ditahan untuk admin demi keamanan. ${reason}`;
    }

    const review = await this.prisma.sentinelReview.create({
      data: {
        conversationId,
        botId: conversation.botId,
        confidenceScore: llm.confidence_score,
        riskScore: llm.risk_score,
        riskLevel,
        decision,
        reason,
        recommendation: llm.recommendation,
        promptVersion: SENTINEL_PROMPT_VERSION,
      },
    });
    this.metrics?.sentinelReviews.inc({ decision: String(decision) });

    if (ACTIONABLE.includes(decision) || riskLevel === RiskLevel.critical) {
      this.events.emitToAccount(conversation.whatsappAccountId, 'sentinel:alert', { conversationId, review });
      // Audit actionable Sentinel decisions.
      if (
        decision === SentinelDecision.block ||
        decision === SentinelDecision.pause_ai ||
        decision === SentinelDecision.takeover_required
      ) {
        logAudit(this.prisma, {
          action: 'sentinel_action',
          entityType: 'conversation',
          entityId: conversationId,
          newValue: { decision, riskLevel, reason },
        }).catch(() => undefined);
      }
      // Proactively push critical/high-risk cases to admins (PRD 18).
      if (
        decision === SentinelDecision.pause_ai ||
        decision === SentinelDecision.takeover_required ||
        riskLevel === RiskLevel.critical
      ) {
        this.notifications.send(
          `🚨 Sentinel Alert\nKeputusan: ${decision} (risk ${riskLevel})\nAlasan: ${reason}${review.recommendation ? `\nRekomendasi: ${review.recommendation}` : ''}`,
        );
      }
    }

    return review;
  }

  private async llmReview(
    conversationId: string,
    draftText: string,
  ): Promise<LlmReview> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { bot: { select: { language: true } } },
    });
    const lang = conv?.bot?.language ?? 'en';

    const context = await this.prompts.buildForConversation(conversationId, 20);
    const history = context.filter((m) => m.role !== 'system');

    const draftLabel = lang === 'id'
      ? `Draft jawaban AI yang akan dikirim:\n"""${draftText}"""\n\nNilai draft ini. Balas HANYA JSON.`
      : `AI draft reply to be sent:\n"""${draftText}"""\n\nReview this draft. Reply ONLY with JSON.`;

    const raw = await this.provider.chat(
      [
        { role: 'system', content: sentinelSystemPrompt(lang) },
        ...history,
        { role: 'user', content: draftLabel },
      ],
      { temperature: 0, json: true, maxTokens: 350, model: await this.provider.sentinelModel() },
    );

    return this.parse(raw, lang);
  }

  private parse(raw: string, lang = 'id'): LlmReview {
    const fallback: LlmReview = {
      decision: SentinelDecision.draft,
      confidence_score: 50,
      risk_score: 50,
      risk_level: RiskLevel.medium,
      reason: lang === 'id'
        ? 'Tidak dapat mem-parsing penilaian Sentinel; default ke draft'
        : 'Could not parse Sentinel review; defaulting to draft',
      recommendation: t(SENTINEL_PARSE_FALLBACK, lang),
    };
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      const json = JSON.parse(raw.slice(start, end + 1));
      const decision = (Object.values(SentinelDecision) as string[]).includes(
        json.decision,
      )
        ? (json.decision as SentinelDecision)
        : SentinelDecision.draft;
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
      this.logger.warn(`Sentinel parse failed: ${err}`);
      return fallback;
    }
  }

  // ── Dashboards (PRD 7.18 / section 8) ───────────────────

  /** Recent reviews that need human attention. */
  alerts(limit = 50) {
    return this.prisma.sentinelReview.findMany({
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
      this.prisma.sentinelReview.groupBy({
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
    const grouped = await this.prisma.sentinelReview.groupBy({
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
        OR: FALLBACK_MARKERS.map((m) => ({ content: { contains: m, mode: 'insensitive' as const } })),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { conversation: { include: { customer: true } } },
    });
  }

  /**
   * Compact real-time snapshot of how every chatbot is doing — fed to the
   * Sentinel supervisor assistant so its answers are grounded in actual data.
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
            OR: FALLBACK_MARKERS.map((m) => ({ content: { contains: m, mode: 'insensitive' as const } })),
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
   * chatbot performance and Sentinel answers using the live snapshot as context.
   */
  async ask(question: string): Promise<{ answer: string; via: string }> {
    const snapshot = await this.performanceSnapshot();
    const context = JSON.stringify(snapshot);
    // Sentinel supervisor asks are admin-facing: use Indonesian as the default
    // supervisor language (admins typically work in their own language). This
    // can be made configurable per-admin in a future iteration.
    const system = t(SENTINEL_SUPERVISOR_SYSTEM, 'id');

    // Prefer the agentic Hermes Agent sidecar; fall back to the plain model.
    const viaAgent = await this.agent.ask(question, context, system);
    if (viaAgent) return { answer: viaAgent, via: 'hermes-agent' };

    const answer = await this.provider.chat(
      [
        { role: 'system', content: `${system}\n\nDATA:\n${context}` },
        { role: 'user', content: question },
      ],
      { temperature: 0.3, maxTokens: 600, model: await this.provider.sentinelModel() },
    );
    return { answer, via: 'model' };
  }

  /**
   * Deep-dive analysis of a single bot: aggregates its recent reviews and
   * has Sentinel summarize strengths, recurring issues, and concrete fixes
   * (PRD 8.3 bot performance scoring + recommendation).
   */
  async botInsight(botId: string): Promise<{
    bot: string;
    metrics: {
      reviews: number;
      avgConfidence: number;
      avgRisk: number;
      decisions: Record<string, number>;
    };
    insight: string;
  }> {
    const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) throw new NotFoundException('Bot not found');

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [agg, decisions, recent, gapCount] = await Promise.all([
      this.prisma.sentinelReview.aggregate({
        where: { botId, createdAt: { gte: since } },
        _avg: { confidenceScore: true, riskScore: true },
        _count: { _all: true },
      }),
      this.prisma.sentinelReview.groupBy({
        by: ['decision'],
        where: { botId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.sentinelReview.findMany({
        where: { botId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { decision: true, riskLevel: true, reason: true },
      }),
      this.prisma.message.count({
        where: {
          senderType: SenderType.ai,
          conversation: { botId },
          OR: FALLBACK_MARKERS.map((m) => ({ content: { contains: m, mode: 'insensitive' as const } })),
        },
      }),
    ]);

    const metrics = {
      reviews: agg._count._all,
      avgConfidence: Math.round(agg._avg.confidenceScore ?? 0),
      avgRisk: Math.round(agg._avg.riskScore ?? 0),
      decisions: Object.fromEntries(
        decisions.map((d) => [d.decision, d._count._all]),
      ),
    };

    const botLang = bot.language ?? 'en';
    const system = t(SENTINEL_BOT_INSIGHT_SYSTEM, botLang);
    const contextLabel = botLang === 'id'
      ? `Bot: ${bot.botName}\nMetrik: ${JSON.stringify(metrics)}\nKnowledge-gap (fallback ke admin): ${gapCount}\nSampel review terbaru: ${JSON.stringify(recent)}`
      : `Bot: ${bot.botName}\nMetrics: ${JSON.stringify(metrics)}\nKnowledge gaps (fallback to admin): ${gapCount}\nRecent review samples: ${JSON.stringify(recent)}`;
    const context = contextLabel;
    const question = t(SENTINEL_BOT_INSIGHT_QUESTION, botLang)(bot.botName);

    const insight =
      (await this.agent.ask(question, context, system)) ??
      (await this.provider.chat(
        [
          { role: 'system', content: `${system}\n\nDATA:\n${context}` },
          { role: 'user', content: question },
        ],
        { temperature: 0.3, maxTokens: 600, model: await this.provider.sentinelModel() },
      ));

    return { bot: bot.botName, metrics, insight };
  }
}

function clamp(n: unknown): number {
  return Math.max(0, Math.min(100, Number(n) || 0));
}
