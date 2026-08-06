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
  let knowledgeIndex: any;

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
      asset: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // No relevant products by default → no extra product system message.
    const products = { relevantForQuery: jest.fn().mockResolvedValue([]) } as any;
    // RAG disabled by default → keyword retrieval path (search returns []).
    knowledgeIndex = { search: jest.fn().mockResolvedValue([]) };
    service = new PromptBuilderService(prisma, products, knowledgeIndex);
  });

  it('throws when conversation missing', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(service.buildForConversation('c1')).rejects.toThrow(NotFoundException);
  });

  // >>> ANGGA — koreksi 2026-08-06 (REPLAY insiden "{{subtotal_barang}}"
  // berulang lintas percakapan/model — TERBUKTI DARI KODE, bukan cuma dugaan):
  // draft yang ditahan gerbang (status pending) atau kedaluwarsa (status
  // failed) sebelumnya tidak boleh ikut riwayat yang dikirim ke LLM, supaya
  // model tidak meniru "balasannya sendiri" yang penuh penanda rusak.
  it('mengecualikan draft milik kita sendiri yang pending/failed dari riwayat percakapan (bukan pesan pelanggan)', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer,
      bot: null,
      messages: [],
    });
    await service.buildForConversation('c1');
    const arg = prisma.conversation.findUnique.mock.calls[0][0];
    expect(arg.include.messages.where).toEqual({
      OR: [
        { senderType: 'customer' },
        { status: { notIn: ['pending', 'failed'] } },
      ],
    });
  });

  it('builds system + mapped history', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer,
      bot: { persona: { soulMd: 'Saya ramah' }, knowledgeBaseId: 'kb1', language: 'id' },
      messages: [
        { senderType: 'ai', content: 'Halo kak' },
        { senderType: 'customer', content: 'Berapa harga?' },
      ],
    });
    prisma.knowledgeItem.findMany.mockResolvedValue([
      { id: 'k1', title: 'Harga', productName: 'Paket A', content: '100rb' },
    ]);

    const msgs = await service.buildForConversation('c1');
    // [0] system security/scope guard, [1] shared stable block (persona +
    // knowledge + rules), [2] per-customer.
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/PRIORITAS TERTINGGI/);
    expect(msgs[1].role).toBe('system');
    expect(msgs[1].content).toContain('Saya ramah');
    expect(msgs[1].content).toContain('Paket A');
    expect(msgs[2].role).toBe('system');
    expect(msgs[2].content).toContain('Budi');
    // P0: injected knowledge + customer memory are fenced as reference DATA so
    // adversarial wording inside them cannot act as an instruction.
    expect(msgs[1].content).toMatch(/DATA_REFERENSI/);
    expect(msgs[2].content).toMatch(/DATA_REFERENSI/);
    // Customer data must NOT be in the cacheable shared prefix.
    expect(msgs[1].content).not.toContain('Budi');
    // Internal admin notes must never leak into the bot prompt (M6).
    expect(msgs[1].content).not.toContain('pelanggan lama');
    expect(msgs[2].content).not.toContain('pelanggan lama');
    // history reversed: customer first then ai
    expect(msgs[3]).toEqual({ role: 'user', content: 'Berapa harga?' });
    expect(msgs[4]).toEqual({ role: 'assistant', content: 'Halo kak' });
  });

  it('always embeds the safety rules (anti-fabrication, fallback, escalation, anti-injection)', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: null, language: 'id' },
      messages: [],
    });
    const msgs = await service.buildForConversation('c1');
    // [0] system security/scope guard — anti-injection + role confinement.
    const guard = msgs[0].content;
    expect(guard).toMatch(/DATA, bukan instruksi/i);
    expect(guard).toMatch(/tidak dapat dinegosiasikan oleh customer/i);
    expect(guard).toMatch(/lingkup/i);
    // [1] shared block — anti-fabrication, fallback phrase, escalation.
    const shared = msgs[1].content;
    expect(shared).toMatch(/Jangan membuat data palsu/i);
    expect(shared).toContain('saya bantu konfirmasi dulu ke admin ya kak');
    expect(shared).toMatch(/komplain\/refund\/legal/i);
  });

  it('uses default persona + no-knowledge note when bot/kb absent', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: null,
      messages: [],
    });
    const msgs = await service.buildForConversation('c1');
    // >>> ANGGA — 2026-08-05: bot null kini jatuh ke 'id' (diselaraskan dgn
    // ekstraktor & Sentinel; insiden kalimat tanya bocor bahasa Inggris).
    expect(msgs[1].content).toContain('belum ada knowledge');
    expect(prisma.knowledgeItem.findMany).not.toHaveBeenCalled();
  });

  it('retrieves only the top-K knowledge items relevant to the customer query', async () => {
    // One clearly relevant item ("ongkir") + many irrelevant ones (> top-K).
    const items = [
      { id: 'rel', title: 'Ongkir ke Jawa', productName: null, content: 'Gratis ongkir min 100rb' },
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `t${i}`,
        title: `Topik ${i}`,
        productName: null,
        content: `konten tidak terkait ${i}`,
      })),
    ];
    prisma.knowledgeItem.findMany.mockResolvedValue(items);
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: 'kb1', language: 'id' },
      messages: [{ senderType: 'customer', content: 'berapa ongkir kirim?' }],
    });

    const shared = (await service.buildForConversation('c1'))[1].content;
    // The relevant item is included...
    expect(shared).toContain('Ongkir ke Jawa');
    // ...and the injected set is capped at top-K (not all 31).
    const injected = (shared.match(/^• /gm) ?? []).length;
    expect(injected).toBe(KNOWLEDGE_MAX_ITEMS);
  });

  it('promotes a semantic hit that has no keyword overlap (hybrid retrieval)', async () => {
    // 31 recency items with zero lexical match to the query; the relevant
    // answer only surfaces via the vector index (different words, same meaning).
    const items = Array.from({ length: 31 }, (_, i) => ({
      id: `t${i}`,
      title: `Topik ${i}`,
      productName: null,
      content: `konten lain ${i}`,
    }));
    prisma.knowledgeItem.findMany.mockResolvedValue(items);
    // Vector index returns the semantically-matching item first.
    knowledgeIndex.search.mockResolvedValue([
      { id: 'sem', title: 'Pengiriman luar pulau', productName: null, content: 'Estimasi 3-5 hari' },
    ]);
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      customer: { ...customer, tags: [], notes: null },
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: 'kb1', language: 'id' },
      messages: [{ senderType: 'customer', content: 'kapan barang sampai?' }],
    });

    const shared = (await service.buildForConversation('c1'))[1].content;
    expect(knowledgeIndex.search).toHaveBeenCalledWith('kb1', expect.any(String), expect.any(Number));
    // The semantic-only hit is injected even though it shares no query words.
    expect(shared).toContain('Pengiriman luar pulau');
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
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: null, language: 'id' },
      messages: many,
    });

    const msgs = await service.buildForConversation('c1', 40);
    // Skip the three leading system messages (security guard + shared block +
    // per-customer block).
    const afterSystem = msgs.slice(3);
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
      bot: { persona: { soulMd: 's' }, knowledgeBaseId: null, language: 'id' },
      messages: many,
    });

    const msgs = await service.buildForConversation('c1', 40);
    const turns = msgs.slice(1).filter((m) => m.role !== 'system');
    const chars = turns.reduce((s, m) => s + m.content.length, 0);
    expect(chars).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });

  /**
   * >>> ANGGA — regresi insiden "Catatan keluar sebelum closing" (2026-08-03).
   *
   * Pelanggan menulis "1 aja, kirim ke purworejo berapa ya?" dan bot
   * membacakan seluruh SOP pengiriman & COD padahal belum memilih apa pun.
   * Pemicunya kata "kirim": dulu SETIAP kata dihitung sama beratnya, jadi kata
   * yang muncul di hampir semua butir pun bisa memenangkan butir yang tidak
   * relevan — dan butir itu memakan satu dari 12 slot.
   *
   * Fixture di bawah meniru bentuk knowledge base sungguhan: kata "kirim" ada
   * di mana-mana, "betekok" cuma di satu butir.
   */
  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, audit gerbang uang #1):
  // `PRODUCT_STOCK_INTRO` (blok stok produk, PRIMARY/awal) dulu bilang
  // "jawab harga LANGSUNG" tanpa syarat — bentrok sama `SHIPPING_MONEY_RULE`
  // (blok TERAKHIR, "pakai penanda, jangan tulis rupiah sendiri") kalau
  // dua-duanya aktif bersamaan (pelanggan tanya harga + ongkir sekaligus).
  // Karena model paling nurut ke blok PERTAMA, instruksi harga di sini yang
  // menang — makanya model tetap menulis "Rp139.000" dkk walau penanda
  // sudah tersedia. Tes ini memastikan precedence-nya ditulis eksplisit DI
  // BLOK STOK PRODUK ITU SENDIRI, hanya ketika order berongkir memang aktif.
  describe('ANGGA — audit gerbang uang #1: precedence harga vs penanda di blok stok produk', () => {
    const productWithPrice = [
      { name: 'Bedog Betekok', price: 139000, currency: 'IDR', stock: 5, unit: 'pcs', category: null },
    ];

    it('menempelkan aturan precedence gerbang uang di blok stok produk KALAU order berongkir sedang aktif', async () => {
      const products = { relevantForQuery: jest.fn().mockResolvedValue(productWithPrice) };
      const shipping = {
        getGroundingText: jest
          .fn()
          .mockResolvedValue(
            'Jangan pernah menulis nominal rupiah sendiri...\n• {{harga_satuan}} = harga satu barang',
          ),
        // >>> ANGGA — koreksi 2026-08-06 (audit menyeluruh, temuan #1): harga
        // produk sekarang SELALU ditokenkan (lihat describe di bawah), jadi
        // cacheProductPriceTokens ikut terpanggil di sini juga.
        cacheProductPriceTokens: jest.fn(),
      };
      const svc = new PromptBuilderService(prisma, products as any, knowledgeIndex, shipping as any);
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        customer,
        bot: { persona: { soulMd: 'Saya ramah' }, knowledgeBaseId: null, language: 'id' },
        messages: [{ senderType: 'customer', content: 'harga bedog betekok berapa, kirim ke Mataram?' }],
      });
      const msgs = await svc.buildForConversation('c1');
      const shared = msgs[1].content;
      expect(shared).toContain('Bedog Betekok');
      expect(shared).toMatch(/order berongkir sedang aktif/i);
      expect(shared).toMatch(/WAJIB pakai PENANDA/i);
    });

    it('TIDAK menempelkan precedence text di blok stok produk kalau belum ada order berongkir aktif', async () => {
      const products = { relevantForQuery: jest.fn().mockResolvedValue(productWithPrice) };
      const shipping = { getGroundingText: jest.fn().mockResolvedValue(''), cacheProductPriceTokens: jest.fn() }; // belum ada tujuan/order
      const svc = new PromptBuilderService(prisma, products as any, knowledgeIndex, shipping as any);
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        customer,
        bot: { persona: { soulMd: 'Saya ramah' }, knowledgeBaseId: null, language: 'id' },
        messages: [{ senderType: 'customer', content: 'harga bedog betekok berapa?' }],
      });
      const msgs = await svc.buildForConversation('c1');
      const shared = msgs[1].content;
      expect(shared).toContain('Bedog Betekok');
      expect(shared).not.toMatch(/order berongkir sedang aktif/i);
    });
  });
  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, insiden "{{139000}}"
  // ronde 2): kalau belum ada order berongkir aktif, blok stok produk DULU
  // tetap menyuntik harga MENTAH ("IDR 139,000") sebagai data referensi ke
  // model, walau tidak ada instruksi gerbang uang apa pun untuk giliran itu
  // (lihat tes precedence di atas — precedence-nya HANYA dipasang kalau
  // shippingGrounding tidak kosong). Modelnya sendiri masih "ingat" pola
  // {{token}} dari giliran lain di percakapan yang sama, jadi ia membungkus
  // angka mentah itu jadi penanda palsu `{{139000}}` -- lolos dari
  // substitusi (nama penanda cuma boleh huruf/underscore) TAPI tetap
  // tertangkap radar angka mentah `resolvePriceTokens`, jadi gerbang uang
  // menahan draftnya (aman, tapi admin harus Edit manual setiap kali
  // ditanya harga sebelum ada tujuan -- bug UX yang berulang persis pola
  // yang sama). Perbaikannya: harga produk SEKARANG selalu lewat penanda
  // `{{harga_produk_N}}` juga untuk kasus ini, dicache lewat
  // `cacheProductPriceTokens` supaya `resolvePriceTokens` bisa mengisinya
  // nanti -- model tidak pernah lagi melihat angka mentahnya sama sekali.
  describe('ANGGA — penanda harga produk saat belum ada order berongkir aktif', () => {
    const productWithPrice = [
      { name: 'Bedog Betekok', price: 139000, currency: 'IDR', stock: 5, unit: 'pcs', category: null },
    ];

    it('blok stok produk memakai {{harga_produk_N}}, BUKAN angka mentah, kalau belum ada order berongkir', async () => {
      const products = { relevantForQuery: jest.fn().mockResolvedValue(productWithPrice) };
      const cacheProductPriceTokens = jest.fn();
      const shipping = {
        getGroundingText: jest.fn().mockResolvedValue(''), // belum ada tujuan/order
        cacheProductPriceTokens,
      };
      const svc = new PromptBuilderService(prisma, products as any, knowledgeIndex, shipping as any);
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        customer,
        bot: { persona: { soulMd: 'Saya ramah' }, knowledgeBaseId: null, language: 'id' },
        messages: [{ senderType: 'customer', content: 'harga bedog betekok berapa?' }],
      });
      const msgs = await svc.buildForConversation('c1');
      const shared = msgs[1].content;
      expect(shared).toContain('Bedog Betekok');
      expect(shared).toMatch(/\{\{harga_produk_[a-z]+\}\}/);
      expect(shared).not.toContain('139,000');
      expect(shared).not.toContain('139000');
      expect(cacheProductPriceTokens).toHaveBeenCalledWith('c1', expect.objectContaining({}));
      const [, tokens] = cacheProductPriceTokens.mock.calls[0];
      const values = Object.values(tokens);
      const expectedPrice = (139000).toLocaleString('en-US', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
      expect(values).toContain(expectedPrice);
    });

    it('tidak ada produk berharga → cacheProductPriceTokens TIDAK dipanggil sama sekali', async () => {
      const products = { relevantForQuery: jest.fn().mockResolvedValue([]) };
      const cacheProductPriceTokens = jest.fn();
      const shipping = { getGroundingText: jest.fn().mockResolvedValue(''), cacheProductPriceTokens };
      const svc = new PromptBuilderService(prisma, products as any, knowledgeIndex, shipping as any);
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        customer,
        bot: { persona: { soulMd: 'Saya ramah' }, knowledgeBaseId: null, language: 'id' },
        messages: [{ senderType: 'customer', content: 'halo' }],
      });
      await svc.buildForConversation('c1');
      expect(cacheProductPriceTokens).not.toHaveBeenCalled();
    });

    // >>> ANGGA — koreksi 2026-08-06 (audit menyeluruh, temuan #1): tes ini
    // DULU justru mendokumentasikan bug sebagai "perilaku yang benar" —
    // "tetap pakai harga mentah" waktu order berongkir aktif. Insidennya:
    // `resolvePriceTokens`'s `angkaMentah` (gerbang uang) menahan SEMUA
    // angka rupiah mentah tanpa kecuali barang di luar order aktif, jadi
    // kalau pelanggan tanya harga barang LAIN (bukan bagian order yang
    // sedang diongkirin), balasan yang justru BENAR (nurut instruksi lama)
    // ketahan gerbang + retry otomatis pasti gagal juga (tidak ada penanda
    // untuk barang itu) → jatuh ke draft manual + alarm admin palsu. Fix:
    // harga produk SELALU lewat penanda `{{harga_produk_x}}`, order
    // berongkir aktif atau tidak. Tes diganti membuktikan perilaku BARU.
    it('order berongkir SEDANG aktif → harga produk TETAP pakai {{harga_produk_N}} (bukan angka mentah), supaya gerbang uang tidak menahan balasan yang menyebut harga barang di luar order', async () => {
      const products = { relevantForQuery: jest.fn().mockResolvedValue(productWithPrice) };
      const cacheProductPriceTokens = jest.fn();
      const shipping = {
        getGroundingText: jest
          .fn()
          .mockResolvedValue(
            'Jangan pernah menulis nominal rupiah sendiri...\n• {{harga_satuan}} = harga satu barang',
          ),
        cacheProductPriceTokens,
      };
      const svc = new PromptBuilderService(prisma, products as any, knowledgeIndex, shipping as any);
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        customer,
        bot: { persona: { soulMd: 'Saya ramah' }, knowledgeBaseId: null, language: 'id' },
        messages: [{ senderType: 'customer', content: 'harga bedog betekok berapa, kirim ke Mataram?' }],
      });
      const msgs = await svc.buildForConversation('c1');
      const shared = msgs[1].content;
      expect(shared).toMatch(/\{\{harga_produk_[a-z]+\}\}/);
      expect(shared).not.toContain('139,000');
      expect(shared).not.toContain('139000');
      expect(cacheProductPriceTokens).toHaveBeenCalledWith('c1', expect.objectContaining({}));
      const [, tokens] = cacheProductPriceTokens.mock.calls[0];
      const values = Object.values(tokens);
      const expectedPrice = (139000).toLocaleString('en-US', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
      expect(values).toContain(expectedPrice);
    });
  });


  describe('ANGGA — kata umum tidak boleh memenangkan butir yang tidak relevan', () => {
    /**
     * 24 butir "kirim" + 1 butir "betekok", dan butir target sengaja ditaruh
     * PALING BELAKANG (paling lama diperbarui).
     *
     * Kata "kirim" ada di JUDUL semua butir umum, jadi dengan pembobotan lama
     * ia bernilai +2 — sama persis dengan "betekok" di judul butir target.
     * Seri, lalu urutan recency yang memutuskan, dan butir target tersingkir
     * dari 12 slot. Itulah bentuk aslinya insiden kemarin.
     */
    function knowledgeBase() {
      const umum = Array.from({ length: 24 }, (_, i) => ({
        id: `k${i}`,
        title: i === 0 ? 'SOP kirim & COD' : `Aturan kirim ${i}`,
        productName: null,
        content: 'Barang dikirim setelah pembayaran, lewat kurir, ke seluruh Indonesia.',
      }));
      return [
        ...umum,
        { id: 'target', title: 'Bedog Betekok', productName: 'Bedog Betekok', content: 'Cocok untuk cincang daging.' },
      ];
    }

    async function ambilKnowledge(pertanyaan: string) {
      prisma.knowledgeItem.findMany.mockResolvedValue(knowledgeBase());
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        customer,
        bot: { persona: { soulMd: 'ramah' }, knowledgeBaseId: 'kb1', language: 'id' },
        messages: [{ senderType: 'customer', content: pertanyaan }],
      });
      const msgs = await service.buildForConversation('c1');
      return msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    }

    it('butir langka menang atas 24 butir yang cuma memuat kata umum', async () => {
      const teks = await ambilKnowledge('kirim betekok');
      expect(teks).toContain('Bedog Betekok');
    });

    it('pertanyaan tanpa kata langka: SOP tetap boleh masuk (bukan diblokir)', async () => {
      // Bobot rendah ≠ dilarang. Kalau memang tidak ada sinyal yang lebih kuat,
      // butir umum tetap terpakai — tidak boleh sampai knowledge jadi kosong.
      const teks = await ambilKnowledge('kirim');
      expect(teks.length).toBeGreaterThan(0);
    });

    it('jumlah butir yang disuntik tetap dibatasi top-K', async () => {
      const teks = await ambilKnowledge('kirim betekok purworejo');
      const butir = teks.split('\n').filter((b) => b.startsWith('• '));
      expect(butir.length).toBeLessThanOrEqual(KNOWLEDGE_MAX_ITEMS);
    });
  });
});
