import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { parseJsonArray, parseJsonObject } from './learning.util';

const FALLBACK_MARKER = 'konfirmasi dulu ke admin';
const TRANSCRIPT_CHAR_BUDGET = 14_000;
const PER_MESSAGE_CHAR_CAP = 320;
const MAX_MESSAGES = 600;
const CUSTOMER_MEMORY_LIMIT = 25;
const CUSTOMER_MEMORY_BATCH = 5;
const CUSTOMER_TRANSCRIPT_CAP = 1500;
const MINE_CONCURRENCY = 3;

interface Transcript {
  text: string;
  messageIds: string[];
}

@Injectable()
export class LearningMinerService {
  private readonly logger = new Logger(LearningMinerService.name);
  private readonly miningModel?: string;
  private readonly jsonStrict: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    config: ConfigService,
  ) {
    this.miningModel = config.get<string>('AI_MINING_MODEL') || undefined;
    this.jsonStrict = config.get<string>('AI_JSON_STRICT') === 'true';
  }

  private maxTokens(lenient: number, strict: number): number {
    return this.jsonStrict ? strict : lenient;
  }

  async mineAll(botId: string): Promise<MineResult> {
    const bot = await this.botOrThrow(botId);
    const result: MineResult = { botId, knowledge: 0, persona: 0, customerMemory: 0, playbook: 0, skippedDuplicates: 0 };

    const accountIds = bot.accounts.map((a) => a.id);
    if (bot.lastMinedAt && accountIds.length > 0) {
      const newer = await this.prisma.message.count({
        where: { conversation: { whatsappAccountId: { in: accountIds } }, createdAt: { gt: bot.lastMinedAt } },
      });
      if (newer === 0) {
        this.logger.log(`mineAll: no new messages since ${bot.lastMinedAt.toISOString()} — skipping`);
        return result;
      }
    }

    const k = await this.mineKnowledge(botId).catch((e) => { this.logger.warn(`mineKnowledge failed: ${e}`); return { created: 0, skipped: 0 }; });
    result.knowledge = k.created;
    result.skippedDuplicates += k.skipped;

    result.persona = (await this.minePersona(botId).catch((e) => { this.logger.warn(`minePersona failed: ${e}`); return 0; })) as number;
    result.playbook = (await this.minePlaybook(botId).catch((e) => { this.logger.warn(`minePlaybook failed: ${e}`); return 0; })) as number;
    result.customerMemory = (await this.mineCustomerMemory(botId).catch((e) => { this.logger.warn(`mineCustomerMemory failed: ${e}`); return 0; })) as number;

    await this.prisma.bot.update({ where: { id: botId }, data: { lastMinedAt: new Date() } });
    await logAudit(this.prisma, { action: 'learning_mine', entityType: 'bot', entityId: botId, newValue: { ...result, botName: bot.botName } });
    return result;
  }

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

    const raw = await this.provider.chat(messages, { model: this.miningModel, temperature: 0, json: true, maxTokens: this.maxTokens(4000, 1500) });
    const items = this.parseArray(raw);
    if (items.length === 0) return { created: 0, skipped: 0 };

    const existing = await this.existingKnowledgeTitles(botId);
    let created = 0, skipped = 0;
    for (const it of items) {
      const title = String(it.title ?? '').trim();
      const content = String(it.content ?? '').trim();
      if (!title || !content) continue;
      if (this.isDuplicateTitle(title, existing)) { skipped++; continue; }
      const payload: KnowledgePayload = { content, category: it.category ? String(it.category) : 'mined' };
      await this.prisma.learningProposal.create({
        data: { botId, type: 'knowledge', title, payload: payload as object, sourceMessageIds: transcript.messageIds, sourceSummary: 'Ditambang dari pasangan tanya-jawab di riwayat chat.', confidence: this.clampConfidence(it.confidence) },
      });
      existing.push(this.normalizeTitle(title));
      created++;
    }
    return { created, skipped };
  }

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

    const raw = await this.provider.chat(messages, { model: this.miningModel, temperature: 0.2, json: true, maxTokens: this.maxTokens(2500, 800) });
    const obj = this.parseObject(raw);
    if (!obj || !obj.soulMd) return 0;

    const payload: PersonaPayload = {
      name: String(obj.name ?? `${bot.botName} (dari riwayat)`).slice(0, 120),
      soulMd: String(obj.soulMd),
      tone: obj.tone ? String(obj.tone) : undefined,
      style: obj.style ? String(obj.style) : undefined,
      rules: obj.rules ? String(obj.rules) : undefined,
      forbiddenWords: Array.isArray(obj.forbiddenWords) ? obj.forbiddenWords.map(String).slice(0, 30) : [],
    };

    await this.prisma.learningProposal.create({
      data: { botId, type: 'persona', title: payload.name, payload: payload as object, sourceMessageIds: transcript.messageIds, sourceSummary: 'Disintesis dari gaya bicara admin di riwayat chat.', confidence: 70 },
    });
    return 1;
  }

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

    const raw = await this.provider.chat(messages, { model: this.miningModel, temperature: 0.1, json: true, maxTokens: this.maxTokens(3500, 1200) });
    const items = this.parseArray(raw);
    let created = 0;
    for (const it of items) {
      const title = String(it.title ?? '').trim();
      const content = String(it.content ?? '').trim();
      if (!title || !content) continue;
      const payload: KnowledgePayload = { content, category: 'playbook' };
      await this.prisma.learningProposal.create({
        data: { botId, type: 'playbook', title, payload: payload as object, sourceMessageIds: transcript.messageIds, sourceSummary: 'Pola penanganan keberatan dari riwayat chat.', confidence: this.clampConfidence(it.confidence) },
      });
      created++;
    }
    return created;
  }

  async mineCustomerMemory(botId: string, limit = CUSTOMER_MEMORY_LIMIT): Promise<number> {
    const bot = await this.botOrThrow(botId);
    const accountIds = bot.accounts.map((a) => a.id);
    if (accountIds.length === 0) return 0;

    const alreadyProposed = await this.prisma.learningProposal.findMany({ where: { botId, type: 'customer_memory', status: 'pending' }, select: { customerId: true } });
    const skip = new Set(alreadyProposed.map((p) => p.customerId));

    const candidates = (await this.prisma.customer.findMany({
      where: { sourceAccountId: { in: accountIds } },
      orderBy: { lastMessageAt: 'desc' },
      take: limit + skip.size,
      select: { id: true, name: true, phoneNumber: true },
    })).filter((c) => !skip.has(c.id)).slice(0, limit);
    if (candidates.length === 0) return 0;

    const withText: Array<{ id: string; name: string | null; phoneNumber: string; text: string }> = [];
    for (const c of candidates) {
      const history = await this.prisma.message.findMany({
        where: { conversation: { customerId: c.id, whatsappAccountId: { in: accountIds } } },
        orderBy: { createdAt: 'asc' },
        take: 60,
        select: { content: true, senderType: true },
      });
      const text = this.formatMessages(history.map((m) => ({ ...m, id: '' })), CUSTOMER_TRANSCRIPT_CAP).text;
      if (text.length >= 80) withText.push({ ...c, text });
    }
    if (withText.length === 0) return 0;

    const batches: (typeof withText)[] = [];
    for (let i = 0; i < withText.length; i += CUSTOMER_MEMORY_BATCH) batches.push(withText.slice(i, i + CUSTOMER_MEMORY_BATCH));

    let created = 0;
    for (let i = 0; i < batches.length; i += MINE_CONCURRENCY) {
      const results = await Promise.all(
        batches.slice(i, i + MINE_CONCURRENCY).map((b) => this.mineCustomerBatch(botId, b).catch((err) => { this.logger.warn(`Customer memory batch failed: ${err}`); return 0; })),
      );
      created += results.reduce((a, b) => a + b, 0);
    }
    return created;
  }

  private async mineCustomerBatch(botId: string, batch: Array<{ id: string; name: string | null; phoneNumber: string; text: string }>): Promise<number> {
    const block = batch.map((c, idx) => `=== PELANGGAN #${idx} ===\n${c.text}`).join('\n\n');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Ekstrak FAKTA DURABEL tiap pelanggan dari chat-nya (preferensi, produk diminati, kendala, lokasi, anggaran).
JANGAN campur fakta antar pelanggan — pakai index "#N" yang diberikan. Hanya fakta yang eksplisit disebut. Jangan mengarang.
Balas HANYA JSON: {"results":[{"index":number,"facts":string[]}]}. Lewati pelanggan tanpa fakta jelas. Maksimal 6 fakta/pelanggan.`,
      },
      { role: 'user', content: block },
    ];
    const raw = await this.provider.chat(messages, { model: this.miningModel, temperature: 0, json: true, maxTokens: this.maxTokens(2000, 1000) });
    const obj = this.parseObject(raw);
    const results = Array.isArray(obj?.results) ? obj.results : [];

    let created = 0;
    for (const r of results) {
      const idx = Number(r?.index);
      const cust = batch[idx];
      const facts = Array.isArray(r?.facts) ? r.facts.map(String).filter((f: string) => f.trim().length > 0).slice(0, 6) : [];
      if (!cust || facts.length === 0) continue;
      const payload: CustomerMemoryPayload = { facts };
      await this.prisma.learningProposal.create({
        data: { botId, customerId: cust.id, type: 'customer_memory', title: cust.name || cust.phoneNumber, payload: payload as object, sourceSummary: 'Fakta pelanggan dari riwayat chat.', confidence: 65 },
      });
      created++;
    }
    return created;
  }

  async suggestBot(conversationId: string): Promise<{
    botId: string; botName: string; personaName: string | null; reason: string; currentBotId: string | null;
  } | null> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, botId: true } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const bots = await this.prisma.bot.findMany({
      where: { status: 'active' },
      select: { id: true, botName: true, persona: { select: { name: true, soulMd: true, tone: true, style: true } } },
    });
    if (bots.length < 2) return null;

    const customerLines = (await this.prisma.message.findMany({
      where: { conversationId, senderType: SenderType.customer, content: { not: '' } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { content: true },
    })).reverse().map((m) => `- ${(m.content ?? '').slice(0, 200)}`).join('\n');
    if (!customerLines) return null;

    const botList = bots.map((b, i) => {
      const p = b.persona;
      const desc = p ? `${p.name ?? ''} — ${(p.soulMd ?? '').slice(0, 160)}${p.tone ? ` (nada: ${p.tone})` : ''}${p.style ? ` (gaya: ${p.style})` : ''}` : '(tanpa persona)';
      return `${i + 1}. id=${b.id} | ${b.botName}: ${desc}`;
    }).join('\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Kamu memilih persona bot yang PALING COCOK dengan karakter pelanggan agar rapport & konversi maksimal.
Pertimbangkan nada, formalitas, dan kebutuhan pelanggan dari pesannya.
Pilih HANYA dari daftar id yang diberikan. Jangan mengarang id.
Balas HANYA JSON: {"botId": string, "reason": string}. reason singkat Bahasa Indonesia.`,
      },
      { role: 'user', content: `Pesan pelanggan:\n${customerLines}\n\nKandidat bot:\n${botList}\n\nPilih satu sebagai JSON.` },
    ];

    const raw = await this.provider.chat(messages, { model: this.miningModel, temperature: 0, json: true, maxTokens: this.maxTokens(600, 400) });
    const obj = this.parseObject(raw);
    const chosen = bots.find((b) => b.id === String(obj?.botId));
    if (!chosen) return null;

    return { botId: chosen.id, botName: chosen.botName, personaName: chosen.persona?.name ?? null, reason: typeof obj?.reason === 'string' ? obj.reason : '', currentBotId: conversation.botId };
  }

  // ── Internals ─────────────────────────────────────────────────────────

  async botOrThrow(botId: string) {
    const bot = await this.prisma.bot.findUnique({ where: { id: botId }, include: { accounts: { select: { id: true } } } });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  private async gatherTranscripts(botId: string, opts: { adminOnly?: boolean; preferFallback?: boolean }): Promise<Transcript> {
    const bot = await this.botOrThrow(botId);
    const accountIds = bot.accounts.map((a) => a.id);
    if (accountIds.length === 0) return { text: '', messageIds: [] };

    const messages = await this.prisma.message.findMany({
      where: { conversation: { whatsappAccountId: { in: accountIds } }, ...(opts.adminOnly ? { senderType: SenderType.admin } : {}), content: { not: '' } },
      orderBy: { createdAt: 'desc' },
      take: MAX_MESSAGES,
      select: { id: true, content: true, senderType: true, conversationId: true },
    });
    if (messages.length === 0) return { text: '', messageIds: [] };

    let ordered = messages.reverse();
    if (opts.preferFallback) {
      const flagged = new Set(ordered.filter((m) => (m.content ?? '').toLowerCase().includes(FALLBACK_MARKER)).map((m) => m.conversationId));
      if (flagged.size > 0) {
        const inFlagged = ordered.filter((m) => flagged.has(m.conversationId));
        const rest = ordered.filter((m) => !flagged.has(m.conversationId));
        ordered = [...inFlagged, ...rest];
      }
    }
    return this.formatMessages(ordered);
  }

  private formatMessages(messages: { id: string; content: string | null; senderType: SenderType }[], budget = TRANSCRIPT_CHAR_BUDGET): Transcript {
    const lines: string[] = [];
    const ids: string[] = [];
    let total = 0;
    for (const m of messages) {
      const body = (m.content ?? '').slice(0, PER_MESSAGE_CHAR_CAP).replace(/\s+/g, ' ').trim();
      if (!body) continue;
      const tag = m.senderType === SenderType.customer ? 'C' : m.senderType === SenderType.admin ? 'A' : m.senderType === SenderType.ai ? 'AI' : 'S';
      const line = `${tag}: ${body}`;
      if (total + line.length > budget) break;
      lines.push(line);
      if (m.id) ids.push(m.id);
      total += line.length + 1;
    }
    return { text: lines.join('\n'), messageIds: ids };
  }

  private async existingKnowledgeTitles(botId: string): Promise<string[]> {
    const bot = await this.prisma.bot.findUnique({ where: { id: botId }, select: { knowledgeBaseId: true } });
    if (!bot?.knowledgeBaseId) return [];
    const items = await this.prisma.knowledgeItem.findMany({ where: { knowledgeBaseId: bot.knowledgeBaseId, status: 'active' }, select: { title: true } });
    return items.map((i) => this.normalizeTitle(i.title));
  }

  private normalizeTitle(t: string): string {
    return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  }

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
    let n = Number(v);
    if (!Number.isFinite(n)) return 50;
    if (n > 0 && n <= 1) n = n * 100;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private parseArray(raw: string): Array<Record<string, unknown>> {
    try { return parseJsonArray(raw); }
    catch (err) { this.logger.warn(`Failed to parse array: ${err} | raw: ${this.snippet(raw)}`); return []; }
  }

  private parseObject(raw: string): Record<string, any> | null {
    try { return parseJsonObject(raw); }
    catch (err) { this.logger.warn(`Failed to parse object: ${err} | raw: ${this.snippet(raw)}`); return null; }
  }

  private snippet(raw: string): string {
    return (raw ?? '').replace(/\s+/g, ' ').slice(0, 240);
  }
}
