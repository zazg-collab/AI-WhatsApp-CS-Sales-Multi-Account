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
    // bot is null → language falls back to 'en' → English no-knowledge note.
    expect(msgs[1].content).toContain('no knowledge base yet');
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
