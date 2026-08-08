/**
 * Chat Session Manager
 */
import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService, ChatMessage } from '../modules/ai/ai-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../modules/products/products.service';
import { KnowledgeIndexService } from '../modules/ai/knowledge-index.service';
import { ShippingService } from '../modules/shipping/shipping.service';
import { 
  t, BOT_IDENTITY, BOT_PERSONA_FALLBACK, PERSONA_SECTION_LABEL, 
  PERSONA_TONE_LABEL, PERSONA_STYLE_LABEL, PERSONA_RULES_LABEL, 
  PERSONA_FORBIDDEN_LABEL, KNOWLEDGE_SECTION_LABEL, KNOWLEDGE_EMPTY_NOTE,
  BASE_RULES, PRODUCT_STOCK_INTRO, PRODUCT_AVAILABLE, PRODUCT_OUT_OF_STOCK,
  MEDIA_SECTION_LABEL, MEDIA_EMPTY_NOTE, fenceData,
  PRODUCT_STOCK_PRICE_DEFER_TO_MONEY_GATE, PRODUCT_PRICE_USE_TOKEN
} from '../i18n/bot-prompts';

@Injectable()
export class ChatSessionManager {
  private readonly logger = new Logger(ChatSessionManager.name);

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly knowledge: KnowledgeIndexService,
    private readonly shipping: ShippingService,
  ) {}

  private async buildRealisticSystemPrompt(userText: string, ragMode: 'hybrid' | 'agentic' = 'hybrid'): Promise<string> {
    const bot = await this.prisma.bot.findFirst({
      include: { persona: true },
      orderBy: { createdAt: 'desc' }
    });
    
    const lang = bot?.language ?? 'id';
    const soul = bot?.persona?.soulMd ?? t(BOT_PERSONA_FALLBACK, lang);

    const personaDetail: string[] = [];
    if (bot?.persona?.tone?.trim()) {
      personaDetail.push(`${t(PERSONA_TONE_LABEL, lang)} ${bot.persona.tone.trim()}`);
    }
    if (bot?.persona?.style?.trim()) {
      personaDetail.push(`${t(PERSONA_STYLE_LABEL, lang)} ${bot.persona.style.trim()}`);
    }
    if (bot?.persona?.rules?.trim()) {
      personaDetail.push(t(PERSONA_RULES_LABEL, lang), bot.persona.rules.trim());
    }
    const forbidden = (bot?.persona?.forbiddenWords ?? []).map(w => String(w).trim()).filter(Boolean);
    if (forbidden.length) {
      personaDetail.push(`${t(PERSONA_FORBIDDEN_LABEL, lang)} ${forbidden.join(', ')}`);
    }

    const kbId = bot?.knowledgeBaseId ?? null;
    let knowledgeText = '';
    if (kbId && ragMode === 'hybrid') {
      const results = await this.knowledge.search(kbId, userText, 3);
      if (results.length > 0) {
        knowledgeText = results.map(r => r.content).join('\n\n');
      }
    }

    const productList = await this.products.relevantForQuery(userText);
    let productBlock = null;
    if (productList.length > 0) {
      productBlock = [
        t(PRODUCT_STOCK_INTRO, lang),
        ...productList.map((p) => {
          let priceStr = p.price != null ? ` — Rp${p.price.toLocaleString('id-ID')}` : '';
          const stockLabel = p.stock > 0 ? `${t(PRODUCT_AVAILABLE, lang)} (${p.stock})` : t(PRODUCT_OUT_OF_STOCK, lang);
          return `• ${p.name}${p.category ? ` (${p.category})` : ''}${priceStr} — ${stockLabel}`;
        })
      ].join('\n');
    }

    const sharedSystem = [
      t(BOT_IDENTITY, lang),
      '',
      t(PERSONA_SECTION_LABEL, lang),
      soul,
      ...(personaDetail.length ? personaDetail : []),
      '',
      t(KNOWLEDGE_SECTION_LABEL, lang),
      knowledgeText ? fenceData(knowledgeText, lang) : t(KNOWLEDGE_EMPTY_NOTE, lang),
      '',
      t(BASE_RULES, lang),
      t(PRODUCT_PRICE_USE_TOKEN, lang),
      t(PRODUCT_STOCK_PRICE_DEFER_TO_MONEY_GATE, lang),
      ...(productBlock ? ['', productBlock] : []),
      '',
      t(MEDIA_SECTION_LABEL, lang),
      t(MEDIA_EMPTY_NOTE, lang),
      '',
      `Ini adalah mode TEST HARNESS. Anggap userText adalah input pelanggan asli. Jangan sebut kamu sedang dalam mode simulasi. Jawab sesuai persona dan aturan.`,
      `ATURAN PENTING PENCARIAN ONGKIR:`,
      `1. Jika hasil 'search_destinations' KOSONG, minta maaf dan tanyakan nama kecamatan dan kabupatennya dengan lebih spesifik.`,
      `2. Jika hasil 'search_destinations' LEBIH DARI SATU (banyak opsi), JANGAN asal tebak. Sebutkan secara natural ada beberapa pilihan, dan minta pelanggan untuk menegaskan nama kecamatan/kabupaten yang benar.`,
      `3. JANGAN PERNAH menyebutkan istilah teknis (seperti destination_id atau array json) kepada pelanggan.`,
      `4. SANGAT PENTING: SETELAH kamu memanggil tool apapun dan menerima hasilnya, kamu WAJIB menuliskan kalimat balasan (text response) untuk pelanggan berdasarkan hasil tool tersebut. JANGAN PERNAH mengembalikan respons kosong (empty string)!`
    ].join('\n');

    return sharedSystem;
  }

  async sendMessage(
    sessionId: string,
    userText: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    provider = 'mock',
    model?: string,
  ): Promise<{ replyText: string; model: string; executedTools?: any[] }> {
    if (provider === 'mock') {
      return this.mockGenerateReply(userText, history);
    }
    return this.realGenerateReply(userText, history, model);
  }

  private async realGenerateReply(
    userText: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    model?: string,
  ): Promise<{ replyText: string; model: string; executedTools?: any[] }> {
    const resolvedModel = model ?? (await this.aiProvider.defaultModel());
    
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'ai' } });
    const aiConfig = setting?.value as any;
    const ragMode = aiConfig?.ragMode || 'hybrid';
    
    const systemPrompt = await this.buildRealisticSystemPrompt(userText, ragMode);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({
        role: h.role as 'user' | 'assistant' | 'system',
        content: h.content,
      })),
      { role: 'user', content: userText },
    ];

    const bot = await this.prisma.bot.findFirst({ orderBy: { createdAt: 'desc' } });
    const kbId = bot?.knowledgeBaseId ?? null;

    let tools: any[] | undefined = [
      {
        type: 'function',
        function: {
          name: 'search_destinations',
          description: 'WAJIB DIPANGGIL KETIKA pelanggan menanyakan ongkos kirim. Gunakan ini untuk memvalidasi kecamatan/kota tujuan pengiriman di sistem logistik sebelum menghitung ongkos kirim. Jangan pernah menebak/mengira-ngira ongkos kirim tanpa memanggil tool ini terlebih dahulu.',
          parameters: {
            type: 'object',
            properties: {
              keyword: { type: 'string', description: 'Masukkan GABUNGAN nama Kecamatan dan Kota/Kabupaten yang disebut pelanggan untuk pencarian terbaik. Contoh: "Sandubaya Mataram" atau "Cibinong Bogor".' },
              province: { type: 'string', description: 'Nama provinsi jika pelanggan menyebutkannya spesifik, jika tidak biarkan kosong.' }
            },
            required: ['keyword']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'calculate_shipping',
          description: 'WAJIB dipanggil SETELAH berhasil mendapatkan hasil dari search_destinations. Gunakan tool ini untuk menghitung ongkos kirim. Masukkan data dari search_destinations ke dalam parameter yang diminta. JANGAN PERNAH MENGHITUNG ONGKIR SENDIRI tanpa tool ini.',
          parameters: {
            type: 'object',
            properties: {
              destination_id: { type: 'string', description: 'ID lokasi dari hasil search_destinations' },
              city: { type: 'string', description: 'Nama kota dari hasil search_destinations' },
              province: { type: 'string', description: 'Nama provinsi dari hasil search_destinations' },
              label: { type: 'string', description: 'Label lengkap dari hasil search_destinations' },
              items: {
                type: 'array',
                description: 'Daftar produk yang ingin dibeli pelanggan (kosongkan jika belum tahu/tidak disebutkan)',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    qty: { type: 'number' }
                  },
                  required: ['name', 'qty']
                }
              }
            },
            required: ['destination_id', 'city', 'province', 'label']
          }
        }
      }
    ];

    if (kbId && ragMode === 'agentic') {
      tools.push({
        type: 'function',
        function: {
          name: 'search_knowledge',
          description: 'Cari informasi tambahan tentang produk, toko, kebijakan, promo, atau jam operasional dari basis pengetahuan (knowledge base)',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Kata kunci pencarian yang relevan (misal: "jam buka", "bahan sepatu", "promo ongkir")' },
            },
            required: ['query'],
          },
        },
      });
    }

    this.logger.debug(`[TestHarness] Sending to AI: model=${resolvedModel}, turns=${history.length + 1}, ragMode=${ragMode}`);

    let text = '';
    const executedToolCalls: any[] = [];
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await this.aiProvider.chatWithTools(messages, {
          model: resolvedModel,
          maxTokens: 400,
          tools,
        });

        text = res.content;
        const toolCalls = res.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
          break;
        }

        messages.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls,
        });

        for (const call of toolCalls) {
          if (call.type !== 'function') continue;
          const fnName = call.function.name;
          let resultStr = '';
          let parsedArgs: any = {};
          let parsedResult: any = null;
          try {
            const args = JSON.parse(call.function.arguments);
            parsedArgs = args;
            if (fnName === 'search_destinations') {
              const res = await this.shipping.llmSearchDestinations(args.keyword, args.province);
              parsedResult = res;
              resultStr = JSON.stringify(res);
            } else if (fnName === 'calculate_shipping') {
              const dest = { id: args.destination_id, city: args.city, province: args.province, label: args.label };
              const res = await this.shipping.llmCalculateShipping('mock-session-id', dest, args.items || []);
              parsedResult = res;
              resultStr = JSON.stringify(res);
            } else if (fnName === 'search_knowledge' && kbId) {
              const results = await this.knowledge.search(kbId, args.query, 3);
              parsedResult = results;
              if (results.length > 0) {
                resultStr = results.map((r: any) => r.content).join('\n\n');
              } else {
                resultStr = 'Tidak ditemukan informasi relevan.';
              }
            } else {
              parsedResult = { error: `Unknown function ${fnName}` };
              resultStr = JSON.stringify(parsedResult);
            }
          } catch (e: any) {
            this.logger.warn(`Tool call ${fnName} failed: ${e.message}`);
            parsedResult = { error: e.message || String(e) };
            resultStr = JSON.stringify(parsedResult);
          }

          executedToolCalls.push({
             name: fnName,
             args: parsedArgs,
             result: parsedResult
          });

          messages.push({
            role: 'tool',
            content: resultStr,
            tool_call_id: call.id,
            name: fnName,
          });
        }
      }

      this.logger.debug(`[TestHarness] AI Response: text=${text}, tools=${JSON.stringify(executedToolCalls)}`);
      if (!text || text.trim() === '') {
        // Jika model tidak mengembalikan apa-apa (biasanya karena strict system prompt collision),
        // fallback agar loop tidak mandek tanpa jejak (empty bubble).
        if (executedToolCalls.length > 0) {
          text = "Menghitung ongkos kirim... \n\n{{blok_total}}";
        } else {
          text = "Maaf, saya tidak bisa memproses permintaan tersebut saat ini.";
        }
      }
    } catch (err) {
      this.logger.error(`[TestHarness] AI Error: ${err}`);
      throw err;
    }

    return { replyText: text, model: resolvedModel, executedTools: executedToolCalls };
  }

  private async mockGenerateReply(
    userText: string,
    history: Array<{ role: string; content: string }>,
  ): Promise<{ replyText: string; model: string; executedTools?: any[] }> {
    const turnNumber = Math.floor(history.length / 2) + 1;
    const responses: Record<string, string> = {
      'ada golok?': 'Kami punya 3 jenis golok.',
      'golok sedang': 'Oke kak, Golok Sedang ya.',
    };
    const normalized = userText.toLowerCase().trim();
    if (responses[normalized]) return { replyText: responses[normalized], model: 'mock-v1' };
    return { replyText: `MOCK MODE - Turn ${turnNumber}`, model: 'mock-v1' };
  }

  async switchProvider(_sessionId: string, _provider: string, _model: string): Promise<void> {}

  getAvailableProviders(): Array<{ name: string; models: string[] }> {
    return [
      { name: 'mock', models: ['mock-v1'] },
      { name: 'anthropic', models: ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4'] },
      { name: 'openrouter', models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4.5-turbo', 'google/gemini-2.0-flash-exp', 'meta-llama/llama-3.3-70b-instruct'] },
    ];
  }
}
