import { Injectable, Logger, Optional } from '@nestjs/common';
import { LeadStage } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  AiProviderService,
  ChatMessage,
} from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { AiCacheService } from './ai-cache.service';
import {
  t,
  LEAD_SCORE_SYSTEM,
  LEAD_SCORE_USER,
  SENTIMENT_SYSTEM,
  SENTIMENT_USER_PREFIX,
  SENTIMENT_USER_SUFFIX,
  SENTIMENT_NO_MESSAGES,
  SUMMARIZE_SYSTEM,
  SUMMARIZE_USER,
  FALLBACK_PHRASE,
} from '../../i18n/bot-prompts';

/** All fallback-phrase variants (all languages) — marks an AI "punt to admin". */
const FALLBACK_MARKERS = Object.values(FALLBACK_PHRASE) as string[];

export interface GeneratedReply {
  text: string;
  model: string;
}

export interface LeadScoreResult {
  score: number;
  stage: LeadStage;
  reasons: string[];
}

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

export interface SentimentResult {
  sentiment: Sentiment;
  score: number;
  reason: string;
}

const CACHEABLE_MAX_QUESTION_CHARS = 200;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly notifications: NotificationsService,
    private readonly cache: AiCacheService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  cacheStats() {
    return this.cache.stats();
  }

  listModels() {
    return this.provider.listModels();
  }

  config() {
    return this.provider.getConfig();
  }

  /** Generate a reply/draft for a conversation. Does not send. */
  async generateReply(
    conversationId: string,
    model?: string,
    useCache = false,
  ): Promise<GeneratedReply> {
    const messages = await this.prompts.buildForConversation(conversationId);
    const resolvedModel = model ?? (await this.provider.defaultModel());

    // Conservative caching: only for short, generic latest questions. The
    // cache is opt-in (useCache) so existing callers keep prior behavior.
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === 'user')?.content;
    const cacheable =
      useCache &&
      typeof lastUser === 'string' &&
      lastUser.length > 0 &&
      lastUser.length < CACHEABLE_MAX_QUESTION_CHARS;

    let botId: string | null = null;
    if (cacheable) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { botId: true },
      });
      botId = conv?.botId ?? null;
      if (botId) {
        const hit = this.cache.get(botId, lastUser as string);
        if (hit !== null) {
          this.metrics?.aiRequests.inc({ outcome: 'cache' });
          return { text: hit, model: resolvedModel };
        }
      }
    }

    let text: string;
    const stopTimer = this.metrics?.aiRequestDuration.startTimer();
    try {
      text = await this.provider.chat(messages, {
        model,
        // temperature omitted → uses the admin-configured value from settings.
        maxTokens: 500,
      });
    } catch (err) {
      stopTimer?.();
      this.metrics?.aiRequests.inc({ outcome: 'error' });
      throw err;
    }
    stopTimer?.();
    // "fallback" = the bot punted to the admin-confirm phrase (a quality signal,
    // mirrors Hermes knowledge-gap detection); everything else is a real answer.
    const outcome = FALLBACK_MARKERS.some((m) => text.includes(m)) ? 'fallback' : 'success';
    this.metrics?.aiRequests.inc({ outcome });

    if (cacheable && botId) {
      this.cache.set(botId, lastUser as string, text);
    }

    return { text, model: resolvedModel };
  }

  /** Resolve bot language for a conversation (defaults to 'id'). */
  private async botLang(conversationId: string): Promise<string> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { bot: { select: { language: true } } },
    });
    return row?.bot?.language ?? 'en';
  }

  /**
   * Analyze customer sentiment from the most recent customer messages.
   * Returns a structured result; never throws on parse failure.
   */
  async analyzeSentiment(conversationId: string): Promise<SentimentResult> {
    const [lang, history] = await Promise.all([
      this.botLang(conversationId),
      this.prompts.buildForConversation(conversationId, 30),
    ]);
    const customerLines = history
      .filter((m) => m.role === 'user')
      .slice(-10)
      .map((m) => `- ${m.content}`)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: t(SENTIMENT_SYSTEM, lang) },
      {
        role: 'user',
        content:
          t(SENTIMENT_USER_PREFIX, lang) +
          (customerLines || t(SENTIMENT_NO_MESSAGES, lang)) +
          t(SENTIMENT_USER_SUFFIX, lang),
      },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0,
      json: true,
      maxTokens: 200,
    });

    return this.parseSentiment(raw);
  }

  private parseSentiment(raw: string): SentimentResult {
    const valid: Sentiment[] = ['positive', 'neutral', 'negative', 'frustrated'];
    try {
      const json = JSON.parse(this.extractJson(raw));
      const sentiment: Sentiment = valid.includes(json.sentiment)
        ? json.sentiment
        : 'neutral';
      const score = Math.max(0, Math.min(100, Number(json.score)));
      return {
        sentiment,
        score: Number.isFinite(score) ? score : 50,
        reason: typeof json.reason === 'string' ? json.reason : '',
      };
    } catch (err) {
      this.logger.warn(`Failed to parse sentiment: ${err}`);
      return { sentiment: 'neutral', score: 50, reason: 'unparseable' };
    }
  }

  async summarizeChat(conversationId: string): Promise<string> {
    const [lang, history] = await Promise.all([
      this.botLang(conversationId),
      this.prompts.buildForConversation(conversationId, 60),
    ]);
    const messages: ChatMessage[] = [
      { role: 'system', content: t(SUMMARIZE_SYSTEM, lang) },
      ...history.filter((m) => m.role !== 'system'),
      { role: 'user', content: t(SUMMARIZE_USER, lang) },
    ];
    return this.provider.chat(messages, { temperature: 0.3, maxTokens: 250 });
  }

  /**
   * Score the conversation as a sales lead (PRD 7.7) and persist the result
   * on the customer record.
   */
  async leadScore(conversationId: string): Promise<LeadScoreResult> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { customerId: true },
    });
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const [lang, history] = await Promise.all([
      this.botLang(conversationId),
      this.prompts.buildForConversation(conversationId, 40),
    ]);
    const messages: ChatMessage[] = [
      { role: 'system', content: t(LEAD_SCORE_SYSTEM, lang) },
      ...history.filter((m) => m.role !== 'system'),
      { role: 'user', content: t(LEAD_SCORE_USER, lang) },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0,
      json: true,
      maxTokens: 300,
    });

    const result = this.parseLeadScore(raw);

    const before = await this.prisma.customer.findUnique({
      where: { id: conversation.customerId },
      select: { leadStage: true },
    });

    const customer = await this.prisma.customer.update({
      where: { id: conversation.customerId },
      data: { leadScore: result.score, leadStage: result.stage },
    });

    // Persist a stage-change event so closing analytics can compute funnel
    // velocity. Fire-and-forget — never blocks the scoring response.
    if (before && before.leadStage !== result.stage) {
      void this.prisma.auditLog.create({
        data: {
          action: 'ai_lead_stage_changed',
          entityType: 'Customer',
          entityId: conversation.customerId,
          oldValue: { stage: before.leadStage, conversationId },
          newValue: { stage: result.stage, score: result.score, conversationId, reasons: result.reasons },
        },
      });
    }

    if (
      result.stage === LeadStage.hot ||
      result.stage === LeadStage.very_hot
    ) {
      this.notifications.send(
        `🔥 Hot Lead (${result.score})\n${customer.name ?? customer.phoneNumber}\n${result.reasons.slice(0, 3).join(', ')}`,
      );
    }

    return result;
  }

  private parseLeadScore(raw: string): LeadScoreResult {
    let score = 0;
    let stage: LeadStage = LeadStage.cold;
    let reasons: string[] = [];
    try {
      const json = JSON.parse(this.extractJson(raw));
      score = Math.max(0, Math.min(100, Number(json.score) || 0));
      reasons = Array.isArray(json.reasons) ? json.reasons.map(String) : [];
      stage = this.stageFromScore(score, json.stage);
    } catch (err) {
      this.logger.warn(`Failed to parse lead score: ${err}`);
    }
    return { score, stage, reasons };
  }

  private stageFromScore(score: number, given?: string): LeadStage {
    if (given && (LeadStage as Record<string, string>)[given]) {
      return given as LeadStage;
    }
    if (score >= 81) return LeadStage.very_hot;
    if (score >= 61) return LeadStage.hot;
    if (score >= 31) return LeadStage.warm;
    return LeadStage.cold;
  }

  /** Tolerate models that wrap JSON in prose or code fences. */
  private extractJson(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
    return raw;
  }
}
