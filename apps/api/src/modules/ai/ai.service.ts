import { Injectable, Logger } from '@nestjs/common';
import { LeadStage } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AiProviderService,
  ChatMessage,
} from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';

export interface GeneratedReply {
  text: string;
  model: string;
}

export interface LeadScoreResult {
  score: number;
  stage: LeadStage;
  reasons: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly prompts: PromptBuilderService,
  ) {}

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
  ): Promise<GeneratedReply> {
    const messages = await this.prompts.buildForConversation(conversationId);
    const text = await this.provider.chat(messages, {
      model,
      temperature: 0.6,
      maxTokens: 500,
    });
    return { text, model: model ?? this.provider.model };
  }

  async summarizeChat(conversationId: string): Promise<string> {
    const history = await this.prompts.buildForConversation(
      conversationId,
      60,
    );
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'Ringkas percakapan customer service berikut dalam 2-4 kalimat Bahasa Indonesia. Sebutkan kebutuhan customer, produk yang diminati, keberatan, dan langkah berikutnya.',
      },
      ...history.filter((m) => m.role !== 'system'),
      { role: 'user', content: 'Buat ringkasan singkat percakapan di atas.' },
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

    const history = await this.prompts.buildForConversation(
      conversationId,
      40,
    );
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Kamu menilai prospek (lead) penjualan dari percakapan WhatsApp.
Skor 0-100 berdasar sinyal: tanya harga/stok/lokasi/cara bayar/DP/promo, kirim data diri, minta survey/invoice, respon cepat, chat berulang.
Balas HANYA JSON: {"score": number, "stage": "cold|warm|hot|very_hot", "reasons": string[]}.
Acuan stage: 0-30 cold, 31-60 warm, 61-80 hot, 81-100 very_hot.`,
      },
      ...history.filter((m) => m.role !== 'system'),
      { role: 'user', content: 'Nilai lead percakapan di atas sebagai JSON.' },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0,
      json: true,
      maxTokens: 300,
    });

    const result = this.parseLeadScore(raw);

    await this.prisma.customer.update({
      where: { id: conversation.customerId },
      data: { leadScore: result.score, leadStage: result.stage },
    });

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
