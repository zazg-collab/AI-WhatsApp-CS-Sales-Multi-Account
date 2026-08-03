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

// ── Fitur custom #5: Bot.defaultAiMode & Bot.status akhirnya berfungsi ──────
import { AiMode, BotStatus, MessageStatus, MessageType, SenderType, TakeoverStatus } from '@sentinel/database';
import { BotsService } from './modules/bots/bots.service';
import { WaInboundService } from './modules/wa/wa-inbound.service';

describe('ANGGA — Bot.defaultAiMode dipakai saat assign ke akun', () => {
  const bot = { id: 'b1', defaultAiMode: AiMode.ai_supervised };

  function buat(akun: any) {
    const prisma: any = {
      bot: { findUnique: jest.fn().mockResolvedValue(bot) },
      whatsappAccount: {
        findUnique: jest.fn().mockResolvedValue(akun),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(data)),
      },
    };
    return { prisma, svc: new BotsService(prisma) };
  }

  it('menyetel aiMode akun dari defaultAiMode bot saat penugasan BERUBAH', async () => {
    const { prisma, svc } = buat({ id: 'a1', assignedBotId: null });
    await svc.assignToAccount('b1', 'a1');
    expect(prisma.whatsappAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedBotId: 'b1', aiMode: AiMode.ai_supervised } }),
    );
  });

  it('TIDAK menyetel ulang aiMode kalau akun sudah dipegang bot yang sama', async () => {
    const { prisma, svc } = buat({ id: 'a1', assignedBotId: 'b1' });
    await svc.assignToAccount('b1', 'a1');
    expect(prisma.whatsappAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedBotId: 'b1' } }),
    );
    const arg = prisma.whatsappAccount.update.mock.calls[0][0];
    expect(arg.data.aiMode).toBeUndefined();
  });
});

describe('ANGGA — gerbang Bot.status di jalur auto-reply', () => {
  let service: any; let ai: any; let percakapan: any;

  function siapkan(statusBot: BotStatus | null) {
    jest.useFakeTimers();
    percakapan = {
      id: 'c1', whatsappAccountId: 'a1',
      aiMode: AiMode.ai_draft,
      takeoverStatus: TakeoverStatus.ai_active,
      customer: { phoneNumber: '628123' },
      bot: statusBot === null ? null : { status: statusBot },
    };
    const prisma: any = {
      conversation: { findUnique: jest.fn().mockResolvedValue(percakapan), update: jest.fn() },
      message: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.status === MessageStatus.pending ? []
            : [{ id: 'k1', senderType: SenderType.customer, content: 'halo', messageType: MessageType.text }])),
        updateMany: jest.fn(), update: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
      },
    };
    ai = { generateReply: jest.fn().mockResolvedValue({ text: 'balasan' }), generateSegmentedReply: jest.fn() };
    service = new WaInboundService(
      prisma, { emitToAccount: jest.fn() } as any, {} as any, ai,
      { review: jest.fn() } as any, { send: jest.fn() } as any,
      { sendText: jest.fn(), subscribePresence: jest.fn().mockResolvedValue(undefined) } as any,
      { get: jest.fn(() => { throw new Error('x'); }) } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );
  }

  afterEach(() => jest.useRealTimers());

  it('bot inactive → TIDAK membalas sama sekali', async () => {
    siapkan(BotStatus.inactive);
    service.scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(9_000);
    expect(ai.generateReply).not.toHaveBeenCalled();
  });

  it('bot draft → TIDAK membalas sama sekali', async () => {
    siapkan(BotStatus.draft);
    service.scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(9_000);
    expect(ai.generateReply).not.toHaveBeenCalled();
  });

  it('bot active → membalas seperti biasa', async () => {
    siapkan(BotStatus.active);
    service.scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(9_000);
    expect(ai.generateReply).toHaveBeenCalledTimes(1);
  });

  it('percakapan tanpa bot → tetap membalas (perilaku lama dipertahankan)', async () => {
    siapkan(null);
    service.scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(9_000);
    expect(ai.generateReply).toHaveBeenCalledTimes(1);
  });
});
