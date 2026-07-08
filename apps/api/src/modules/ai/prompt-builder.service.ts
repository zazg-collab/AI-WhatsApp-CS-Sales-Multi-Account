import { Injectable, NotFoundException } from '@nestjs/common';
import { SenderType } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatMessage } from './ai-provider.service';
import { ProductsService } from '../products/products.service';
import { KnowledgeIndexService, RetrievedKnowledge } from './knowledge-index.service';
import {
  t,
  BASE_RULES,
  BOT_IDENTITY,
  BOT_PERSONA_FALLBACK,
  CONTEXT_TRIM_NOTE,
  KNOWLEDGE_EMPTY_NOTE,
  KNOWLEDGE_SECTION_LABEL,
  MEDIA_EMPTY_NOTE,
  MEDIA_SECTION_LABEL,
  PERSONA_SECTION_LABEL,
  PRODUCT_AVAILABLE,
  PRODUCT_OUT_OF_STOCK,
  PRODUCT_STOCK_INTRO,
  SECURITY_DIRECTIVE,
  mediaPlaceholder,
  fenceData,
  localeFor,
} from '../../i18n/bot-prompts';

/** Hard cap on how many recent messages to keep as history turns. */
export const MAX_HISTORY_MESSAGES = 20;
/** Rough character budget for the chat-history portion of the prompt. */
export const MAX_CONTEXT_CHARS = 12000;
/** Max knowledge items injected into a reply prompt (retrieval top-K). */
export const KNOWLEDGE_MAX_ITEMS = 12;
/** How many active items to pull and rank before selecting the top-K. */
export const KNOWLEDGE_SCAN_LIMIT = 200;
/** How many semantic candidates to pull from the vector index before rerank. */
export const KNOWLEDGE_VECTOR_CANDIDATES = 24;
/** Weight of the semantic signal relative to one keyword-term hit in the
 *  hybrid rerank. A top vector hit thus outranks a couple of keyword matches. */
export const KNOWLEDGE_VECTOR_WEIGHT = 3;

/** Rough token estimate (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/**
 * Format a product price for AI prompt injection.
 * Uses the product's own currency when available (e.g. "USD 12,500");
 * falls back to the bot's locale number format (e.g. "12.500" in id-ID).
 */
function formatProductPrice(price: number, currency: string | null | undefined, botLocale: string): string {
  if (currency) {
    try {
      return price.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch {
      // Unknown ISO code — fall through to plain number
    }
  }
  return price.toLocaleString(botLocale);
}

@Injectable()
export class PromptBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly knowledgeIndex: KnowledgeIndexService,
  ) {}

  /**
   * Builds the full message array for a reply: a system prompt assembled
   * per PRD 15.1 (persona + knowledge + customer memory) followed by the
   * recent conversation history mapped to user/assistant turns.
   */
  async buildForConversation(
    conversationId: string,
    historyLimit = 30,
  ): Promise<ChatMessage[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        bot: { include: { persona: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: historyLimit,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const lang = conversation.bot?.language ?? 'en';

    const soul =
      conversation.bot?.persona?.soulMd ??
      t(BOT_PERSONA_FALLBACK, lang);

    // Relevance query = the customer's most recent messages. Used to pick the
    // most relevant knowledge items instead of dumping the whole base.
    const query = conversation.messages
      .filter((m) => m.senderType === SenderType.customer && m.content)
      .slice(0, 3)
      .map((m) => m.content as string)
      .join(' ');

    const knowledge = await this.loadKnowledge(
      conversation.bot?.knowledgeBaseId ?? null,
      query,
      lang,
    );

    const memory = this.customerMemory(conversation.customer, lang);

    // Live product stock relevant to the customer's question. The bot answers
    // availability only from this real data — never fabricated. Embedded in the
    // primary system message (not a trailing one) because models heed the first
    // system block strongest; otherwise the fallback rule overrides it.
    const products = query ? await this.products.relevantForQuery(query) : [];
    const botLocale = localeFor(lang);
    const productBlock = products.length
      ? [
          t(PRODUCT_STOCK_INTRO, lang),
          ...products.map((p) => {
            const price = p.price != null ? ` — ${formatProductPrice(p.price, p.currency, botLocale)}` : '';
            const stockLabel = p.stock > 0
              ? `${t(PRODUCT_AVAILABLE, lang)} (${p.stock}${p.unit ? ` ${p.unit}` : ''})`
              : t(PRODUCT_OUT_OF_STOCK, lang);
            return `• ${p.name}${p.category ? ` (${p.category})` : ''}${price} — ${stockLabel}`;
          }),
        ].join('\n')
      : null;

    // So rule 12 ("only mention media that's actually available") is grounded
    // in real data, not just a promise the model might ignore.
    const mediaList = await this.loadActiveMedia();
    const mediaBlock = [
      t(MEDIA_SECTION_LABEL, lang),
      mediaList.length
        ? mediaList.map((m) => `• ${m.title} (${m.purpose}${m.kind ? `, ${m.kind}` : ''})`).join('\n')
        : t(MEDIA_EMPTY_NOTE, lang),
    ].join('\n');

    // The LARGE shared block (persona + knowledge + rules [+ stock]) leads the
    // prompt. When no product matched it is byte-identical across conversations
    // of a bot — the cacheable prefix providers reuse at ~10% cost; the small
    // per-customer block stays a separate later message.
    const sharedSystem = [
      t(BOT_IDENTITY, lang),
      '',
      t(PERSONA_SECTION_LABEL, lang),
      soul,
      '',
      t(KNOWLEDGE_SECTION_LABEL, lang),
      // Knowledge is retrieved from items that may echo customer-supplied text;
      // fence it so adversarial wording inside an item cannot act as an
      // instruction. The empty note is plain (nothing to fence).
      knowledge ? fenceData(knowledge, lang) : t(KNOWLEDGE_EMPTY_NOTE, lang),
      '',
      t(BASE_RULES, lang),
      ...(productBlock ? ['', productBlock] : []),
      '',
      mediaBlock,
    ].join('\n');

    // Customer memory (incl. aiMemory mined from chats) is injection-prone too —
    // fence it as reference data, never instructions.
    const customerSystem = ['Data customer:', fenceData(memory, lang)].join('\n');

    // Messages come newest-first; map to chronological user/assistant turns.
    // A media message with no caption gets a localized placeholder so the model
    // knows an attachment arrived (rule 9) instead of an empty/dropped turn.
    const contentFor = (m: { content: string | null; messageType: string }): string => {
      if (m.content && m.content.trim()) return m.content;
      if (m.messageType && m.messageType !== 'text') return mediaPlaceholder(lang, m.messageType);
      return '';
    };
    const ordered = conversation.messages
      .slice()
      .reverse()
      .map((m) => ({ ...m, promptContent: contentFor(m) }))
      .filter((m) => m.promptContent);

    const cap = Math.min(historyLimit, MAX_HISTORY_MESSAGES);
    const truncated = ordered.length > cap;
    const kept = truncated ? ordered.slice(ordered.length - cap) : ordered;

    let history: ChatMessage[] = kept.map((m) => ({
      role:
        m.senderType === SenderType.customer
          ? ('user' as const)
          : ('assistant' as const),
      content: m.promptContent,
    }));

    // Token-budget trim: drop oldest history turns until under MAX_CONTEXT_CHARS.
    // System prompt + knowledge stay intact; only chat history is trimmed.
    const historyChars = (msgs: ChatMessage[]) =>
      msgs.reduce((sum, m) => sum + m.content.length, 0);
    let budgetTrimmed = false;
    while (history.length > 1 && historyChars(history) > MAX_CONTEXT_CHARS) {
      history.shift();
      budgetTrimmed = true;
    }

    // If we dropped context, prepend a placeholder so it isn't silently lost.
    if (truncated || budgetTrimmed) {
      const boundary = history[0]?.content ?? '';
      const note = t(CONTEXT_TRIM_NOTE, lang)(boundary);
      history = [{ role: 'system', content: note }, ...history];
    }

    return [
      // System-authored guard FIRST (strongest heed): role/scope confinement +
      // anti prompt-injection. Independent of the user-editable persona.
      { role: 'system', content: t(SECURITY_DIRECTIVE, lang) },
      { role: 'system', content: sharedSystem },
      { role: 'system', content: customerSystem },
      ...history,
    ];
  }

  /**
   * The same knowledge + live-product text injected into the prompt for this
   * conversation, returned standalone so a deterministic groundedness check
   * (Sentinel's checkPriceGrounding) can verify a draft against the actual
   * data the bot was given — not just trust the LLM's "don't fabricate" rule.
   */
  async getGroundingText(conversationId: string): Promise<string> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        bot: { select: { knowledgeBaseId: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });
    if (!conversation) return '';

    const query = conversation.messages
      .filter((m) => m.senderType === SenderType.customer && m.content)
      .map((m) => m.content as string)
      .join(' ');

    const knowledge = await this.loadKnowledge(conversation.bot?.knowledgeBaseId ?? null, query);
    const products = query ? await this.products.relevantForQuery(query) : [];
    const productText = products
      .map((p) => `${p.name} ${p.price ?? ''} ${p.stock}`)
      .join('\n');

    return `${knowledge}\n${productText}`;
  }

  /** Active asset titles the bot may honestly reference (rule 12). Global,
   *  not per-bot — assets aren't scoped to a bot in the data model. */
  private async loadActiveMedia(): Promise<Array<{ title: string; purpose: string; kind: string }>> {
    return this.prisma.asset.findMany({
      where: { status: 'active' },
      select: { title: true, purpose: true, kind: true },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async loadKnowledge(
    knowledgeBaseId: string | null,
    query = '',
    _lang = 'id',
  ): Promise<string> {
    if (!knowledgeBaseId) return '';
    const now = new Date();
    const items = await this.prisma.knowledgeItem.findMany({
      where: {
        knowledgeBaseId,
        status: 'active',
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: KNOWLEDGE_SCAN_LIMIT,
    });

    // Pull semantic candidates in parallel-friendly order. Empty when RAG is
    // disabled, no query yet, or nothing is embedded → pure keyword path below.
    const vectorHits = query
      ? await this.knowledgeIndex.search(knowledgeBaseId, query, KNOWLEDGE_VECTOR_CANDIDATES)
      : [];

    const selected = this.selectKnowledge(items, vectorHits, query);

    return selected
      .map((i) => `• ${i.title}${i.productName ? ` (${i.productName})` : ''}: ${i.content}`)
      .join('\n');
  }

  /**
   * Pick the top-K items to inject. Hybrid: combine a semantic signal (vector
   * rank) with the keyword-overlap signal so a item wins if it is either
   * semantically close OR a strong lexical match. Falls back to keyword-only
   * (then recency) when there are no vector hits, preserving prior behaviour.
   */
  private selectKnowledge(
    items: Array<{ id: string; title: string; productName: string | null; content: string }>,
    vectorHits: RetrievedKnowledge[],
    query: string,
  ): Array<{ id: string; title: string; productName: string | null; content: string }> {
    // No reranking needed for a small base with no semantic signal.
    if (items.length <= KNOWLEDGE_MAX_ITEMS && vectorHits.length === 0) return items;

    const terms = this.queryTerms(query);

    // Vector rank → descending score (best hit = highest). Keyed by id.
    const vectorScore = new Map<string, number>();
    vectorHits.forEach((hit, idx) => {
      vectorScore.set(hit.id, (KNOWLEDGE_VECTOR_CANDIDATES - idx) * KNOWLEDGE_VECTOR_WEIGHT);
    });

    // Candidate pool = recency-ordered active items ∪ vector hits (some hits
    // may sit beyond KNOWLEDGE_SCAN_LIMIT and not be in `items`).
    const byId = new Map<string, { id: string; title: string; productName: string | null; content: string }>();
    items.forEach((it) => byId.set(it.id, it));
    vectorHits.forEach((h) => {
      if (!byId.has(h.id)) byId.set(h.id, h);
    });

    const recencyRank = new Map<string, number>();
    items.forEach((it, idx) => recencyRank.set(it.id, idx));

    const scored = Array.from(byId.values()).map((item) => ({
      item,
      score: (vectorScore.get(item.id) ?? 0) + this.relevanceScore(item, terms),
      // Lower is more recent; unknown (vector-only) items sort last on ties.
      recency: recencyRank.get(item.id) ?? Number.MAX_SAFE_INTEGER,
    }));

    return scored
      .sort((a, b) => b.score - a.score || a.recency - b.recency)
      .slice(0, KNOWLEDGE_MAX_ITEMS)
      .map((s) => s.item);
  }

  /** Distinct, lowercased query words long enough to be meaningful. */
  private queryTerms(query: string): string[] {
    return Array.from(
      new Set(
        (query ?? '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2),
      ),
    );
  }

  /** How many query terms appear in an item's title/product/content. */
  private relevanceScore(
    item: { title: string; productName: string | null; content: string },
    terms: string[],
  ): number {
    const hay = `${item.title} ${item.productName ?? ''} ${item.content}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += item.title.toLowerCase().includes(t) ? 2 : 1;
    }
    return score;
  }

  private customerMemory(
    customer: {
      name: string | null;
      phoneNumber: string;
      leadStage: string;
      tags: string[];
      notes: string | null;
      aiMemory: string | null;
    },
    lang = 'id',
  ): string {
    // notes (admin-written) are NOT injected — private, may contain commentary
    // not meant for the customer. aiMemory is AI-generated facts approved via
    // the Learning module and is safe to use as customer context.
    const labels = lang === 'id'
      ? { name: 'Nama', phone: 'Nomor', stage: 'Lead stage', tags: 'Tags', unknown: 'Belum diketahui', prevCtx: 'Konteks dari percakapan sebelumnya' }
      : { name: 'Name', phone: 'Number', stage: 'Lead stage', tags: 'Tags', unknown: 'Unknown', prevCtx: 'Context from previous conversations' };
    const lines = [
      `${labels.name}: ${customer.name ?? labels.unknown}`,
      `${labels.phone}: ${customer.phoneNumber}`,
      `${labels.stage}: ${customer.leadStage}`,
    ];
    if (customer.tags.length) lines.push(`${labels.tags}: ${customer.tags.join(', ')}`);
    if (customer.aiMemory?.trim()) {
      lines.push('', `${labels.prevCtx}:`, customer.aiMemory.trim());
    }
    return lines.join('\n');
  }
}
