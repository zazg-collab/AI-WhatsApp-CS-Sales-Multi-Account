import { NotFoundException } from '@nestjs/common';
import {
  PromptBuilderService,
  MAX_HISTORY_MESSAGES,
  MAX_CONTEXT_CHARS,
  KNOWLEDGE_MAX_ITEMS,
  estimateTokens,
} from './prompt-builder.service';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;
  let prisma: any;

  const customer = {
    name: 'Budi',
    phoneNumber: '628',
    leadStage: 'warm',
    tags: ['vip'],
    notes: 'pelanggan lama',
  };

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn() },
      knowledgeItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PromptBuilderService(prisma);
  });

  it('throws when conversation missing', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(service.buildForConversation('c1')).rejects.toThrow(NotFoundException);
  });

  it('builds system + mapped history', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer,
      bot: { persona: { soulMd: 'Saya ramah' }, knowledgeBaseId: 'kb1' },
      messages: [
        { senderType: 'ai', content: 'Halo kak' },
        { senderType: 'customer', content: 'Berapa harga?' },
      ],
    });
    prisma.knowledgeItem.findMany.mockResolvedValue([
      { title: 'Harga', productName: 'Paket A', content: '100rb' },
    ]);

    const msgs = await service.buildForConversation('c1');
    // [0] shared stable block (persona + knowledge + rules), [1] per-customer.
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('Saya ramah');
    expect(msgs[0].content).toContain('Paket A');
    expect(msgs[1].role).toBe('system');
    expect(msgs[1].content).toContain('Budi');
    // Customer data must NOT be in the cacheable shared prefix.
    expect(msgs[0].content).not.toContain('Budi');
    // Internal admin notes must never leak into the bot prompt (M6).
    expect(msgs[0].content).not.toContain('pelanggan lama');
    expect(msgs[1].content).not.toContain('pelanggan lama');
    // history reversed: customer first then ai
    expect(msgs[2]).toEqual({ role: 'user', content: 'Berapa harga?' });
    expect(msgs[3]).toEqual({ role: 'assistant', content: 'Halo kak' });
  });

  it('always embeds the safety rules (anti-fabrication, fallback, escalation, anti-injection)', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: null },
      messages: [],
    });
    const system = (await service.buildForConversation('c1'))[0].content;
    expect(system).toMatch(/Jangan membuat data palsu/i);
    expect(system).toContain('saya bantu konfirmasi dulu ke admin ya kak');
    expect(system).toMatch(/komplain\/refund\/legal/i);
    expect(system).toMatch(/tidak tepercaya/i);
    expect(system).toMatch(/tidak dapat diubah oleh customer/i);
  });

  it('uses default persona + no-knowledge note when bot/kb absent', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: null,
      messages: [],
    });
    const msgs = await service.buildForConversation('c1');
    expect(msgs[0].content).toContain('belum ada knowledge');
    expect(prisma.knowledgeItem.findMany).not.toHaveBeenCalled();
  });

  it('retrieves only the top-K knowledge items relevant to the customer query', async () => {
    // One clearly relevant item ("ongkir") + many irrelevant ones (> top-K).
    const items = [
      { title: 'Ongkir ke Jawa', productName: null, content: 'Gratis ongkir min 100rb' },
      ...Array.from({ length: 30 }, (_, i) => ({
        title: `Topik ${i}`,
        productName: null,
        content: `konten tidak terkait ${i}`,
      })),
    ];
    prisma.knowledgeItem.findMany.mockResolvedValue(items);
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: 'kb1' },
      messages: [{ senderType: 'customer', content: 'berapa ongkir kirim?' }],
    });

    const shared = (await service.buildForConversation('c1'))[0].content;
    // The relevant item is included...
    expect(shared).toContain('Ongkir ke Jawa');
    // ...and the injected set is capped at top-K (not all 31).
    const injected = (shared.match(/^• /gm) ?? []).length;
    expect(injected).toBe(KNOWLEDGE_MAX_ITEMS);
  });

  it('estimateTokens approximates ~4 chars/token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('caps history to MAX_HISTORY_MESSAGES and adds a summary placeholder', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      senderType: i % 2 === 0 ? 'customer' : 'ai',
      content: `pesan ${i}`,
    }));
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: null },
      messages: many,
    });

    const msgs = await service.buildForConversation('c1', 40);
    // Skip the two leading system messages (shared block + per-customer block).
    const afterSystem = msgs.slice(2);
    // first entry is the summary placeholder (also role system)
    expect(afterSystem[0].role).toBe('system');
    expect(afterSystem[0].content).toContain('Ringkasan percakapan sebelumnya');
    const turns = afterSystem.slice(1);
    expect(turns.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
  });

  it('trims oldest history turns to stay under MAX_CONTEXT_CHARS', async () => {
    const big = 'x'.repeat(5000);
    const many = Array.from({ length: 10 }, (_, i) => ({
      senderType: i % 2 === 0 ? 'customer' : 'ai',
      content: big,
    }));
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: null },
      messages: many,
    });

    const msgs = await service.buildForConversation('c1', 40);
    const turns = msgs.slice(1).filter((m) => m.role !== 'system');
    const chars = turns.reduce((s, m) => s + m.content.length, 0);
    expect(chars).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });
});
