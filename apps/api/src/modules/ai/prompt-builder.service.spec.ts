import { NotFoundException } from '@nestjs/common';
import { PromptBuilderService } from './prompt-builder.service';

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
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('Saya ramah');
    expect(msgs[0].content).toContain('Paket A');
    expect(msgs[0].content).toContain('Budi');
    // Internal admin notes must never leak into the bot prompt (M6).
    expect(msgs[0].content).not.toContain('pelanggan lama');
    // history reversed: customer first then ai
    expect(msgs[1]).toEqual({ role: 'user', content: 'Berapa harga?' });
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'Halo kak' });
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
});
