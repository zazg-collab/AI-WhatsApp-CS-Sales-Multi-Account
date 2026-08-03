import { PromptBuilderService } from './modules/ai/prompt-builder.service';
import { checkForbiddenWords } from './modules/sentinel/rules.engine';

describe('ANGGA — persona fields benar-benar dipakai', () => {
  it('checkForbiddenWords: cocok di balasan bot (case-insensitive)', () => {
    const hit = checkForbiddenWords('Tenang kak, kami kasih GRATIS ONGKIR ya', ['gratis ongkir', 'diskon']);
    expect(hit).not.toBeNull();
    expect(hit!.decision).toBe('takeover_required');
    expect(hit!.reason).toContain('gratis ongkir');
  });

  it('checkForbiddenWords: null kalau tidak ada yang cocok / daftar kosong', () => {
    expect(checkForbiddenWords('Harga paket A Rp100.000', ['gratis ongkir'])).toBeNull();
    expect(checkForbiddenWords('apa saja boleh', [])).toBeNull();
    expect(checkForbiddenWords('apa saja boleh', null)).toBeNull();
  });

  it('prompt: tone/style/rules/forbiddenWords muncul di system prompt', async () => {
    const prisma: any = {
      conversation: { findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        customer: { name: 'Budi', phoneNumber: '628', leadStage: 'warm', tags: [] },
        bot: { language: 'id', knowledgeBaseId: null, persona: {
          soulMd: 'Saya ramah',
          tone: 'santai tapi sopan',
          style: 'kalimat pendek, tanpa emoji',
          rules: 'Jangan pernah menjanjikan tanggal kirim pasti.',
          forbiddenWords: ['gratis ongkir', 'garansi seumur hidup'],
        } },
        messages: [{ senderType: 'customer', content: 'halo', createdAt: new Date() }],
      }) },
      knowledgeItem: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new PromptBuilderService(prisma,
      { relevantForQuery: jest.fn().mockResolvedValue([]) } as any,
      { search: jest.fn().mockResolvedValue([]) } as any);
    const msgs = await svc.buildForConversation('c1');
    const sys = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    expect(sys).toContain('Saya ramah');
    expect(sys).toContain('Nada bicara: santai tapi sopan');
    expect(sys).toContain('Gaya penulisan: kalimat pendek, tanpa emoji');
    expect(sys).toContain('Jangan pernah menjanjikan tanggal kirim pasti.');
    expect(sys).toContain('gratis ongkir, garansi seumur hidup');
  });

  it('prompt: persona tanpa detail tidak menambah baris kosong', async () => {
    const prisma: any = {
      conversation: { findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        customer: { name: 'Budi', phoneNumber: '628', leadStage: 'warm', tags: [] },
        bot: { language: 'id', knowledgeBaseId: null, persona: { soulMd: 'Saya ramah' } },
        messages: [{ senderType: 'customer', content: 'halo', createdAt: new Date() }],
      }) },
      knowledgeItem: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new PromptBuilderService(prisma,
      { relevantForQuery: jest.fn().mockResolvedValue([]) } as any,
      { search: jest.fn().mockResolvedValue([]) } as any);
    const sys = (await svc.buildForConversation('c1')).filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    expect(sys).toContain('Saya ramah');
    expect(sys).not.toContain('Nada bicara:');
  });
});
