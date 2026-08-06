import { LearningMinerService } from './learning-miner.service';

describe('LearningMinerService.mineConversation (Sentinel auto-learn)', () => {
  let prisma: any;
  let provider: any;
  let service: LearningMinerService;

  const longText = Array.from({ length: 12 }, (_, i) => `pesan cukup panjang nomor ${i} untuk konteks`).join(' ');

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', content: longText, senderType: 'customer' },
          { id: 'm2', content: 'jawaban admin yang juga cukup panjang untuk konteks', senderType: 'admin' },
        ]),
      },
      bot: { findUnique: jest.fn().mockResolvedValue({ knowledgeBaseId: 'kb1' }) },
      knowledgeItem: { findMany: jest.fn().mockResolvedValue([]) },
      learningProposal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    provider = { chat: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(undefined) } as any;
    service = new LearningMinerService(prisma, provider, config);
  });

  it('is idempotent — skips when learnedAt is already set', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', learnedAt: new Date(), customerId: 'cu1', bot: { id: 'b1', language: 'id' } });
    const res = await service.mineConversation('c1');
    expect(res).toEqual({ knowledge: 0, customerMemory: 0, skipped: 0 });
    expect(provider.chat).not.toHaveBeenCalled();
    expect(prisma.learningProposal.create).not.toHaveBeenCalled();
  });

  it('skips (but marks learned) when there is too little transcript', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', learnedAt: null, customerId: 'cu1', bot: { id: 'b1', language: 'id' } });
    prisma.message.findMany.mockResolvedValue([{ id: 'm1', content: 'hi', senderType: 'customer' }]);
    const res = await service.mineConversation('c1');
    expect(res.knowledge).toBe(0);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' } }));
  });

  it('creates a fenced knowledge proposal tied to the conversation, then marks learned', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', learnedAt: null, customerId: null, bot: { id: 'b1', language: 'id' } });
    provider.chat.mockResolvedValue('[{"title":"Harga klem ukuran 8","content":"Rp 5.000 per buah","confidence":80}]');

    const res = await service.mineConversation('c1');

    expect(res.knowledge).toBe(1);
    expect(prisma.learningProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ botId: 'b1', conversationId: 'c1', type: 'knowledge', title: 'Harga klem ukuran 8' }),
      }),
    );
    // learnedAt set at the end (idempotency).
    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { learnedAt: expect.any(Date) } });
  });

  it('does nothing for a conversation with no bot', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', learnedAt: null, customerId: 'cu1', bot: null });
    const res = await service.mineConversation('c1');
    expect(res).toEqual({ knowledge: 0, customerMemory: 0, skipped: 0 });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  // >>> ANGGA — koreksi 2026-08-06: draft KITA yang ditahan gerbang uang
  // (pending) atau kedaluwarsa (failed) tidak boleh ikut ditambang jadi
  // "fakta" knowledge/customer_memory — lihat komentar di learning-miner.service.ts.
  it('mengecualikan draft KITA yang pending/failed dari transkrip mineConversation (bukan pesan pelanggan)', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', learnedAt: null, customerId: 'cu1', bot: { id: 'b1', language: 'id' } });
    prisma.message.findMany.mockResolvedValue([]);
    await service.mineConversation('c1');
    const arg = prisma.message.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { senderType: 'customer' },
      { status: { notIn: ['pending', 'failed'] } },
    ]);
  });

  it('mengecualikan draft KITA yang pending/failed dari histori mineCustomerMemory', async () => {
    prisma.bot.findUnique.mockResolvedValue({ id: 'b1', language: 'id', accounts: [{ id: 'acc1' }] });
    prisma.customer = { findMany: jest.fn().mockResolvedValue([{ id: 'cu1', name: 'Budi', phoneNumber: '6281' }]) };
    prisma.message.findMany.mockResolvedValue([]);
    await service.mineCustomerMemory('b1');
    const call = prisma.message.findMany.mock.calls.find((c: any) => c[0]?.where?.conversation?.customerId);
    expect(call).toBeDefined();
    expect(call[0].where.OR).toEqual([
      { senderType: 'customer' },
      { status: { notIn: ['pending', 'failed'] } },
    ]);
  });

  it('mengecualikan draft KITA yang pending/failed dari transkrip mineKnowledge (gatherTranscripts)', async () => {
    prisma.bot.findUnique.mockResolvedValue({ id: 'b1', language: 'id', accounts: [{ id: 'acc1' }] });
    prisma.message.findMany.mockResolvedValue([]);
    await service.mineKnowledge('b1');
    const call = prisma.message.findMany.mock.calls.find((c: any) => c[0]?.where?.conversation?.whatsappAccountId);
    expect(call).toBeDefined();
    expect(call[0].where.OR).toEqual([
      { senderType: 'customer' },
      { status: { notIn: ['pending', 'failed'] } },
    ]);
  });
  // <<< ANGGA
});
