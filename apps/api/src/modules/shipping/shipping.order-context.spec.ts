import { ShippingService } from './shipping.service';
import { ShippingQuoteCache } from './shipping-quote.cache';

/**
 * >>> ANGGA — Order Context Log (blueprint 2026-08-04 + amendemen v1.1):
 * tes ALUR end-to-end lewat API publik ShippingService. Ditulis & dijalankan
 * RED terlebih dulu terhadap kode tanpa implementasi log (gagal di assertion,
 * bukan compile — `orderLog` disuntik lewat properti, bukan konstruktor,
 * persis supaya file ini bisa membuktikan RED), lalu implementasi menyusul
 * sampai GREEN.
 *
 * Skenario #1 adalah REPLAY insiden produksi 2026-08-04 yang memicu seluruh
 * modul ini: "COD deh kak. beli 2 ya" tanpa menyebut nama barang.
 */

const ESTIMATE: Record<string, any> = {
  JNE: { price: 47000, estimatedPrice: 47000, codFee: 0 },
  SiCepat: { price: 33000, estimatedPrice: 33000, codFee: 0, unsupported: false },
};
const PERF = {
  couriers: [{ key: 'JNE', score: 96 }, { key: 'SiCepat', score: 90 }],
  bestCourier: 'JNE',
  recommended: 'JNE',
};

// >>> ANGGA — addendum v2 M5: kebijakan memori order = kategori sendiri.
const OC = {
  orderContextStaleHours: 24,
  orderCancelKeywords: ['batal', 'gak jadi', 'ga jadi', 'nggak jadi', 'tidak jadi', 'cancel'],
  orderAggregateKeywords: ['semuanya', 'semua', 'seluruhnya', 'sekaligus', 'digabung', 'gabung', 'totalin semua', 'dua-duanya', 'borong', 'sama yang tadi', 'sama yg tadi'],
  orderAffirmationKeywords: ['iya', 'iyaa', 'ya', 'yup', 'betul', 'bener', 'benar', 'itu', 'oke', 'ok', 'sip', 'gas', 'boleh', 'mau', 'jadi', 'lanjut'],
  orderNegationKeywords: ['gak', 'ga', 'nggak', 'ngga', 'bukan', 'jangan', 'tidak', 'no'],
  orderFillerWords: ['kak', 'ka', 'dong', 'deh', 'aja', 'sih', 'min', 'gan', 'bang', 'mas', 'mbak', 'pak', 'bu', 'nya', 'yg', 'yang', 'yaudah', 'udah'],
  orderClosingNote: '',
  orderBridgeEnforcement: 'retry_once',
  orderDeixisKeywords: ['yg ini', 'yang ini', 'yg itu', 'yang itu', 'ini aja', 'itu aja'],
  orderOfferWindowMinutes: 60,
  orderGlobalTokens: {} as Record<string, string>,
  orderFormHintKeywords: ['form pemesanan', 'sudah melakukan pemesanan', 'mengisi form'],
  orderReferenceKeywords: ['yang tadi', 'yg tadi', 'pesanan tadi', 'order tadi', 'yang kemarin', 'sebelumnya'],
  orderNegoKeywords: ['diskon lagi', 'kurangin', 'murahin', 'free ongkir', 'gratis ongkir', 'nego', 'dikurangiin'],
};
// <<< ANGGA

const CONFIG = {
  mengantarApiKey: 'API-TEST',
  mengantarOriginId: 'ORIGIN-TEST',
  baseUrl: 'https://app.mengantar.com',
  courierExclude: [],
  codAllowlist: ['JNE'],
  codBlockedRegionKeywords: ['papua', 'maluku'],
  defaultWeightGrams: 1000,
  quoteCacheTtlMs: 21_600_000,
  discountMaxPerPcs: 5000,
  priceRoundingIncrement: 500,
  shippingDiscountPercentMax: 0, // diskon dimatikan supaya angka tes sederhana
  destinationAliases: {} as Record<string, string>,
  // >>> ANGGA — transisi M5: salinan kebijakan memori order juga di sini,
  // supaya tes RED bisa dijalankan terhadap kode PRA-addendum (yang masih
  // membacanya dari kategori shipping). Kode pasca-addendum membacanya dari
  // settings.orderContext() (objek OC di atas).
  ...OC,
  // <<< ANGGA
};

const GOLOK = {
  id: 'p-golok', sku: 'GLK-02', name: 'Golok Sembelih Multifungsi', category: 'golok',
  description: '', price: 150000, weightGrams: null, status: 'active',
};
const BEDOG = {
  id: 'p-bedog', sku: 'BDG-01', name: 'Bedog Betekok', category: 'bedog',
  description: '', price: 139000, weightGrams: null, status: 'active',
};

function entry(items: Array<{ productId: string; name: string; qty: number }>, opts: { fresh?: boolean; city?: string } = {}) {
  return {
    snapshot: {
      city: opts.city ?? 'MEDAN',
      province: 'SUMATERA UTARA',
      destinationId: 'dest-medan',
      items,
    },
    createdAt: new Date(),
    fresh: opts.fresh ?? true,
  };
}

function fakeLog(entries: any[] = [], offers: any[] = [], lastCompleted: any[] = []) {
  return {
    candidates: jest.fn().mockResolvedValue(entries),
    latestFresh: jest.fn(async () => entries.find((e) => e.fresh && e.snapshot.items.length) ?? null),
    latestAny: jest.fn(async () => entries.find((e) => e.snapshot.items.length) ?? null),
    recordSnapshot: jest.fn().mockResolvedValue(undefined),
    recordMarker: jest.fn().mockResolvedValue(undefined),
    noteOutboundSent: jest.fn().mockResolvedValue(undefined),
    // >>> ANGGA — addendum v2
    noteOutbound: jest.fn().mockResolvedValue(undefined),
    noteInboundForm: jest.fn().mockResolvedValue(undefined),
    recordOffer: jest.fn().mockResolvedValue(undefined),
    recentOffers: jest.fn().mockResolvedValue(offers),
    candidatesWithCompleted: jest.fn(async () => ({ current: entries, lastCompleted })),
    // <<< ANGGA
  };
}

// >>> ANGGA — addendum v2: pembuat entri PENAWARAN (offer registry).
function offer(items: Array<{ productId: string; name: string }>, fresh = true) {
  return {
    items: items.map((i) => ({ ...i, sku: null, qty: 1 })),
    medium: 'text',
    createdAt: new Date(),
    fresh,
  };
}
// <<< ANGGA

interface Opts {
  lastCustomerText?: string;
  extract?: { kota: string | null; items: Array<{ nama: string; qty: number }> };
  products?: any[];
  logEntries?: any[];
  addresses?: any[];
  config?: Partial<typeof CONFIG>;
  // >>> ANGGA — addendum v2
  oc?: Partial<typeof OC>;
  offers?: any[];
  lastCompleted?: any[];
  // <<< ANGGA
}

function harness(opts: Opts = {}) {
  const cfg = { ...CONFIG, ...(opts.config ?? {}) };
  const products = opts.products ?? [GOLOK, BEDOG];
  const extract = opts.extract ?? { kota: null, items: [] };
  const text = opts.lastCustomerText ?? 'halo kak';

  const prisma: any = {
    conversation: {
      findUnique: jest.fn().mockResolvedValue({
        bot: { language: 'id' },
        messages: [{ senderType: 'customer', content: text }],
      }),
    },
    message: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', content: text }) },
    product: {
      findMany: jest.fn().mockResolvedValue(products),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const oc = { ...OC, ...(opts.oc ?? {}) };
  const settings: any = {
    shipping: jest.fn().mockResolvedValue(cfg),
    orderContext: jest.fn().mockResolvedValue(oc),
  };
  const provider: any = { chat: jest.fn().mockResolvedValue(JSON.stringify(extract)) };
  const mengantar: any = {
    searchAddress: jest.fn().mockResolvedValue(
      opts.addresses ?? [{
        _id: 'dest-medan', PROVINCE_NAME: 'SUMATERA UTARA', CITY_NAME: 'MEDAN',
        CITY_NAME_SI: 'Kota Medan', DISTRICT_NAME: 'X', SUBDISTRICT_NAME: 'Z',
      }],
    ),
    estimate: jest.fn(async ({ codAmount }: any) => {
      if (codAmount == null) return ESTIMATE;
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(ESTIMATE)) out[k] = { ...(v as object), codFee: 5000 };
      return out;
    }),
    performance: jest.fn().mockResolvedValue(PERF),
  };
  const cache = new ShippingQuoteCache();
  const svc = new ShippingService(prisma, settings, provider, mengantar, cache);
  const orderLog = fakeLog(opts.logEntries ?? [], opts.offers ?? [], opts.lastCompleted ?? []);
  // Suntik lewat properti (bukan konstruktor) — lihat komentar kepala file.
  (svc as unknown as { orderLog: unknown }).orderLog = orderLog;
  const notifications = { send: jest.fn() };
  (svc as unknown as { notifications: unknown }).notifications = notifications;
  return { svc, prisma, settings, provider, mengantar, cache, orderLog, notifications, cfg };
}

function pesanBaru(h: ReturnType<typeof harness>, id: string, text: string) {
  h.prisma.message.findFirst.mockResolvedValue({ id, content: text });
  h.prisma.conversation.findUnique.mockResolvedValue({
    bot: { language: 'id' },
    messages: [{ senderType: 'customer', content: text }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Order Context Log — T2 carry-over (REPLAY insiden "COD deh kak. beli 2 ya")', () => {
  it('barang dibawa dari log + qty di-patch di kode + destinationId dipakai ulang', async () => {
    const h = harness({
      lastCustomerText: 'COD deh kak. beli 2 ya',
      extract: { kota: null, items: [] }, // extractor gagal bawa barang — persis insiden
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.shippingOnly).toBe(false);
    expect(res.quote.matchedItems).toEqual([
      expect.objectContaining({ productId: 'p-golok', qty: 2 }),
    ]);
    expect(res.quote.goodsTotal).toBe(300000); // 2 × 150.000 — dihitung ulang dari katalog
    // destinationId dari snapshot — TANPA pencarian alamat ulang.
    expect(h.mengantar.searchAddress).not.toHaveBeenCalled();
    expect(h.mengantar.estimate).toHaveBeenCalledWith(
      expect.objectContaining({ destinationId: 'dest-medan' }),
    );
    // qty baru = snapshot BARU di log (source carryover), idempoten per pesan.
    expect(h.orderLog.recordSnapshot).toHaveBeenCalledWith(
      'c1', 'm1',
      expect.objectContaining({ items: [expect.objectContaining({ productId: 'p-golok', qty: 2 })] }),
      'carryover',
    );
  });

  it('pesan menyebut PRODUK KATALOG lain → carry-over TIDAK dipaksakan', async () => {
    const h = harness({
      lastCustomerText: 'kalau bedog betekok kirim ke medan berapa?',
      extract: { kota: 'Medan', items: [{ nama: 'bedog betekok', qty: 1 }] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    // Barang mengikuti sebutan pelanggan, bukan diseret dari log.
    expect(res.quote.matchedItems).toEqual([expect.objectContaining({ productId: 'p-bedog' })]);
  });
});

describe('Order Context Log — jalur LOG-HIT (tahan restart, v1.1 §12.1-2)', () => {
  it('"totalnya berapa?" tanpa cache → dihitung ulang dari log TANPA LLM', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.goodsTotal).toBe(150000);
    expect(h.provider.chat).not.toHaveBeenCalled(); // deterministik, nol LLM
    expect(h.mengantar.estimate).toHaveBeenCalledWith(
      expect.objectContaining({ destinationId: 'dest-medan' }),
    );
  });

  it('kata agregat → GABUNGAN entri segar per identitas produk, tanpa hitung dobel', async () => {
    const h = harness({
      lastCustomerText: 'totalin semua ya kak',
      logEntries: [
        entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }]),
        entry([
          { productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 },
          { productId: 'p-bedog', name: 'Bedog Betekok', qty: 1 },
        ]),
      ],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.matchedItems).toHaveLength(2); // Golok TIDAK dobel
    expect(res.quote.goodsTotal).toBe(150000 + 139000);
  });
});

describe('Order Context Log — pembatalan utuh vs parsial (v1.1 §12.1-5)', () => {
  it('"gak jadi deh kak" (whole-message) → penanda cancelled + konteks reset', async () => {
    const h = harness({
      lastCustomerText: 'gak jadi deh kak',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('no_destination');
    expect(h.orderLog.recordMarker).toHaveBeenCalledWith('c1', 'cancelled', 'cancel_keyword');
    expect(h.provider.chat).not.toHaveBeenCalled();
  });
});

describe('Order Context Log — tangga ambiguitas BARANG (tambal sort[0])', () => {
  const duaBedog = [
    { ...BEDOG },
    { id: 'p-bedog2', sku: 'BDG-02', name: 'Bedog Sadap', category: 'bedog', description: '', price: 129000, weightGrams: null, status: 'active' },
  ];

  it('"bedog" cocok 2 produk berskor seri → BERTANYA, bukan memilih diam-diam', async () => {
    const h = harness({
      lastCustomerText: 'bedognya kirim ke medan berapa kak',
      extract: { kota: 'Medan', items: [{ nama: 'bedog', qty: 1 }] },
      products: duaBedog,
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('item_ambiguous');
    expect(res.itemCandidates.map((c: any) => c.name).sort()).toEqual(['Bedog Betekok', 'Bedog Sadap']);
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('Bedog Betekok');
    expect(grounding).toContain('Bedog Sadap');
    expect(grounding).not.toMatch(/\d{3,}/); // tanpa angka apa pun
  });

  it('jawaban "yg betekok kak" memetakan pilihan → langsung dikutip', async () => {
    const h = harness({
      lastCustomerText: 'bedognya kirim ke medan berapa kak',
      extract: { kota: 'Medan', items: [{ nama: 'bedog', qty: 1 }] },
      products: duaBedog,
    });
    expect((await h.svc.quoteForConversation('c1') as any).status).toBe('item_ambiguous');
    pesanBaru(h, 'm2', 'yg betekok kak');
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.matchedItems).toEqual([expect.objectContaining({ productId: 'p-bedog' })]);
    // Masuk log justru SETELAH konfirmasi (gerbang konfirmasi Bossfren).
    expect(h.orderLog.recordSnapshot).toHaveBeenCalledWith(
      'c1', 'm2', expect.anything(), 'confirmation',
    );
  });
});

describe('Order Context Log — token global & bridge-validasi', () => {
  it('{{catatan_sk}} dikenal TANPA kutipan aktif (v1.1 §12.1-3)', async () => {
    const note = 'Terima kasih sudah order! S&K COD: paket wajib dibayar saat kurir tiba.';
    // >>> ANGGA — addendum v2 M5: catatan_sk kini kebijakan kategori orderContext.
    const h = harness({ oc: { orderClosingNote: note } });
    const out = await h.svc.resolvePriceTokens('c1', 'Siap kak! {{catatan_sk}}');
    expect(out.ok).toBe(true);
    expect(out.text).toContain(note);
  });

  it('jalur asumsi + total tanpa nama barang → DITAHAN; menyebut nama barang → lolos', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const polos = await h.svc.resolvePriceTokens('c1', 'Totalnya {{total_transfer}} ya kak');
    expect(polos.ok).toBe(false);
    expect(polos.issues.join(' ')).toContain('ASUMSI');
    const berbridge = await h.svc.resolvePriceTokens(
      'c1',
      'Untuk Golok Sembelih Multifungsi ya kak, totalnya {{total_transfer}}',
    );
    expect(berbridge.ok).toBe(true);
  });

  it('grounding jalur asumsi memuat instruksi bridge (nama barangnya disebut)', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    await h.svc.quoteForConversation('c1');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('ASUMSI');
    expect(grounding).toContain('Golok Sembelih Multifungsi');
  });
});

describe('Order Context Log — konteks basi: haram untuk angka, halal untuk pertanyaan', () => {
  it('entri basi + pertanyaan berbau uang → grounding menyuruh tanya sambil menyebut order lama, tanpa angka', async () => {
    const h = harness({
      lastCustomerText: 'kemaren lusa totalnya berapa ya kak?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 2 }], { fresh: false })],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('no_destination'); // TIDAK menjawab angka dari entri basi
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('Golok Sembelih Multifungsi');
    expect(grounding).not.toMatch(/\d{3,}/);
    expect(grounding).not.toContain('{{');
  });
});

describe('Order Context Log — satu giliran satu kebenaran (v1.1 §12.1-1)', () => {
  it('panggilan kedua utk pesan yang sama tidak mengekstrak ulang & hasilnya identik', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya, golok sembelih multifungsi 1',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    const a: any = await h.svc.quoteForConversation('c1');
    const panggilanLlm = h.provider.chat.mock.calls.length;
    const b: any = await h.svc.quoteForConversation('c1'); // Sentinel me-review giliran yang sama
    expect(b).toEqual(a);
    expect(h.provider.chat.mock.calls.length).toBe(panggilanLlm); // tidak bertambah
    expect(h.orderLog.recordSnapshot).toHaveBeenCalledTimes(1); // snapshot 1x per pesan
  });
});

describe('Order Context Log — T3 anchor & T4 eskalasi downgrade', () => {
  it('extractor diberi anchor "order aktif" saat log punya entri segar (T3)', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya kak',
      extract: { kota: 'Medan', items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    await h.svc.extractOrderTarget('c1');
    const messages = h.provider.chat.mock.calls[0][0];
    const anchor = messages.find((m: any) => m.role === 'system' && m.content.includes('ORDER AKTIF'));
    expect(anchor).toBeDefined();
    expect(anchor.content).toContain('Golok Sembelih Multifungsi');
    expect(anchor.content).not.toMatch(/Rp|\d{4,}/); // tanpa angka uang
  });

  it('kutipan LENGKAP jatuh jadi ongkir-saja padahal log masih segar → grounding menyuruh konfirmasi ulang barang lama (T4)', async () => {
    const h = harness({
      // "kirim ke" = hint perubahan → jalur ekstraksi; barangnya tak dikenal katalog.
      lastCustomerText: 'kirim ke medan ya kak, parangnya',
      extract: { kota: 'Medan', items: [{ nama: 'parang super xyz', qty: 1 }] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.shippingOnly).toBe(true); // barang baru tak cocok katalog
    const grounding = await h.svc.getGroundingText('c1');
    // Sinyal kemungkinan KEHILANGAN KONTEKS (pola insiden) — bukan pesan generik.
    expect(grounding).toContain('Golok Sembelih Multifungsi');
    expect(grounding).toMatch(/konfirmasi|pastikan|maksud/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// >>> ANGGA — ADDENDUM v2 (2026-08-05): tes alur 4 mekanisme + P1/P2.
// RED-first terhadap kode pra-addendum (gagal di assertion), lalu GREEN.

describe('Addendum v2 — M2: kamus token global', () => {
  it('{{rekening_transfer}} dari kamus AppSetting resolve verbatim tanpa kutipan aktif', async () => {
    const rek = 'BCA 6765556680 a.n Cordova Digital Inovasi';
    const h = harness({ oc: { orderGlobalTokens: { rekening_transfer: rek } } });
    const out = await h.svc.resolvePriceTokens('c1', 'Silakan transfer ke:\n{{rekening_transfer}}');
    expect(out.ok).toBe(true);
    expect(out.text).toContain(rek); // digit rekening lolos gerbang HANYA via sisipan sistem
  });

  it('nama kamus yang bentrok token uang DIABAIKAN (tidak bisa membajak {{total_transfer}})', async () => {
    const h = harness({ oc: { orderGlobalTokens: { total_transfer: 'Rp1' } } });
    const out = await h.svc.resolvePriceTokens('c1', 'Totalnya {{total_transfer}} kak');
    expect(out.ok).toBe(false); // tetap tak dikenal tanpa kutipan aktif — bukan 'Rp1'
    expect(out.text).not.toContain('Rp1');
  });
});

describe('Addendum v2 — M3/M1: fallback PENAWARAN (seed form) & deixis', () => {
  it('form seed → "kirim ke medan, totalnya berapa?" dikutip dari penawaran + bridge', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya kak, totalnya berapa?',
      extract: { kota: 'Medan', items: [] },
      offers: [offer([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi' }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.shippingOnly).toBe(false);
    expect(res.quote.matchedItems).toEqual([expect.objectContaining({ productId: 'p-golok' })]);
    // Jalur ASUMSI → bridge wajib menyebut nama barang.
    const polos = await h.svc.resolvePriceTokens('c1', 'Totalnya {{total_transfer}} ya kak');
    expect(polos.ok).toBe(false);
  });

  it('interseksi "golok yg itu": kata generik dipersempit penawaran → jawab + bridge, TANPA bertanya', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya, aku mau dong golok yg itu',
      extract: { kota: 'Medan', items: [{ nama: 'golok', qty: 1 }] },
      offers: [offer([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi' }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.matchedItems).toEqual([expect.objectContaining({ productId: 'p-golok' })]);
  });

  it('dua penawaran aktif + frasa tunjuk → BERTANYA tertutup dari kandidat penawaran saja', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan, yg itu berapa kak',
      extract: { kota: 'Medan', items: [] },
      offers: [
        offer([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi' }]),
        offer([{ productId: 'p-bedog', name: 'Bedog Betekok' }]),
      ],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('item_ambiguous');
    expect(res.itemCandidates.map((c: any) => c.productId).sort()).toEqual(['p-bedog', 'p-golok']);
  });
});

describe('Addendum v2 — M4: referensi eksplisit lintas penanda selesai', () => {
  it('replay Aluna: "kalau 2 sama yg tadi jadi berapa?" → union order berjalan + order SELESAI terakhir', async () => {
    const h = harness({
      lastCustomerText: 'kalau 2 sama yg tadi jadi berapa?',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
      lastCompleted: [entry([{ productId: 'p-bedog', name: 'Bedog Betekok', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.matchedItems).toHaveLength(2);
    expect(res.quote.goodsTotal).toBe(150000 + 139000);
  });

  it('TANPA frasa referensi, order selesai TIDAK terjangkau (perilaku lama utuh)', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
      lastCompleted: [entry([{ productId: 'p-bedog', name: 'Bedog Betekok', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.matchedItems).toEqual([expect.objectContaining({ productId: 'p-golok' })]);
  });
});

describe('Addendum v2 — P1: diskon barang per-pcs (token nego)', () => {
  it('{{diskon_barang}} & {{total_cod_nego}} dihitung sistem dari discountMaxPerPcs', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya, golok sembelih multifungsi 2',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 2 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    // 2 pcs × 5.000 = 10.000; transfer: 2×150.000 + 47.000 = 347.000 → nego 337.000
    const a = await h.svc.resolvePriceTokens('c1', 'Kalau nego: {{diskon_barang}} → {{total_transfer_nego}}');
    expect(a.ok).toBe(true);
    expect(a.text).toContain('Rp10.000');
    expect(a.text).toContain('Rp337.000');
  });
});

describe('Addendum v2 — P2: tangga nego', () => {
  it('nego ronde 1 → grounding menyodorkan token nego; ronde 2 → eskalasi + notifikasi admin', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya, golok sembelih multifungsi 1',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');

    pesanBaru(h, 'm2', 'ga ada diskon lagi kak?');
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const ronde1 = await h.svc.getGroundingText('c1');
    expect(ronde1).toContain('NEGO');
    expect(ronde1).toContain('{{diskon_barang}}');
    expect(h.notifications.send).not.toHaveBeenCalled();

    pesanBaru(h, 'm3', 'kurangin lagi dong kak');
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const ronde2 = await h.svc.getGroundingText('c1');
    expect(ronde2).toContain('atasan');
    expect(h.notifications.send).toHaveBeenCalledTimes(1);
  });
});
