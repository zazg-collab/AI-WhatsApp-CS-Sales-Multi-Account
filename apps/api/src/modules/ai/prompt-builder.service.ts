import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { SenderType, MessageStatus } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatMessage } from './ai-provider.service';
import { ProductsService } from '../products/products.service';
import { KnowledgeIndexService, RetrievedKnowledge } from './knowledge-index.service';
import { ShippingService } from '../shipping/shipping.service'; // >>> ANGGA <<<
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
  // >>> ANGGA
  PERSONA_TONE_LABEL,
  PERSONA_STYLE_LABEL,
  PERSONA_RULES_LABEL,
  PERSONA_FORBIDDEN_LABEL,
  // <<< ANGGA
  PRODUCT_AVAILABLE,
  PRODUCT_OUT_OF_STOCK,
  PRODUCT_STOCK_INTRO,
  PRODUCT_STOCK_PRICE_DEFER_TO_MONEY_GATE,
  PRODUCT_PRICE_USE_TOKEN,
  GLOBAL_TOKENS_INTRO, // >>> ANGGA — addendum v2 M2 <<<
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
    // >>> ANGGA: opsional supaya seluruh spec lama yang membangun service ini
    // dengan 3 argumen tetap jalan tanpa diubah.
    @Optional() private readonly shipping?: ShippingService,
    // <<< ANGGA
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
        // >>> ANGGA — koreksi 2026-08-06 (insiden "{{subtotal_barang}}" berulang
        // walau sudah diganti model, TERBUKTI DARI KODE): draft yang DITAHAN
        // gerbang uang (status pending) atau KEDALUWARSA (status failed, lihat
        // `expireStaleDrafts`) sebelumnya TETAP masuk riwayat yang dikirim ke
        // LLM apa adanya — termasuk teks "{{token_tak_dikenal}}" mentahnya.
        // Model lalu MENIRU pola dari "balasannya sendiri" di riwayat itu di
        // giliran berikutnya, bikin bug yang sama terlihat "berulang terus"
        // walau kodenya sudah benar dan modelnya sudah diganti (racunnya ada
        // di data percakapan, bukan di kode/model). Balasan kami sendiri yang
        // BELUM/GAGAL terkirim (pending/failed) dibuang dari riwayat; pesan
        // pelanggan tidak pernah disaring oleh status ini.
        messages: {
          where: {
            OR: [
              { senderType: SenderType.customer },
              { status: { notIn: [MessageStatus.pending, MessageStatus.failed] } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: historyLimit,
        },
        // <<< ANGGA
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    // >>> ANGGA — koreksi 2026-08-05 (insiden pertanyaan tujuan keluar
    // BAHASA INGGRIS verbatim): fallback bahasa di sini dulu 'en' sementara
    // ekstraktor & Sentinel jatuh ke 'id' — percakapan dengan bot berbahasa
    // 'en' (default lama bots.service saat create) menerima SELURUH grounding
    // versi Inggris, dan instruksi "pakai pola PERSIS" membuat kalimatnya
    // bocor mentah ke pelanggan. Disamakan ke 'id' (toko Indonesia).
    const lang = conversation.bot?.language ?? 'id';
    // <<< ANGGA

    const soul =
      conversation.bot?.persona?.soulMd ??
      t(BOT_PERSONA_FALLBACK, lang);

    // >>> ANGGA: tone/style/rules/forbiddenWords ikut masuk prompt. Upstream
    // menyimpannya tapi tidak pernah membacanya, jadi form UI & hasil mining
    // Learning selama ini tidak berefek apa pun. Tetap di dalam blok bersama
    // (per-bot konstan) supaya prompt caching provider tidak rusak.
    const persona = conversation.bot?.persona;
    const personaDetail: string[] = [];
    if (persona?.tone?.trim()) {
      personaDetail.push(`${t(PERSONA_TONE_LABEL, lang)} ${persona.tone.trim()}`);
    }
    if (persona?.style?.trim()) {
      personaDetail.push(`${t(PERSONA_STYLE_LABEL, lang)} ${persona.style.trim()}`);
    }
    if (persona?.rules?.trim()) {
      personaDetail.push(t(PERSONA_RULES_LABEL, lang), persona.rules.trim());
    }
    const forbidden = (persona?.forbiddenWords ?? [])
      .map((w) => String(w).trim())
      .filter(Boolean);
    if (forbidden.length) {
      personaDetail.push(`${t(PERSONA_FORBIDDEN_LABEL, lang)} ${forbidden.join(', ')}`);
    }
    // <<< ANGGA

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
    // >>> ANGGA: ongkir live dihitung PARALEL dengan pencarian produk (Langkah 2
    // LAMPIRAN: "jalan paralel dengan alur balasan utama"), bukan berurutan,
    // supaya tidak menambah latensi balasan. Gagal apa pun -> string kosong,
    // yang berarti tidak ada apa-apa yang disuntik soal ongkir.
    const [products, shippingGrounding, globalTokenNames] = await Promise.all([
      query ? this.products.relevantForQuery(query) : Promise.resolve([]),
      this.shipping
        ? this.shipping.getGroundingText(conversationId, lang).catch(() => '')
        : Promise.resolve(''),
      // >>> ANGGA — addendum v2 M2: nama penanda global (kamus AppSetting +
      // catatan_sk). Konstan per-bot → ikut blok system bersama yang cacheable.
      // Optional-call: spec lama yang mock shipping tanpa method ini tetap jalan.
      this.shipping?.globalTokenCatalog?.().catch(() => [] as string[]) ?? Promise.resolve([] as string[]),
      // <<< ANGGA
    ]);
    // <<< ANGGA
    const botLocale = localeFor(lang);
    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, audit gerbang uang #1):
    // kalau order berongkir sedang aktif (`shippingGrounding` tidak kosong —
    // artinya `{{harga_satuan}}`/`{{subtotal_barang}}` dkk sungguhan
    // tersedia), tempelkan aturan precedence di blok INI (bukan cuma di
    // `SHIPPING_MONEY_RULE` yang posisinya belakangan & kalah pengaruh) —
    // lihat komentar di `PRODUCT_STOCK_PRICE_DEFER_TO_MONEY_GATE`.
    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, insiden "{{139000}}"
    // ronde 2): kalau BELUM ada order berongkir aktif, harga produk juga
    // TIDAK BOLEH lagi disuntik sebagai angka mentah — model tidak pernah
    // dikasih instruksi gerbang uang apa pun untuk giliran ini (lihat
    // `PRODUCT_PRICE_USE_TOKEN`), jadi ia dulu membungkus angka mentahnya
    // sendiri jadi penanda palsu (mis. `{{139000}}`). Sekarang setiap produk
    // berharga dapat penanda `{{harga_produk_x}}` (huruf, BUKAN angka — nama
    // penanda cuma boleh `[a-z_]+`, lihat `resolvePriceTokens`), nilainya
    // dicache lewat `cacheProductPriceTokens` supaya `resolvePriceTokens`
    // bisa mengisinya sesudah model menjawab. Order berongkir aktif TIDAK
    // disentuh sama sekali (precedence #1 di atas tetap seperti semula).
    const productPriceTokens: Record<string, string> = {};
    let productPriceTokenIndex = 0;
    const productBlock = products.length
      ? [
          t(PRODUCT_STOCK_INTRO, lang),
          ...(shippingGrounding ? [t(PRODUCT_STOCK_PRICE_DEFER_TO_MONEY_GATE, lang)] : []),
          ...(!shippingGrounding && products.some((p) => p.price != null)
            ? [t(PRODUCT_PRICE_USE_TOKEN, lang)]
            : []),
          ...products.map((p) => {
            let price = '';
            if (p.price != null) {
              if (shippingGrounding) {
                price = ` — ${formatProductPrice(p.price, p.currency, botLocale)}`;
              } else {
                const tokenName = `harga_produk_${String.fromCharCode(97 + productPriceTokenIndex)}`;
                productPriceTokenIndex += 1;
                productPriceTokens[tokenName] = formatProductPrice(p.price, p.currency, botLocale);
                price = ` — {{${tokenName}}}`;
              }
            }
            const stockLabel = p.stock > 0
              ? `${t(PRODUCT_AVAILABLE, lang)} (${p.stock}${p.unit ? ` ${p.unit}` : ''})`
              : t(PRODUCT_OUT_OF_STOCK, lang);
            return `• ${p.name}${p.category ? ` (${p.category})` : ''}${price} — ${stockLabel}`;
          }),
        ].join('\n')
      : null;
    if (Object.keys(productPriceTokens).length && this.shipping) {
      this.shipping.cacheProductPriceTokens(conversationId, productPriceTokens);
    }
    // <<< ANGGA

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
      ...(personaDetail.length ? personaDetail : []), // >>> ANGGA <<<
      '',
      t(KNOWLEDGE_SECTION_LABEL, lang),
      // Knowledge is retrieved from items that may echo customer-supplied text;
      // fence it so adversarial wording inside an item cannot act as an
      // instruction. The empty note is plain (nothing to fence).
      knowledge ? fenceData(knowledge, lang) : t(KNOWLEDGE_EMPTY_NOTE, lang),
      '',
      t(BASE_RULES, lang),
      // >>> ANGGA — addendum v2 M2: penanda global (nama saja, nilai ditempel
      // sistem sesudah model menjawab — lihat resolvePriceTokens).
      ...(globalTokenNames.length
        ? ['', t(GLOBAL_TOKENS_INTRO, lang)(globalTokenNames.map((n) => `{{${n}}}`).join(', '))]
        : []),
      // <<< ANGGA
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
      // >>> ANGGA: data ongkir sengaja jadi pesan system TERSENDIRI, bukan
      // digabung ke `sharedSystem`. Alasannya sama seperti blok customer:
      // isinya berbeda per percakapan, jadi menggabungkannya akan merusak
      // prefix yang bisa di-cache provider. Hanya angka akhir yang sudah
      // dibulatkan yang ada di dalamnya (Langkah 10 LAMPIRAN).
      ...(shippingGrounding ? [{ role: 'system' as const, content: shippingGrounding }] : []),
      // <<< ANGGA
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

    // >>> ANGGA — bobot kata: yang UMUM hampir tidak berarti apa-apa.
    //
    // Insiden 2026-08-03: pelanggan tanya "1 aja, kirim ke purworejo berapa
    // ya?" dan bot membacakan seluruh SOP pengiriman & COD padahal belum ada
    // yang dipesan. Pemicunya kata "kirim" — ia cocok ke butir SOP itu dan
    // ikut menang, lalu memakan satu dari 12 slot yang tersedia.
    //
    // Akar masalahnya: dulu SETIAP kata dihitung sama. Padahal "kirim",
    // "harga", "kak" muncul di hampir semua butir — mereka tidak membedakan
    // apa pun. Yang membedakan justru kata langka seperti "betekok".
    //
    // Jadi tiap kata sekarang dibobot terbalik terhadap seberapa sering ia
    // muncul di seluruh kandidat: ada di semua butir → bobot ~0; cuma di satu
    // butir → bobot ~1. Tidak ada daftar kata terlarang yang perlu ditulis
    // atau dirawat — bobotnya ikut menyesuaikan sendiri ke isi knowledge base
    // Bossfren, termasuk waktu butirnya bertambah.
    const kandidat = Array.from(byId.values());
    const bobot = this.termWeights(kandidat, terms);

    const scored = kandidat.map((item) => ({
      item,
      score: (vectorScore.get(item.id) ?? 0) + this.relevanceScore(item, terms, bobot),
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

  /**
   * >>> ANGGA — bobot tiap kata kunci, dihitung dari kandidat yang ada.
   *
   * Rumusnya IDF yang dinormalkan ke rentang 0..1:
   *   ada di SEMUA butir  → ~0   (tidak membedakan apa pun)
   *   ada di SATU butir    → ~1   (sangat membedakan)
   *
   * Dinormalkan (bukan IDF mentah) supaya skala skor kata kunci tetap 0..2
   * seperti sebelumnya — kalau tidak, keseimbangannya dengan sinyal vektor
   * (`KNOWLEDGE_VECTOR_WEIGHT`) ikut bergeser diam-diam.
   */
  private termWeights(
    items: Array<{ title: string; productName: string | null; content: string }>,
    terms: string[],
  ): Map<string, number> {
    const out = new Map<string, number>();
    const n = items.length;
    if (n === 0) return out;
    const hays = items.map((i) =>
      `${i.title} ${i.productName ?? ''} ${i.content}`.toLowerCase(),
    );
    const pembagi = Math.log(n + 1) || 1;
    for (const t of terms) {
      const df = hays.reduce((sum, h) => sum + (h.includes(t) ? 1 : 0), 0);
      out.set(t, Math.log((n + 1) / (df + 1)) / pembagi);
    }
    return out;
  }

  /** Seberapa cocok satu butir dengan kata kunci, sesudah tiap kata dibobot. */
  private relevanceScore(
    item: { title: string; productName: string | null; content: string },
    terms: string[],
    bobot?: Map<string, number>,
  ): number {
    const hay = `${item.title} ${item.productName ?? ''} ${item.content}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (!hay.includes(t)) continue;
      const w = bobot ? (bobot.get(t) ?? 0) : 1;
      score += (item.title.toLowerCase().includes(t) ? 2 : 1) * w;
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
