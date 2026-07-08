import { AssetsService, detectAssetIntent } from './assets.service';

describe('detectAssetIntent', () => {
  it('detects testimonial intent from hesitation cues', () => {
    expect(detectAssetIntent('apakah ini beneran ada testimoni?')).toEqual([
      { purpose: 'testimonial', cue: 'beneran' },
    ]);
  });

  it('detects product intent from price/stock questions', () => {
    const hits = detectAssetIntent('kak harga berapa ya, stok masih ada?');
    expect(hits.map((h) => h.purpose)).toContain('product');
  });

  it('detects brochure intent from how-it-works questions', () => {
    const hits = detectAssetIntent('gimana caranya pakai produk ini?');
    expect(hits.map((h) => h.purpose)).toContain('brochure');
  });

  it('can return multiple purposes for a mixed message', () => {
    const hits = detectAssetIntent('harga berapa ya, beneran ready stok?');
    const purposes = hits.map((h) => h.purpose);
    expect(purposes).toContain('product');
  });

  it('returns empty for plain chit-chat', () => {
    expect(detectAssetIntent('halo kak selamat pagi')).toEqual([]);
  });

  it('handles empty/undefined input', () => {
    expect(detectAssetIntent('')).toEqual([]);
    expect(detectAssetIntent(undefined as unknown as string)).toEqual([]);
  });

  it('only reports one hit per purpose even with multiple matching cues', () => {
    const hits = detectAssetIntent('ragu nih, beneran asli kan?');
    const testimonialHits = hits.filter((h) => h.purpose === 'testimonial');
    expect(testimonialHits).toHaveLength(1);
  });
});

describe('AssetsService.suggest', () => {
  let prisma: any;
  let service: AssetsService;

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      whatsappAccount: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn() },
      asset: { findMany: jest.fn() },
    };
    const storage = {} as any;
    const wa = {} as any;
    const events = {} as any;
    const config = { get: jest.fn().mockReturnValue('false') } as any;
    service = new AssetsService(prisma, storage, wa, events, config);
  });

  it('rejects an admin scoped to a different account (C2 broken-access-control regression: suggest)', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1' });
    prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'a2' }]);
    const scopedAdmin = { id: 'admin1', role: 'admin' };
    await expect(service.suggest('c1', scopedAdmin as never)).rejects.toThrow();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('suggests a product card when customer asks about price', async () => {
    prisma.message.findMany.mockResolvedValue([{ content: 'harga berapa ya kak?' }]);
    prisma.asset.findMany.mockResolvedValue([
      { id: 'a1', title: 'Kartu Produk', kind: 'image', purpose: 'product', triggerKeywords: [] },
      { id: 'a2', title: 'Testimoni Video', kind: 'video', purpose: 'testimonial', triggerKeywords: [] },
    ]);
    const out = await service.suggest('c1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a1', purpose: 'product' });
    expect(out[0].reason).toMatch(/harga|stok/i);
  });

  it('still prefers an exact trigger-keyword match over loose intent', async () => {
    prisma.message.findMany.mockResolvedValue([{ content: 'ada promo akhir tahun?' }]);
    prisma.asset.findMany.mockResolvedValue([
      { id: 'a1', title: 'Promo Banner', kind: 'image', purpose: 'brochure', triggerKeywords: ['promo'] },
    ]);
    const out = await service.suggest('c1');
    expect(out[0].reason).toContain('Cocok dengan "promo"');
  });

  it('returns empty when no customer messages exist', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    const out = await service.suggest('c1');
    expect(out).toEqual([]);
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });
});

describe('AssetsService.sendToConversation', () => {
  it('rejects an admin scoped to a different account (C2 broken-access-control regression)', async () => {
    const prisma: any = {
      conversation: { findUnique: jest.fn().mockResolvedValue({ whatsappAccountId: 'a1' }) },
      whatsappAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'a2' }]) },
      asset: { findUnique: jest.fn() },
    };
    const storage = { read: jest.fn() } as any;
    const wa = { sendMediaBuffer: jest.fn() } as any;
    const events = { emitToAccount: jest.fn() } as any;
    const config = { get: jest.fn().mockReturnValue('false') } as any;
    const service = new AssetsService(prisma, storage, wa, events, config);
    const scopedAdmin = { id: 'admin1', role: 'admin' };
    await expect(
      service.sendToConversation('asset1', 'c1', 'admin1', scopedAdmin as never),
    ).rejects.toThrow();
    expect(prisma.asset.findUnique).not.toHaveBeenCalled();
    expect(wa.sendMediaBuffer).not.toHaveBeenCalled();
  });
});
