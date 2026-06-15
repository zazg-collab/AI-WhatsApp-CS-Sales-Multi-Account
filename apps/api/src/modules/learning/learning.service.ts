import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SenderType } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderService, ChatMessage } from '../ai/ai-provider.service';
import { logAudit } from '../../common/audit.util';
import {
  CustomerMemoryPayload,
  KnowledgePayload,
  MineResult,
  PersonaPayload,
} from './learning.types';

/** AI fallback phrase (PRD §): an unanswered question the admin later handled. */
const FALLBACK_MARKER = 'konfirmasi dulu ke admin';
/** Keep prompt cost bounded — total transcript characters fed to the LLM. */
const TRANSCRIPT_CHAR_BUDGET = 14_000;
const PER_MESSAGE_CHAR_CAP = 320;
/** How many historical messages to pull per bot before trimming. */
const MAX_MESSAGES = 600;

interface Transcript {
  text: string;
  messageIds: string[];
}

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────

  /** Run every miner for a bot. Each miner is best-effort and isolated. */
  async mineAll(botId: string): Promise<MineResult> {
    const bot = await this.botOrThrow(botId);
    const result: MineResult = {
      botId,
      knowledge: 0,
      persona: 0,
      customerMemory: 0,
      playbook: 0,
      skippedDuplicates: 0,
    };

    const k = await this.mineKnowledge(botId).catch((e) => {
      this.logger.warn(`mineKnowledge failed: ${e}`);
      return { created: 0, skipped: 0 };
    });
    result.knowledge = k.created;
    result.skippedDuplicates += k.skipped;

    result.persona = (await this.minePersona(botId).catch((e) => {
      this.logger.warn(`minePersona failed: ${e}`);
      return 0;
    })) as number;

    result.playbook = (await this.minePlaybook(botId).catch((e) => {
      this.logger.warn(`minePlaybook failed: ${e}`);
      return 0;
    })) as number;

    result.customerMemory = (await this.mineCustomerMemory(botId).catch((e) => {
      this.logger.warn(`mineCustomerMemory failed: ${e}`);
      return 0;
    })) as number;

    await logAudit(this.prisma, {
      action: 'learning_mine',
      entityType: 'bot',
      entityId: botId,
      newValue: { ...result, botName: bot.botName },
    });
    return result;
  }

  // ── v1: Knowledge mining ──────────────────────────────────────────────

  /**
   * Extract recurring customer questions and the admin's real answers from
   * history → draft KnowledgeItems. Q→A pairs that follow an AI fallback are
   * the highest-value (the bot couldn't answer; a human did), so we tell the
   * model to prioritize them.
   */
  async mineKnowledge(botId: string): Promise<{ created: number; skipped: number }> {
    const transcript = await this.gatherTranscripts(botId, { preferFallback: true });
    if (!transcript.text) return { created: 0, skipped: 0 };

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Kamu menambang FAQ dari riwayat chat customer service WhatsApp.
Tugas: temukan pertanyaan pelanggan yang BERULANG beserta jawaban ASLI dari admin (baris berawalan "A:").
Prioritaskan pertanyaan yang muncul setelah bot menjawab "${FALLBACK_MARKER}" — itu pengetahuan yang belum dimiliki bot.
Aturan keras: JANGAN mengarang. Hanya gunakan informasi yang benar-benar ada di transkrip.
Balas HANYA JSON array: [{"title": string, "content": string, "category": string, "confidence": number}].
title = pertanyaan ringkas. content = jawaban faktual berdasarkan balasan admin. confidence 0-100. Maksimal 12 item, lewati yang ragu.`,
      },
      { role: 'user', content: transcript.text },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0,
      json: true,
      maxTokens: 1500,
    });
    const items = this.parseArray(raw);
    if (items.length === 0) return { created: 0, skipped: 0 };

    const existing = await this.existingKnowledgeTitles(botId);
    let created = 0;
    let skipped = 0;
    for (const it of items) {
      const title = String(it.title ?? '').trim();
      const content = String(it.content ?? '').trim();
      if (!title || !content) continue;
      if (this.isDuplicateTitle(title, existing)) {
        skipped++;
        continue;
      }
      const payload: KnowledgePayload = {
        content,
        category: it.category ? String(it.category) : 'mined',
      };
      await this.prisma.learningProposal.create({
        data: {
          botId,
          type: 'knowledge',
          title,
          payload: payload as object,
          sourceMessageIds: transcript.messageIds,
          sourceSummary: 'Ditambang dari pasangan tanya-jawab di riwayat chat.',
          confidence: this.clampConfidence(it.confidence),
        },
      });
      existing.push(this.normalizeTitle(title));
      created++;
    }
    return { created, skipped };
  }

  // ── v1: Persona synthesis ─────────────────────────────────────────────

  /**
   * Analyze how the admin actually talks (tone, greetings, signature phrases,
   * words they never use) → a draft Persona that mimics the human.
   */
  async minePersona(botId: string): Promise<number> {
    const bot = await this.botOrThrow(botId);
    const transcript = await this.gatherTranscripts(botId, { adminOnly: true });
    if (!transcript.text) return 0;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Kamu menganalisa gaya komunikasi admin dari balasan WhatsApp mereka (baris "A:").
Buat persona bot yang MENIRU gaya itu: sapaan, nada, panjang kalimat, emoji, istilah khas.
Jangan mengarang fakta produk; fokus pada GAYA bahasa saja.
Balas HANYA JSON: {"name": string, "soulMd": string, "tone": string, "style": string, "rules": string, "forbiddenWords": string[]}.
soulMd = deskripsi persona dalam Bahasa Indonesia (3-6 kalimat). forbiddenWords = kata/frasa yang admin TIDAK pernah pakai.`,
      },
      { role: 'user', content: transcript.text },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0.2,
      json: true,
      maxTokens: 800,
    });
    const obj = this.parseObject(raw);
    if (!obj || !obj.soulMd) return 0;

    const payload: PersonaPayload = {
      name: String(obj.name ?? `${bot.botName} (dari riwayat)`).slice(0, 120),
      soulMd: String(obj.soulMd),
      tone: obj.tone ? String(obj.tone) : undefined,
      style: obj.style ? String(obj.style) : undefined,
      rules: obj.rules ? String(obj.rules) : undefined,
      forbiddenWords: Array.isArray(obj.forbiddenWords)
        ? obj.forbiddenWords.map(String).slice(0, 30)
        : [],
    };

    await this.prisma.learningProposal.create({
      data: {
        botId,
        type: 'persona',
        title: payload.name,
        payload: payload as object,
        sourceMessageIds: transcript.messageIds,
        sourceSummary: 'Disintesis dari gaya bicara admin di riwayat chat.',
        confidence: 70,
      },
    });
    return 1;
  }

  // ── v2: Objection / closing playbook ──────────────────────────────────

  /**
   * Mine how the admin handles objections (price, stock, trust, "nanti dulu")
   * and what moves lead to a close → a draft knowledge item, category=playbook.
   */
  async minePlaybook(botId: string): Promise<number> {
    const transcript = await this.gatherTranscripts(botId, {});
    if (!transcript.text) return 0;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Kamu menyusun "playbook" penjualan dari riwayat chat.
Identifikasi keberatan pelanggan yang sering muncul (harga, stok, ragu, "nanti dulu") dan bagaimana admin (baris "A:") meresponsnya hingga berhasil.
Hanya berdasar transkrip nyata, jangan mengarang.
Balas HANYA JSON array: [{"title": string, "content": string, "confidence": number}].
title = nama keberatan/situasi. content = teknik/respon yang dipakai admin. Maksimal 8 item.`,
      },
      { role: 'user', content: transcript.text },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0.1,
      json: true,
      maxTokens: 1200,
    });
    const items = this.parseArray(raw);
    let created = 0;
    for (const it of items) {
      const title = String(it.title ?? '').trim();
      const content = String(it.content ?? '').trim();
      if (!title || !content) continue;
      const payload: KnowledgePayload = { content, category: 'playbook' };
      await this.prisma.learningProposal.create({
        data: {
          botId,
          type: 'playbook',
          title,
          payload: payload as object,
          sourceMessageIds: transcript.messageIds,
          sourceSummary: 'Pola penanganan keberatan dari riwayat chat.',
          confidence: this.clampConfidence(it.confidence),
        },
      });
      created++;
    }
    return created;
  }

  // ── v2: Customer memory enrichment ────────────────────────────────────

  /**
   * Per customer (recently active for this bot), extract durable facts
   * (preferences, past purchases, constraints) → a draft note update.
   */
  async mineCustomerMemory(botId: string): Promise<number> {
    const bot = await this.botOrThrow(botId);
    const accountIds = bot.accounts.map((a) => a.id);
    if (accountIds.length === 0) return 0;

    const customers = await this.prisma.customer.findMany({
      where: { sourceAccountId: { in: accountIds } },
      orderBy: { lastMessageAt: 'desc' },
      take: 25,
      select: { id: true, name: true, phoneNumber: true, notes: true },
    });

    let created = 0;
    for (const customer of customers) {
      const history = await this.prisma.message.findMany({
        where: {
          conversation: {
            customerId: customer.id,
            whatsappAccountId: { in: accountIds },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 80,
        select: { content: true, senderType: true },
      });
      const text = this.formatMessages(
        history.map((m) => ({ ...m, id: '' })),
      ).text;
      if (text.length < 80) continue; // too little to learn from

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `Ekstrak FAKTA DURABEL tentang pelanggan dari chat (preferensi, produk diminati, kendala, lokasi, anggaran).
Hanya fakta yang eksplisit disebut. Jangan mengarang atau menebak.
Balas HANYA JSON: {"facts": string[]}. Kosongkan array jika tidak ada fakta jelas. Maksimal 6 fakta singkat.`,
        },
        { role: 'user', content: text },
      ];
      const raw = await this.provider.chat(messages, {
        temperature: 0,
        json: true,
        maxTokens: 300,
      });
      const obj = this.parseObject(raw);
      const facts = Array.isArray(obj?.facts)
        ? obj.facts.map(String).filter((f: string) => f.trim().length > 0).slice(0, 6)
        : [];
      if (facts.length === 0) continue;

      const payload: CustomerMemoryPayload = { facts };
      await this.prisma.learningProposal.create({
        data: {
          botId,
          customerId: customer.id,
          type: 'customer_memory',
          title: customer.name || customer.phoneNumber,
          payload: payload as object,
          sourceSummary: 'Fakta pelanggan dari riwayat chat.',
          confidence: 65,
        },
      });
      created++;
    }
    return created;
  }

  // ── Review / approval ─────────────────────────────────────────────────

  listProposals(filter: { status?: string; type?: string; botId?: string }) {
    return this.prisma.learningProposal.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.botId ? { botId: filter.botId } : {}),
      },
      orderBy: [{ status: 'asc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
      include: {
        bot: { select: { id: true, botName: true } },
        customer: { select: { id: true, name: true, phoneNumber: true } },
      },
    });
  }

  async getProposal(id: string) {
    const p = await this.prisma.learningProposal.findUnique({
      where: { id },
      include: {
        bot: { select: { id: true, botName: true, knowledgeBaseId: true } },
        customer: { select: { id: true, name: true, phoneNumber: true } },
      },
    });
    if (!p) throw new NotFoundException('Learning proposal not found');
    return p;
  }

  /** Owner can tweak the proposed content before approving. */
  async editProposal(id: string, payload: object, title?: string) {
    const p = await this.getProposal(id);
    if (p.status !== 'pending') {
      throw new BadRequestException('Hanya proposal pending yang bisa diedit');
    }
    return this.prisma.learningProposal.update({
      where: { id },
      data: { payload, ...(title ? { title } : {}) },
    });
  }

  /** Materialize a pending proposal into the live tables. */
  async approve(id: string, userId: string) {
    const p = await this.getProposal(id);
    if (p.status !== 'pending') {
      throw new BadRequestException('Proposal sudah direview');
    }

    let resultEntityId: string | null = null;

    if (p.type === 'knowledge' || p.type === 'playbook') {
      const kbId = p.bot?.knowledgeBaseId;
      if (!kbId) {
        throw new BadRequestException(
          'Bot belum punya knowledge base — tetapkan dulu sebelum approve.',
        );
      }
      const payload = p.payload as unknown as KnowledgePayload;
      const item = await this.prisma.knowledgeItem.create({
        data: {
          knowledgeBaseId: kbId,
          title: p.title,
          content: payload.content,
          category: payload.category ?? (p.type === 'playbook' ? 'playbook' : 'mined'),
          productName: payload.productName,
          status: 'active',
        },
      });
      resultEntityId = item.id;
    } else if (p.type === 'persona') {
      const payload = p.payload as unknown as PersonaPayload;
      const persona = await this.prisma.persona.create({
        data: {
          name: payload.name,
          soulMd: payload.soulMd,
          tone: payload.tone,
          style: payload.style,
          rules: payload.rules,
          forbiddenWords: payload.forbiddenWords ?? [],
        },
      });
      // Attach the new persona to the bot so it takes effect immediately.
      if (p.botId) {
        await this.prisma.bot.update({
          where: { id: p.botId },
          data: { personaId: persona.id },
        });
      }
      resultEntityId = persona.id;
    } else if (p.type === 'customer_memory') {
      if (!p.customerId) throw new BadRequestException('Proposal tanpa customer');
      const payload = p.payload as unknown as CustomerMemoryPayload;
      const customer = await this.prisma.customer.findUnique({
        where: { id: p.customerId },
        select: { notes: true },
      });
      const header = '— Dari riwayat (AI) —';
      const block = `${header}\n${payload.facts.map((f) => `• ${f}`).join('\n')}`;
      const notes = customer?.notes ? `${customer.notes}\n\n${block}` : block;
      await this.prisma.customer.update({
        where: { id: p.customerId },
        data: { notes },
      });
      resultEntityId = p.customerId;
    }

    const updated = await this.prisma.learningProposal.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedById: userId,
        reviewedAt: new Date(),
        resultEntityId,
      },
    });
    await logAudit(this.prisma, {
      userId,
      action: 'learning_approve',
      entityType: 'learning_proposal',
      entityId: id,
      newValue: { type: p.type, resultEntityId },
    });
    return updated;
  }

  async reject(id: string, userId: string) {
    const p = await this.getProposal(id);
    if (p.status !== 'pending') {
      throw new BadRequestException('Proposal sudah direview');
    }
    const updated = await this.prisma.learningProposal.update({
      where: { id },
      data: { status: 'rejected', reviewedById: userId, reviewedAt: new Date() },
    });
    await logAudit(this.prisma, {
      userId,
      action: 'learning_reject',
      entityType: 'learning_proposal',
      entityId: id,
    });
    return updated;
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private async botOrThrow(botId: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      include: { accounts: { select: { id: true } } },
    });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  /**
   * Build a token-bounded transcript from this bot's conversations. When
   * `preferFallback` is set, conversations containing the AI fallback phrase
   * are pulled first (the highest-value learning material).
   */
  private async gatherTranscripts(
    botId: string,
    opts: { adminOnly?: boolean; preferFallback?: boolean },
  ): Promise<Transcript> {
    // Scope by the bot's WhatsApp accounts, not conversation.botId: history
    // synced from the phone before a bot existed has botId = null, so an
    // account-based scope is what actually reaches that history.
    const bot = await this.botOrThrow(botId);
    const accountIds = bot.accounts.map((a) => a.id);
    if (accountIds.length === 0) return { text: '', messageIds: [] };

    const messages = await this.prisma.message.findMany({
      where: {
        conversation: { whatsappAccountId: { in: accountIds } },
        ...(opts.adminOnly ? { senderType: SenderType.admin } : {}),
        content: { not: '' },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_MESSAGES,
      select: { id: true, content: true, senderType: true, conversationId: true },
    });
    if (messages.length === 0) return { text: '', messageIds: [] };

    // Restore chronological order for readable transcripts.
    let ordered = messages.reverse();

    if (opts.preferFallback) {
      const flagged = new Set(
        ordered
          .filter((m) => (m.content ?? '').toLowerCase().includes(FALLBACK_MARKER))
          .map((m) => m.conversationId),
      );
      if (flagged.size > 0) {
        const inFlagged = ordered.filter((m) => flagged.has(m.conversationId));
        const rest = ordered.filter((m) => !flagged.has(m.conversationId));
        ordered = [...inFlagged, ...rest];
      }
    }

    return this.formatMessages(ordered);
  }

  /** Render messages to a labelled, char-capped transcript within budget. */
  private formatMessages(
    messages: { id: string; content: string | null; senderType: SenderType }[],
  ): Transcript {
    const lines: string[] = [];
    const ids: string[] = [];
    let total = 0;
    for (const m of messages) {
      const body = (m.content ?? '').slice(0, PER_MESSAGE_CHAR_CAP).replace(/\s+/g, ' ').trim();
      if (!body) continue;
      const tag =
        m.senderType === SenderType.customer
          ? 'C'
          : m.senderType === SenderType.admin
            ? 'A'
            : m.senderType === SenderType.ai
              ? 'AI'
              : 'S';
      const line = `${tag}: ${body}`;
      if (total + line.length > TRANSCRIPT_CHAR_BUDGET) break;
      lines.push(line);
      if (m.id) ids.push(m.id);
      total += line.length + 1;
    }
    return { text: lines.join('\n'), messageIds: ids };
  }

  private async existingKnowledgeTitles(botId: string): Promise<string[]> {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { knowledgeBaseId: true },
    });
    if (!bot?.knowledgeBaseId) return [];
    const items = await this.prisma.knowledgeItem.findMany({
      where: { knowledgeBaseId: bot.knowledgeBaseId, status: 'active' },
      select: { title: true },
    });
    return items.map((i) => this.normalizeTitle(i.title));
  }

  private normalizeTitle(t: string): string {
    return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  }

  /** Cheap near-duplicate check: heavy word overlap with an existing title. */
  private isDuplicateTitle(title: string, existing: string[]): boolean {
    const norm = this.normalizeTitle(title);
    if (existing.includes(norm)) return true;
    const words = new Set(norm.split(' ').filter((w) => w.length > 3));
    if (words.size === 0) return false;
    return existing.some((e) => {
      const ewords = e.split(' ').filter((w) => w.length > 3);
      if (ewords.length === 0) return false;
      const overlap = ewords.filter((w) => words.has(w)).length;
      return overlap / Math.max(words.size, ewords.length) >= 0.7;
    });
  }

  private clampConfidence(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private parseArray(raw: string): Array<Record<string, unknown>> {
    try {
      const json = JSON.parse(this.extractJson(raw, '['));
      return Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
    } catch (err) {
      this.logger.warn(`Failed to parse array: ${err}`);
      return [];
    }
  }

  private parseObject(raw: string): Record<string, any> | null {
    try {
      return JSON.parse(this.extractJson(raw, '{'));
    } catch (err) {
      this.logger.warn(`Failed to parse object: ${err}`);
      return null;
    }
  }

  /** Tolerate models that wrap JSON in prose or code fences. */
  private extractJson(raw: string, open: '{' | '[' = '{'): string {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    const close = open === '{' ? '}' : ']';
    const start = raw.indexOf(open);
    const end = raw.lastIndexOf(close);
    if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
    return raw;
  }
}
