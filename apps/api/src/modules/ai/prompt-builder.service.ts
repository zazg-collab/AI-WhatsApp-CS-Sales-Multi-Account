import { Injectable, NotFoundException } from '@nestjs/common';
import { SenderType } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatMessage } from './ai-provider.service';

const BASE_RULES = `Aturan:
1. Jawab hanya berdasarkan product knowledge yang tersedia.
2. Jangan membuat data palsu atau janji berlebihan.
3. Jika informasi tidak tersedia, jawab: "Untuk info tersebut saya bantu konfirmasi dulu ke admin ya kak."
4. Jangan memaksa customer.
5. Jawab singkat, natural, dan sopan dalam Bahasa Indonesia.
6. Gali kebutuhan customer sebelum menawarkan.
7. Berikan CTA yang sesuai.
8. Jika komplain/refund/legal, arahkan ke admin.`;

@Injectable()
export class PromptBuilderService {
  constructor(private readonly prisma: PrismaService) {}

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

    const soul =
      conversation.bot?.persona?.soulMd ??
      'Kamu adalah asisten customer service/sales yang ramah dan natural.';

    const knowledge = await this.loadKnowledge(
      conversation.bot?.knowledgeBaseId ?? null,
    );

    const memory = this.customerMemory(conversation.customer);

    const system = [
      'Kamu adalah AI customer service/sales WhatsApp.',
      '',
      'Persona (Soul):',
      soul,
      '',
      'Product knowledge:',
      knowledge || '(belum ada knowledge — jangan mengarang)',
      '',
      'Data customer:',
      memory,
      '',
      BASE_RULES,
    ].join('\n');

    const history: ChatMessage[] = conversation.messages
      .slice()
      .reverse()
      .filter((m) => m.content)
      .map((m) => ({
        role:
          m.senderType === SenderType.customer
            ? ('user' as const)
            : ('assistant' as const),
        content: m.content as string,
      }));

    return [{ role: 'system', content: system }, ...history];
  }

  private async loadKnowledge(knowledgeBaseId: string | null): Promise<string> {
    if (!knowledgeBaseId) return '';
    const now = new Date();
    const items = await this.prisma.knowledgeItem.findMany({
      where: {
        knowledgeBaseId,
        status: 'active',
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return items
      .map((i) => `• ${i.title}${i.productName ? ` (${i.productName})` : ''}: ${i.content}`)
      .join('\n');
  }

  private customerMemory(customer: {
    name: string | null;
    phoneNumber: string;
    leadStage: string;
    tags: string[];
    notes: string | null;
  }): string {
    const lines = [
      `Nama: ${customer.name ?? 'Belum diketahui'}`,
      `Nomor: ${customer.phoneNumber}`,
      `Lead stage: ${customer.leadStage}`,
    ];
    if (customer.tags.length) lines.push(`Tags: ${customer.tags.join(', ')}`);
    if (customer.notes) lines.push(`Catatan admin: ${customer.notes}`);
    return lines.join('\n');
  }
}
