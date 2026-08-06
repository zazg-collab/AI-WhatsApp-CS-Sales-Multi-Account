import { ShippingService, penjagaKata } from './shipping.service';
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
  JNE: { price: 47000, estimatedPrice: 47000, codFee: 0, estimatedDate: '2-3 hari' },
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
  // >>> ANGGA — F1/F2 (2026-08-05): kata tanya-uang, pembuka jalur asumsi.
  orderMoneyAskKeywords: ['total', 'ongkir', 'ongkos', 'harga', 'berapa', 'bayar', 'biaya', 'transfer', 'rekening', 'cod'],
  // <<< ANGGA
  // >>> ANGGA — E3 (2026-08-05): frasa internal yang haram sampai ke pelanggan.
  orderMetaPhraseBlacklist: ['penanda', 'placeholder', 'instruksi sistem', 'gerbang uang', 'grounding', 'informasi harga yang akurat', 'informasi ongkir yang akurat', 'dicek kembali di chat', 'cek chat ini', 'website resmi ekspedisi', 'website ekspedisi', 'cs ekspedisi'],
  // <<< ANGGA
  // >>> ANGGA — P2 (2026-08-05): frasa kontradiksi "menyangkal data yang tersedia".
  // >>> ANGGA — Q-Chain fix (2026-08-05, insiden "banyumas kak"): + varian
  // urutan kata 'akan cek dulu'/'saya akan cek'/'akan konfirmasi ke admin'
  // (cermin default settings.service; 'konfirmasi dulu ke admin' tetap sah).
  orderContradictionPhrases: ['belum memiliki informasi', 'belum ada informasi', 'belum punya info', 'tidak memiliki informasi', 'belum bisa memastikan', 'akan saya cek dulu', 'cek dengan tim', 'tim logistik', 'menghubungkan dengan tim', 'akan segera memberikan informasi', 'akan cek dulu', 'saya akan cek', 'akan konfirmasi ke admin', 'tidak bisa memberikan info', 'belum bisa mengakses'],
  // >>> ANGGA — anti-teater proses (2026-08-05, insiden "mataram dobel"):
  // cermin default settings.service — narasi "sedang mengecek" yang ditahan
  // hanya saat draft yang sama sudah menyisipkan penanda uang.
  orderTheaterPhrases: ['saya cek dulu', 'saya bantu cek dulu', 'mohon tunggu', 'mohon ditunggu', 'tunggu sebentar', 'saya proses dulu', 'setelah saya cek', 'sedang saya cek', 'saya cek terlebih dahulu'],
  // <<< ANGGA
  // >>> ANGGA — Q-Chain (2026-08-05, ketok Bossfren): funnel pertanyaan berantai.
  orderFunnelEnabled: true,
  orderFunnelAskItem: 'produknya mau yang mana kak? 😊',
  orderFunnelAskAddress: 'boleh diinfo alamat lengkapnya kak biar kami bantu hitung ongkirnya ya? 🙏',
  orderFunnelAskBasket: 'jadinya mau ambil dua-duanya sekalian ({{daftar_produk}}) atau salah satu dulu kak? 😊',
  orderFunnelAskBasketOpen: 'produk yang mana aja kak yang jadi diambil? 😊',
  orderFunnelAskQty: 'mau ambil berapa pcs kak?',
  orderFunnelAskPayment: 'mau diproses COD atau transfer kak? 😊',
  orderFunnelAskLandmark: 'boleh dicantumkan patokan rumahnya dekat apa kak? biar kurir gampang nemuin alamatnya 🙏',
  // >>> ANGGA — Q-Chain v3.1 (2026-08-06, revisi Bossfren): alamat lengkap
  // + patokan sekaligus, beda per metode bayar.
  orderFunnelAskLandmarkCod: 'boleh diinfokan alamat lengkapnya dan dicantumkan patokan rumahnya dekat apa kak? biar kurir gampang nemuin alamatnya 🙏☺️',
  orderFunnelAskLandmarkTransfer: 'silakan info alamat lengkapnya dan cantumkan patokan rumahnya ya kak. kemudian untuk menyelesaikan pembayaran silakan transfer ke salah satu rekening berikut ini:\n{{rekening_transfer}}\njika sudah menyelesaikan pembayaran mohon konfirmasi bukti pembayarannya ya, terima kasih 😊',
  // <<< ANGGA
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

function entry(
  items: Array<{ productId: string; name: string; qty: number }>,
  opts: { fresh?: boolean; city?: string; qtyPasti?: boolean; konklusi?: boolean } = {},
) {
  return {
    snapshot: {
      city: opts.city ?? 'MEDAN',
      province: 'SUMATERA UTARA',
      destinationId: 'dest-medan',
      items,
      // >>> ANGGA — Q-Chain (2026-08-05)
      qtyPasti: opts.qtyPasti ?? false,
      konklusi: opts.konklusi ?? false,
      // <<< ANGGA
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
    // >>> ANGGA — Q-Chain (2026-08-05)
    recordFunnelAsk: jest.fn().mockResolvedValue(undefined),
    funnelAsks: jest.fn().mockResolvedValue({}),
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
  extract?: { kota: string | null; provinsi?: string | null; items: Array<{ nama: string; qty: number }> };
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
    // >>> ANGGA — revisi sadar 2026-08-06 (GERBANG REKENING): rekening kini
    // HANYA sah setelah pelanggan memilih transfer — giliran di tes ini
    // dibuat sebagai jawaban "transfer aja kak" (dulu 'halo kak' pun lolos).
    const h = harness({
      lastCustomerText: 'transfer aja kak',
      oc: { orderGlobalTokens: { rekening_transfer: rek } },
    });
    await h.svc.quoteForConversation('c1'); // isi memo giliran
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

// ─────────────────────────────────────────────────────────────────────────────
// >>> ANGGA — F1+F2+F3 (2026-08-05): REPLAY insiden "halo" di akun tes —
// sapaan polos dijawab rekap order kemarin (log-hit menyala untuk pesan
// APA PUN tanpa hint), lalu draft tertahan gerbang uang gara-gara frasa
// "total harga 2 x {{harga_satuan}}". Tes RED-first terhadap kode pra-F.

describe('F1 — jalur asumsi hanya untuk pesan TANYA-UANG (insiden "halo")', () => {
  it('REPLAY: "halo" + snapshot segar kemarin → TIDAK dijawab kutipan order', async () => {
    const h = harness({
      lastCustomerText: 'halo',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 2 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    // Kode pra-F1: log-hit menyala → 'ok' → grounding menyuruh rekap. Harusnya
    // sapaan jatuh ke alur lama dan TIDAK membawa kutipan apa pun.
    expect(res.status).toBe('no_destination');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toBe(''); // nol suntikan ongkir/total untuk sapaan
  });

  it('penjaga perilaku: "totalnya berapa?" tetap log-hit tanpa LLM', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(h.provider.chat).not.toHaveBeenCalled();
  });

  it('penjaga perilaku: afirmasi utuh "oke kak" tetap boleh pakai konteks (jalur bridge)', async () => {
    const h = harness({
      lastCustomerText: 'oke kak',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(h.provider.chat).not.toHaveBeenCalled();
  });
});

describe('F2 — directive rekap ASUMSI hanya saat obrolan order/uang', () => {
  it('assumed tersisa dari giliran uang + basa-basi berikutnya (cache hangat) → directive TIDAK disuntik', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    pesanBaru(h, 'm2', 'oke makasih infonya kak'); // bukan afirmasi utuh, bukan tanya uang
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // cache hangat
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).not.toContain('ASUMSI'); // pra-F2: directive rekap ikut tersuntik
  });

  it('penjaga perilaku: giliran tanya-uang jalur asumsi TETAP dapat directive bridge', async () => {
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

describe('F3 — penjaga kata: perkalian eksplisit atas harga satuan itu SAH', () => {
  it('"total harga 2 x {{harga_satuan}}" (pola draft insiden) → LOLOS', () => {
    expect(
      penjagaKata('Kamu memesan 2 Golok Sembelih Multifungsi dengan total harga 2 x {{harga_satuan}} dan ongkir sekitar {{ongkir}}.'),
    ).toBeNull();
  });

  it('"totalnya {{harga_satuan}}" tanpa perkalian → tetap DITAHAN', () => {
    expect(penjagaKata('totalnya {{harga_satuan}} ya kak')).not.toBeNull();
  });

  it('"totalnya 2 x {{subtotal_barang}}" → tetap DITAHAN (pelonggaran KHUSUS harga_satuan)', () => {
    expect(penjagaKata('totalnya 2 x {{subtotal_barang}} kak')).not.toBeNull();
  });
});
// <<< ANGGA

// ─────────────────────────────────────────────────────────────────────────────
// >>> ANGGA — S1+S2 (2026-08-05, ketok Bossfren pasca-audit money gate):
// S1 telemetri alasan hold (murni sisi-BACA dari Message.moneyGateIssues yang
// sudah dipersist — nol jalur tulis baru), S2 token blok {{rincian_tagihan}}
// (rekap tagihan utuh disusun sistem — permukaan salah-label menyempit).
// RED-first terhadap kode pra-S.

describe('S2 — {{rincian_tagihan}}: blok rekap tagihan disusun sistem', () => {
  it('rekap lengkap: perkalian per barang + subtotal + ongkir + total Transfer/COD', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya, golok sembelih multifungsi 2',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 2 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens('c1', 'Ini rinciannya kak:\n{{rincian_tagihan}}');
    expect(out.ok).toBe(true);
    // 2 × 150.000 = 300.000; transfer 300+47 = 347.000; COD 300+47+5 = 352.000
    expect(out.text).toContain('2 x Rp150.000 = Rp300.000');
    expect(out.text).toContain('Subtotal barang');
    expect(out.text).toContain('Rp347.000');
    expect(out.text).toContain('Rp352.000');
    expect(out.text).not.toContain('{{'); // tidak ada penanda tersisa
  });

  it('bridge jalur asumsi: {{rincian_tagihan}} MEMENUHI wajib-sebut-nama-barang', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens('c1', 'Totalnya {{total_transfer}} ya kak.\n{{rincian_tagihan}}');
    expect(out.ok).toBe(true); // blok memuat nama barang → asumsi tetap terlihat pelanggan
    expect(out.text).toContain('Golok Sembelih Multifungsi');
  });

  it('kamus global TIDAK bisa membajak rincian_tagihan (nama cadangan)', async () => {
    const h = harness({ oc: { orderGlobalTokens: { rincian_tagihan: 'ANGKA PALSU' } } });
    // Tanpa kutipan aktif → wajib tak dikenal & ditahan, BUKAN diisi kamus.
    const out = await h.svc.resolvePriceTokens('c1', '{{rincian_tagihan}}');
    expect(out.ok).toBe(false);
    expect(out.text).not.toContain('ANGKA PALSU');
  });

  it('kutipan ongkir-saja: rincian_tagihan TIDAK ditawarkan/tersedia', async () => {
    const h = harness({
      lastCustomerText: 'kirim ke medan ya kak, parangnya',
      extract: { kota: 'Medan', items: [{ nama: 'parang super xyz', qty: 1 }] },
      logEntries: [],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.shippingOnly).toBe(true);
    const out = await h.svc.resolvePriceTokens('c1', '{{rincian_tagihan}}');
    expect(out.ok).toBe(false); // barang belum pasti → tidak ada rekap tagihan
  });
});

describe('S1 — telemetri alasan hold gerbang uang (sisi-baca)', () => {
  // Impor lewat require DI DALAM tes supaya suite tetap jalan (RED di level
  // assertion, bukan gagal compile) terhadap kode pra-S1.
  it('klasifikasi alasan: 4 kelas dikenal + fallback lainnya', () => {
    const { klasifikasiAlasanGate } = require('./shipping.service');
    expect(klasifikasiAlasanGate('Penanda dipakai setelah kata yang bisa membuat labelnya salah: "total {{harga_satuan}}"')).toBe('label_rancu');
    expect(klasifikasiAlasanGate('Penanda tidak dikenal/tidak tersedia untuk kutipan ini: {{total_codd}}')).toBe('token_tak_dikenal');
    expect(klasifikasiAlasanGate('Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 434.000')).toBe('digit_mentah');
    expect(klasifikasiAlasanGate('Balasan memakai ASUMSI order yang sedang berjalan tapi tidak menyebut nama barangnya — …')).toBe('bridge_asumsi');
    expect(klasifikasiAlasanGate('alasan format masa depan yang belum dikenal')).toBe('lainnya');
  });

  // >>> ANGGA — koreksi 2026-08-06 (audit menyeluruh, temuan #2 & #5): issue
  // "mengulang rincian total" (fix "cod aja kak", commit f5eb0a6) belum
  // dikenali sebelumnya (jatuh ke 'lainnya'); dan `digitPanjang` (rekening)
  // vs `angkaMentah` (harga) dulu satu bucket 'digit_mentah' walau beda
  // jenis pelanggaran.
  it('klasifikasi alasan: "mengulang rincian total" masuk funnel_dilanggar, rekening mentah punya kelas sendiri', () => {
    const { klasifikasiAlasanGate } = require('./shipping.service');
    expect(
      klasifikasiAlasanGate(
        'Balasan mengulang rincian total ({{rincian_tagihan}}) padahal total sudah pernah disodorkan di giliran sebelumnya — jangan direkap ulang, cukup tutup dengan pertanyaan langkah "patokan".',
      ),
    ).toBe('funnel_dilanggar');
    expect(
      klasifikasiAlasanGate(
        'Angka panjang (nomor rekening/telepon) ditulis langsung oleh model: 1234567890 — angka kelas ini wajib lewat penanda kamus (mis. {{rekening_bca}}), jangan pernah diketik sendiri.',
      ),
    ).toBe('rekening_mentah');
    // harga mentah (bukan rekening) tetap di kelas lama, tidak ikut bergeser.
    expect(klasifikasiAlasanGate('Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 434.000')).toBe('digit_mentah');
  });

  it('moneyGateStats menghitung draft tertahan per alasan dari Message.moneyGateIssues', async () => {
    const h = harness();
    (h.prisma as any).message.findMany = jest.fn().mockResolvedValue([
      { moneyGateIssues: ['Penanda tidak dikenal/tidak tersedia untuk kutipan ini: {{total_codd}}'] },
      {
        moneyGateIssues: [
          'Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 434.000',
          'Penanda dipakai setelah kata yang bisa membuat labelnya salah: "total {{harga_satuan}}"',
        ],
      },
    ]);
    const s = await (h.svc as any).moneyGateStats(7);
    expect(s.totalDraftDitahan).toBe(2);
    expect(s.perAlasan.token_tak_dikenal).toBe(1);
    expect(s.perAlasan.digit_mentah).toBe(1);
    expect(s.perAlasan.label_rancu).toBe(1);
    // Kueri dibatasi jendela hari + hanya baris yang punya issue.
    const arg = (h.prisma as any).message.findMany.mock.calls[0][0];
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('gagal baca DB → nol & tidak melempar (telemetri = penolong, bukan jalur kritis)', async () => {
    const h = harness();
    (h.prisma as any).message.findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const s = await (h.svc as any).moneyGateStats(7);
    expect(s.totalDraftDitahan).toBe(0);
    expect(s.gagalBaca).toBe(true);
  });
});
// <<< ANGGA

// ─────────────────────────────────────────────────────────────────────────────
// >>> ANGGA — E3 (2026-08-05, insiden "Mohon dicek kembali di chat ini untuk
// informasi harga yang akurat" bocor ke draft): PENJAGA META deterministik —
// frasa internal sistem (daftar AppSetting `orderMetaPhraseBlacklist`) yang
// muncul di balasan → ditahan gerbang (ikut mekanisme retry-sekali). RED-first.

describe('E3 — penjaga meta: istilah internal tidak boleh sampai ke pelanggan', () => {
  it('REPLAY insiden: "…informasi harga yang akurat" → DITAHAN', async () => {
    const h = harness();
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Harganya sudah tertera ya kak. Mohon dicek kembali di chat ini untuk informasi harga yang akurat.',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('istilah internal');
  });

  it('kata "penanda" bocor ke balasan → DITAHAN', async () => {
    const h = harness();
    const out = await h.svc.resolvePriceTokens('c1', 'Nanti penandanya saya isi ya kak');
    expect(out.ok).toBe(false);
  });

  it('balasan CS normal → LOLOS (blacklist tidak menyenggol obrolan wajar)', async () => {
    const h = harness();
    const out = await h.svc.resolvePriceTokens('c1', 'Siap kak, pesanan diproses. Ditunggu ya 🙏');
    expect(out.ok).toBe(true);
  });

  it('telemetri mengenal kelas istilah_internal', () => {
    const { klasifikasiAlasanGate } = require('./shipping.service');
    expect(
      klasifikasiAlasanGate('Balasan menyebut istilah internal sistem ("penanda") — tulis ulang tanpa menyinggung sistem.'),
    ).toBe('istilah_internal');
  });
});
// <<< ANGGA

// ─────────────────────────────────────────────────────────────────────────────
// >>> ANGGA — P0/P2/P4/P5 (2026-08-05, KETOK Bossfren pasca-insiden "mataram"
// resolve diam-diam ke Lampung Timur): dominansi 2026-08-03 DIBATALKAN — auto
// hanya saat kandidat TUNGGAL, selebihnya SELALU bertanya terbuka; ekstraktor
// pisah kota/provinsi + saringan provinsi; penjaga kontradiksi "menyangkal
// data tersedia"; alat debug search keyword. RED-first.

const ROWS_MATARAM = [
  { _id: 'd-lamtim', PROVINCE_NAME: 'LAMPUNG', CITY_NAME: 'LAMPUNG TIMUR', CITY_NAME_SI: 'Kab. Lampung Timur', DISTRICT_NAME: 'MATARAM BARU', SUBDISTRICT_NAME: 'X' },
  { _id: 'd-lamteng', PROVINCE_NAME: 'LAMPUNG', CITY_NAME: 'LAMPUNG TENGAH', CITY_NAME_SI: 'Kab. Lampung Tengah', DISTRICT_NAME: 'Y', SUBDISTRICT_NAME: 'MATARAM' },
  { _id: 'd-oki', PROVINCE_NAME: 'SUMATERA SELATAN', CITY_NAME: 'OGAN KOMERING ILIR', CITY_NAME_SI: 'Kab. Ogan Komering Ilir', DISTRICT_NAME: 'Z', SUBDISTRICT_NAME: 'MATARAM' },
];

describe('P0 — dominansi dibatalkan: >1 kandidat SELALU bertanya terbuka', () => {
  it('REPLAY mataram: level kecamatan "MATARAM BARU" TIDAK lagi menang diam-diam', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak?',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ambiguous'); // pra-P0: 'ok' ke Lampung Timur (BAHAYA)
    const grounding = await h.svc.getGroundingText('c1');
    // Format pertanyaan terbuka KETOK Bossfren 2026-08-05.
    expect(grounding).toContain('mana ya kak');
    expect(grounding).toContain('provinsinya');
    expect(grounding).toContain('kecamatannya');
    expect(grounding).not.toMatch(/\d{3,}/); // nol angka
  });

  it('jawaban provinsi yang mempersempit tapi belum tunggal → pertanyaan TERTUTUP dari subset', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak?',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');
    pesanBaru(h, 'm2', 'yang lampung kak');
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ambiguous');
    expect(res.candidates.map((c: any) => c.city).sort()).toEqual(['LAMPUNG TENGAH', 'LAMPUNG TIMUR']);
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('Lampung Timur'); // subset dibacakan tertutup
  });

  it('jawaban yang menunjuk kandidat unik → langsung dikutip', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak?',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');
    pesanBaru(h, 'm2', 'yang lampung timur kak');
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.city).toBe('LAMPUNG TIMUR');
  });
});

describe('P4 — ekstraktor pisah kota/provinsi + saringan provinsi', () => {
  it('provinsi disebut & TIDAK cocok kandidat mana pun → tanya kecamatan (bukan salah kota)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram nusa tenggara barat berapa kak?',
      extract: { kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('need_more_detail'); // sistem TAHU kotanya tenggelam
  });

  it('provinsi disebut & cocok SATU kandidat → langsung dikutip tanpa tanya', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram sumatera selatan berapa?',
      extract: { kota: 'Mataram', provinsi: 'Sumatera Selatan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.province).toBe('SUMATERA SELATAN');
  });

  it('singkatan provinsi dikenal: "NTB" = Nusa Tenggara Barat', () => {
    const { normalisasiProvinsi } = require('./shipping.service');
    expect(normalisasiProvinsi('NTB')).toBe('nusa tenggara barat');
    expect(normalisasiProvinsi('jabar')).toBe('jawa barat');
  });
});

describe('P2 — penjaga kontradiksi: menyangkal data yang sudah tersedia', () => {
  it('REPLAY: kutipan OK + "belum memiliki informasi ongkir… cek dengan tim logistik" → DITAHAN', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak?',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Mohon maaf, saya belum memiliki informasi ongkir ke Medan. Saya akan cek dengan tim logistik kami.',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('menyangkal');
  });

  it('giliran BUKAN uang → frasa yang sama tidak ditahan (cek garansi ke tim itu sah)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak?',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    pesanBaru(h, 'm2', 'kalau garansinya gimana kak?');
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // cache
    const out = await h.svc.resolvePriceTokens('c1', 'Untuk garansi saya cek dengan tim dulu ya kak 🙏');
    expect(out.ok).toBe(true);
  });

  it('telemetri mengenal kelas kontradiksi_data', () => {
    const { klasifikasiAlasanGate } = require('./shipping.service');
    expect(
      klasifikasiAlasanGate('Balasan menyangkal data yang sudah tersedia ("tim logistik") — jawab langsung memakai penanda.'),
    ).toBe('kontradiksi_data');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// >>> ANGGA — Q-CHAIN (2026-08-05, KETOK + MANDAT KERAS Bossfren, blueprint
// dok 08 v2): funnel pertanyaan berantai — jawaban uang WAJIB menutup dengan
// pertanyaan langkah berikutnya; langkah diturunkan dari data; pelanggaran
// DITAHAN gerbang. RED-first terhadap kode pra-Q-Chain.

describe('Q-Chain — funnel pertanyaan berantai (urutan pakem)', () => {
  it('TRACE 1: jawab HARGA (belum ada alamat) → wajib tanya alamat (ongkir saja)', async () => {
    const h = harness({
      lastCustomerText: 'harga golok sembelih multifungsi berapa kak?',
      extract: { kota: null, items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    h.svc.cacheProductPriceTokens('c1', { harga_produk_1: 'Rp150.000' });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('no_destination');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('alamat lengkapnya kak biar kami bantu hitung ongkirnya');
    expect(grounding).toContain('PERINGATAN KERAS');
    expect(grounding).not.toContain('total kirimannya'); // revisi Bossfren: ongkir SAJA
  });

  it('TRACE 2: jawab ONGKIR (qty belum pasti) → wajib tanya qty', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('mau ambil berapa pcs kak?');
  });

  it('TRACE 3a: qty pasti TANPA sebut metode ("jadi 2 ya kak") → TOTAL + tanya metode', async () => {
    const h = harness({
      lastCustomerText: 'jadi 2 ya kak',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }], { qtyPasti: true })],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('{{rincian_tagihan}}');
    expect(grounding).toContain('mau diproses COD atau transfer kak?');
  });

  it('TRACE 3b (v3): metode SUDAH disebut ("COD deh kak. beli 2 ya") → TOTAL + langsung tanya PATOKAN (bukan metode lagi)', async () => {
    const h = harness({
      lastCustomerText: 'COD deh kak. beli 2 ya',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }], { qtyPasti: true })],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    expect(h.orderLog.recordSnapshot).toHaveBeenCalledWith(
      'c1', 'm1', expect.objectContaining({ qtyPasti: true }), expect.anything(),
    );
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('{{rincian_tagihan}}');
    expect(grounding).toContain('patokan rumahnya');
    expect(grounding).not.toContain('mau diproses COD atau transfer kak?');
  });

  it('TRACE 3c (v3, revisi 2026-08-06): total sudah tersodor, pelanggan jawab metode → tanya PATOKAN saja, TANPA mengulang rincian total', async () => {
    const h = harness({
      lastCustomerText: 'cod aja kak',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 2 }], { qtyPasti: true })],
    });
    (h.orderLog.funnelAsks as jest.Mock).mockResolvedValue({ total: 1 });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('patokan rumahnya');
    // Total sudah pernah tersodor → directive TOTAL tidak diulang.
    expect(grounding).not.toContain('SODORKAN TOTAL SEKARANG');
    // REVISI (insiden "cod aja kak" → bot mengulang totalan lagi, 2026-08-06):
    // asumsi lama "katalog penanda tetap menyebut {{rincian_tagihan}} — itu
    // daftar, bukan perintah" TERBUKTI SALAH di produksi (model tetap
    // memakainya walau tanpa perintah eksplisit). Sekarang katalog kelas
    // total (baris "• {{token}} = ...") ikut dibuang di langkah patokan +
    // larangan keras eksplisit ditambahkan. (Catatan: {{rincian_tagihan}}
    // sebagai KATA masih bisa nongol di teks bridge ASUMSI-order lain yang
    // menyebutnya sebagai opsi penamaan barang — itu temuan audit grounding
    // terpisah, bukan bagian dari fix ini; yang fix ini jamin adalah baris
    // KATALOG-nya hilang dan gerbang menahan kalau model tetap menulisnya.)
    expect(grounding).not.toContain('• {{rincian_tagihan}} = BLOK rekap tagihan');
    expect(grounding).not.toContain('{{total_transfer}}');
    expect(grounding).not.toContain('{{total_cod}}');
    expect(grounding).toContain('LARANGAN KERAS GILIRAN INI: total/rincian tagihan SUDAH pernah disodorkan');
  });

  it('REPLAY "cod aja kak" (2026-08-06): gerbang MENAHAN draft yang mengulang rincian total di langkah PATOKAN', async () => {
    const h = harness({
      lastCustomerText: 'cod aja kak',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 2 }], { qtyPasti: true })],
    });
    (h.orderLog.funnelAsks as jest.Mock).mockResolvedValue({ total: 1 });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    await h.svc.getGroundingText('c1'); // funnelExpect langkah patokan tercatat
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Baik kak, jadi harga barang Rp150.000 x 2, subtotal, ongkir, dan totalnya:\n{{rincian_tagihan}}\nboleh dicantumkan patokan rumahnya dekat apa kak? 🙏',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('mengulang rincian total');
  });

  it('Q-Chain v3.1 (revisi Bossfren 2026-08-06): metode COD -> langkah PATOKAN minta ALAMAT LENGKAP sekaligus patokan, bukan patokan doang', async () => {
    const h = harness({
      lastCustomerText: 'COD deh kak. beli 2 ya',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }], { qtyPasti: true })],
    });
    (h.orderLog.funnelAsks as jest.Mock).mockResolvedValue({ total: 1 }); // total sudah pernah tersodor giliran lalu
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain(
      'boleh diinfokan alamat lengkapnya dan dicantumkan patokan rumahnya dekat apa kak? biar kurir gampang nemuin alamatnya 🙏☺️',
    );
    expect(grounding).not.toContain('{{rekening_transfer}}'); // COD: tidak ada urusan rekening

    const sah = await h.svc.resolvePriceTokens(
      'c1',
      'Baik kak, boleh diinfokan alamat lengkapnya dan dicantumkan patokan rumahnya dekat apa kak? biar kurir gampang nemuin alamatnya 🙏☺️',
    );
    expect(sah.ok).toBe(true);

    // Kalimat PATOKAN versi lama (cuma minta patokan, tanpa minta alamat
    // lengkap) TIDAK LAGI memenuhi kunci verbatim baru.
    const tertahan = await h.svc.resolvePriceTokens(
      'c1',
      'Baik kak, boleh dicantumkan patokan rumahnya dekat apa kak? biar kurir gampang nemuin alamatnya 🙏',
    );
    expect(tertahan.ok).toBe(false);
  });

  it('Q-Chain v3.1 (revisi Bossfren 2026-08-06): metode TRANSFER -> langkah PATOKAN minta alamat lengkap + patokan + rekening + konfirmasi bukti bayar', async () => {
    const rek = 'BCA 6765556680 a.n Cordova Digital Inovasi';
    const h = harness({
      lastCustomerText: 'transfer aja deh kak. beli 2 ya',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }], { qtyPasti: true })],
      oc: { orderGlobalTokens: { rekening_transfer: rek } },
    });
    (h.orderLog.funnelAsks as jest.Mock).mockResolvedValue({ total: 1 }); // total sudah pernah tersodor giliran lalu
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    // Grounding memuat kalimat template APA ADANYA — token rekening BELUM
    // disubstitusi di tahap ini (baru resolve saat draft model diverifikasi).
    expect(grounding).toContain('silakan info alamat lengkapnya dan cantumkan patokan rumahnya ya kak');
    expect(grounding).toContain('{{rekening_transfer}}');
    expect(grounding).toContain('konfirmasi bukti pembayarannya');

    const draft =
      'Baik kak, silakan info alamat lengkapnya dan cantumkan patokan rumahnya ya kak. kemudian untuk menyelesaikan pembayaran silakan transfer ke salah satu rekening berikut ini:\n{{rekening_transfer}}\njika sudah menyelesaikan pembayaran mohon konfirmasi bukti pembayarannya ya, terima kasih 😊';
    const out = await h.svc.resolvePriceTokens('c1', draft);
    // Kunci verbatim harus disubstitusi token DULU sebelum dibandingkan —
    // kalau tidak, "{{rekening_transfer}}" literal di kalimat wajib tidak
    // akan pernah cocok dengan nomor rekening asli yang tersisip di balasan.
    expect(out.ok).toBe(true);
    expect(out.text).toContain(rek); // nomor rekening tersisip sistem, bukan diketik model
  });

  it('v3: blok {{rincian_tagihan}} memuat estimasi tiba dari API (estimatedDate)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa? golok sembelih multifungsi 2 pcs',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 2 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens('c1', 'Ini ya kak:\n{{rincian_tagihan}}\nmau diproses COD atau transfer kak? 😊');
    expect(out.ok).toBe(true);
    expect(out.text).toContain('Estimasi tiba : 2-3 hari');
  });

  it('MANDAT KERAS: balasan tanpa kalimat funnel wajib → DITAHAN gerbang; dengan kalimatnya → lolos', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    await h.svc.getGroundingText('c1'); // directive tanya-qty tercatat utk giliran ini
    const bandel = await h.svc.resolvePriceTokens('c1', 'Ongkirnya {{ongkir}} ya kak untuk Golok Sembelih Multifungsi.');
    expect(bandel.ok).toBe(false);
    expect(bandel.issues.join(' ')).toContain('melanggar alur penjualan wajib');
    const taat = await h.svc.resolvePriceTokens(
      'c1',
      'Ongkirnya {{ongkir}} ya kak untuk Golok Sembelih Multifungsi. Mau ambil berapa pcs kak?',
    );
    expect(taat.ok).toBe(true);
  });

  it('KONKLUSI KERANJANG: 2 produk sudah dikutip → tanya "dua-duanya atau salah satu"; jawaban agregat → union', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa kak?',
      logEntries: [
        entry([{ productId: 'p-bedog', name: 'Bedog Betekok', qty: 1 }]),
        entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 2 }]),
      ],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('dua-duanya sekalian');
    expect(grounding).toContain('Bedog Betekok'); // {{daftar_produk}} diisi sistem

    pesanBaru(h, 'm2', 'dua-duanya sekalian dong kak');
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.matchedItems).toHaveLength(2);
    // Snapshot konklusi tercatat — funnel boleh maju.
    expect(h.orderLog.recordSnapshot).toHaveBeenCalledWith(
      'c1', 'm2', expect.objectContaining({ konklusi: true }), expect.anything(),
    );
  });

  it('anti-cerewet: langkah yang sudah ditanya 2x → tidak ditanya lagi', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    (h.orderLog.funnelAsks as jest.Mock).mockResolvedValue({ qty: 2 });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).not.toContain('mau ambil berapa pcs kak?');
  });

  it('belokan (giliran non-uang) → TANPA dorongan funnel', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    pesanBaru(h, 'm2', 'oh iya kak, itu bahannya apa ya?');
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // cache
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).not.toContain('PERINGATAN KERAS');
  });

  it('telemetri mengenal kelas funnel_dilanggar', () => {
    const { klasifikasiAlasanGate } = require('./shipping.service');
    expect(
      klasifikasiAlasanGate('Balasan melanggar alur penjualan wajib — tidak menutup dengan pertanyaan langkah "qty".'),
    ).toBe('funnel_dilanggar');
  });
});
// <<< ANGGA

// >>> ANGGA — Q-Chain fix (2026-08-05, REPLAY insiden "banyumas kak"): giliran
// yang menjawab pertanyaan pilihan kita SENDIRI ("Purwokertonya mana ya kak?"
// → "banyumas kak") tidak membawa kata uang, sehingga funnel directive, penjaga
// kontradiksi P2, dan gerbang F2 semua melompatinya — draft "saya akan cek dulu
// ya kak… konfirmasi ke admin" lolos TAK tertahan. Perbaikan: flag `viaPilihan`
// di turnMemo (giliran resolusi pilihan = giliran uang) + varian frasa
// kontradiksi beda urutan kata. RED-first terhadap kode pra-perbaikan.

const ROWS_PURWOKERTO = [
  { _id: 'd-bms', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'BANYUMAS', CITY_NAME_SI: 'Kab. Banyumas', DISTRICT_NAME: 'PURWOKERTO UTARA', SUBDISTRICT_NAME: 'X' },
  { _id: 'd-lamteng2', PROVINCE_NAME: 'LAMPUNG', CITY_NAME: 'LAMPUNG TENGAH', CITY_NAME_SI: 'Kab. Lampung Tengah', DISTRICT_NAME: 'PURWOKERTO', SUBDISTRICT_NAME: 'Y' },
];

describe('Q-Chain fix — REPLAY "banyumas kak": jawaban pilihan = giliran uang', () => {
  it('jawaban pilihan tujuan → funnel TETAP maju (tanya qty) walau tanpa kata uang', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa kak?',
      extract: { kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_PURWOKERTO,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'banyumas kak'); // persis jawaban pelanggan di insiden
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.city).toBe('BANYUMAS');
    const grounding = await h.svc.getGroundingText('c1');
    // Pra-fix: jawabanUang=false → directive absen → model bebas ngaco.
    expect(grounding).toContain('mau ambil berapa pcs kak?');
  });

  it('draft ngaco insiden ("saya akan cek dulu… konfirmasi ke admin") → DITAHAN', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa kak?',
      extract: { kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_PURWOKERTO,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');
    pesanBaru(h, 'm2', 'banyumas kak');
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');

    // Kutipan giliran ini SUDAH dihitung — draft di bawah (persis dari insiden)
    // menyangkalnya. Pra-fix lolos: 'banyumas kak' tak berkata uang (P2 skip)
    // dan 'saya akan cek dulu' beda urutan dari daftar 'akan saya cek dulu'.
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Baik kak, saya bantu cek ongkir ke Banyumas, Purwokerto 🙏 Untuk detail ongkir dan total biayanya, saya akan cek dulu ya kak. Nanti saya akan konfirmasi ke admin untuk memastikan biayanya.',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('menyangkal');
  });

  it('giliran BUKAN pilihan & bukan uang → frasa cek-dulu tetap sah (tidak salah tangkap)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak?',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    pesanBaru(h, 'm2', 'kalau garansinya gimana kak?');
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // cache
    const out = await h.svc.resolvePriceTokens('c1', 'Untuk garansi, saya akan cek dulu ke tim ya kak 🙏');
    expect(out.ok).toBe(true);
  });
});
// <<< ANGGA

// >>> ANGGA — koreksi 2026-08-06 (REPLAY insiden "Purwokertonya mana ya
// kak?" ditanya ULANG walau sudah pernah dijawab & menghasilkan ongkir):
// pelanggan disambiguasi Purwokerto -> Banyumas, lalu PINDAH ke tujuan lain,
// lalu BALIK LAGI menyebut "purwokerto" -- seharusnya langsung dipakai hasil
// lama, bukan ditanya ulang kecamatannya.
const ROWS_SOLO = [
  { _id: 'd-solo', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'SOLO', CITY_NAME_SI: 'Kota Solo', DISTRICT_NAME: 'X', SUBDISTRICT_NAME: 'Y' },
];

describe('Memori tujuan lintas-topik — REPLAY "Purwokertonya mana ya kak?" ditanya ulang', () => {
  it('balik ke istilah tujuan yang sudah pernah didisambiguasi (via jawaban pilihan) -> langsung dipakai, TIDAK tanya ulang', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_PURWOKERTO,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    // Giliran 2: jawab kecamatan -> resolve BANYUMAS (jalur `dipilih`).
    pesanBaru(h, 'm2', 'banyumas kak');
    const res2: any = await h.svc.quoteForConversation('c1');
    expect(res2.status).toBe('ok');
    expect(res2.quote.city).toBe('BANYUMAS');

    // Giliran 3: pelanggan pindah topik ke tujuan lain sama sekali (Solo).
    pesanBaru(h, 'm3', 'eh kalau ke solo aja deh, berapa ongkirnya?');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Solo', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) =>
      /solo/i.test(kw) ? ROWS_SOLO : ROWS_PURWOKERTO,
    );
    const res3: any = await h.svc.quoteForConversation('c1');
    expect(res3.status).toBe('ok');
    expect(res3.quote.city).toBe('SOLO');

    // Giliran 4: balik lagi ke "purwokerto" -- TIDAK boleh tanya ulang
    // kecamatan (padahal ROWS_PURWOKERTO sendiri masih ambigu kalau dicari
    // dari nol), dan TIDAK boleh memanggil searchAddress lagi untuk ini.
    const searchCallsSebelum = (h.mengantar.searchAddress as jest.Mock).mock.calls.length;
    pesanBaru(h, 'm4', '1 pcs aja kak jadinya ke purwokerto aja deh');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    const res4: any = await h.svc.quoteForConversation('c1');
    expect(res4.status).toBe('ok'); // pra-fix: 'ambiguous' (tanya ulang kecamatan)
    expect(res4.quote.city).toBe('BANYUMAS');
    expect((h.mengantar.searchAddress as jest.Mock).mock.calls.length).toBe(searchCallsSebelum);
  });
});
// <<< ANGGA

// >>> ANGGA — koreksi 2026-08-06 (audit lanjutan, REPLAY laporan Bossfren
// langsung: "sandubaya udah disebutin dan udah info ongkirnya, tapi pas aku
// ganti ke purwokerto trus ganti ke sandubaya eh malah jawabnya ngaco...
// nanya lagi sandubaya mana... malah muter lagi"). BEDA dari REPLAY
// "Purwokertonya mana ya kak?" di atas: di situ pelanggan balik pakai
// istilah LUAS yang SAMA PERSIS ("purwokerto") dengan yang tersimpan. Di
// sini pelanggan disambiguasi via istilah SPESIFIK ("sandubaya") yang
// ekstraktor petakan balik jadi istilah LUAS ("mataram") saat disimpan
// (lihat komentar "JAWABAN KECAMATAN" / "insiden sandubaya kak" di kode) —
// lalu pelanggan balik lagi memakai istilah SPESIFIK itu sendiri, yang
// SEBELUM fix ini TIDAK PERNAH tersimpan sebagai kunci recall.
describe('Memori tujuan istilah SPESIFIK — REPLAY laporan Bossfren "sandubaya/purwokerto bolak-balik"', () => {
  it('balik ke istilah SPESIFIK ("sandubaya") yang dipakai menjawab disambiguasi (bukan istilah luas "mataram" yang tersimpan) -> langsung dipakai, TIDAK tanya ulang', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    // Giliran 2: jawab "sandubaya kak" -> resolve via GABUNG DUA JAWABAN.
    // Ekstraktor memetakan balik ke kota="Mataram" (persis insiden nyata).
    pesanBaru(h, 'm2', 'sandubaya kak');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) => {
      if (/^sandubaya mataram$/i.test(kw))
        return [
          { _id: 'd-sdb1', PROVINCE_NAME: 'NUSA TENGGARA BARAT (NTB)', CITY_NAME: 'MATARAM', CITY_NAME_SI: 'Kota Mataram', DISTRICT_NAME: 'SANDUBAYA (SANDUJAYA)', SUBDISTRICT_NAME: 'DASAN CERMEN' },
          { _id: 'd-sdb2', PROVINCE_NAME: 'NUSA TENGGARA BARAT (NTB)', CITY_NAME: 'MATARAM', CITY_NAME_SI: 'Kota Mataram', DISTRICT_NAME: 'SANDUBAYA (SANDUJAYA)', SUBDISTRICT_NAME: 'BERTAIS' },
        ];
      if (/^sandubaya$/i.test(kw)) return []; // persis data API nyata: kata polos sendirian = 0 baris
      if (/purwokerto/i.test(kw))
        return [{ _id: 'd-pwt', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'BANYUMAS', CITY_NAME_SI: 'Kab. Banyumas', DISTRICT_NAME: 'PURWOKERTO TIMUR', SUBDISTRICT_NAME: 'X' }];
      return ROWS_MATARAM;
    });
    const res2: any = await h.svc.quoteForConversation('c1');
    expect(res2.status).toBe('ok');
    expect(res2.quote.city).toBe('MATARAM');

    // Giliran 3: pelanggan pindah ke tujuan lain sama sekali (Purwokerto).
    pesanBaru(h, 'm3', 'waduh mahal ya, kalau gitu ke purwokerto aja berapa kak?');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    const res3: any = await h.svc.quoteForConversation('c1');
    expect(res3.status).toBe('ok');
    expect(res3.quote.city).not.toBe('MATARAM');

    // Giliran 4: balik lagi ke "sandubaya" -- istilah SPESIFIK, BUKAN "mataram"
    // yang tersimpan di giliran 2. TIDAK boleh tanya ulang / cari ulang dari
    // nol (yang di data API nyata bakal gagal lagi -- "sandubaya" sendirian
    // = 0 baris, cuma gabungan "sandubaya mataram" yang presisi).
    const searchCallsSebelum = (h.mengantar.searchAddress as jest.Mock).mock.calls.length;
    pesanBaru(h, 'm4', '1 pcs aja kak jadinya ke sandubaya aja deh');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Sandubaya', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    const res4: any = await h.svc.quoteForConversation('c1');
    expect(res4.status).toBe('ok'); // pra-fix: 'need_more_detail' -> "Sandubayanya mana ya kak?"
    expect(res4.quote.city).toBe('MATARAM');
    expect((h.mengantar.searchAddress as jest.Mock).mock.calls.length).toBe(searchCallsSebelum);
  });
});
// <<< ANGGA

// >>> ANGGA — koreksi 2026-08-06 (audit lanjutan #2, pertanyaan tajam
// Bossfren: "kenapa gak digabung jawaban1+jawaban2 aja jadi kuncinya?").
// Jawabannya bukan "gabung", tapi pertanyaan itu nyenggol lubang beneran di
// fix #29: kalau kata jawaban pelanggan yang cocok kandidat kebetulan kata
// generik administratif/provinsi (mis. "jawa"/"tengah" nempel di label "Kab.
// Banyumas, JAWA TENGAH"), fix #29 (tanpa penyaring) akan ikut menyimpannya
// sebagai kunci recall — bahaya kalau percakapan LAIN nanti kebetulan
// menyebut kata seumum itu, bisa diam-diam kepakai tujuan LAMA yang salah
// (bukan cuma nanya ulang — bisa nyodorin ongkir KELIRU tanpa ketahuan).
describe('Penyaring kunci recall — kata generik provinsi/arah TIDAK ikut diingat (audit lanjutan #2)', () => {
  it('jawaban "banyumas kak, yang di jawa tengah itu" -> "banyumas" diingat, "jawa"/"tengah" TIDAK', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa kak?',
      extract: { kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_PURWOKERTO, // 'Kab. Banyumas, JAWA TENGAH' vs 'Kab. Lampung Tengah, LAMPUNG'
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'banyumas kak, yang di jawa tengah itu');
    const res2: any = await h.svc.quoteForConversation('c1');
    expect(res2.status).toBe('ok');
    expect(res2.quote.city).toBe('BANYUMAS');

    // Kata spesifik & distingtif TETAP diingat (memenuhi fix #29).
    expect(h.cache.recallDestinationTerm('c1', 'banyumas')).not.toBeNull();
    // Kata generik provinsi/arah TIDAK ikut diingat (fix lubang #29 ini).
    expect(h.cache.recallDestinationTerm('c1', 'jawa')).toBeNull();
    expect(h.cache.recallDestinationTerm('c1', 'tengah')).toBeNull();
  });

  // >>> ANGGA — catatan jujur: jalur `jawabanPolosTujuan` (jawaban kecamatan,
  // "sandubaya kak") berhenti di kata jawaban PERTAMA yang berhasil resolve
  // (short-circuit) -- kata sesudahnya tidak pernah dicoba sama sekali, jadi
  // tidak lewat penyaring STOPWORDS ataupun tidak, ia memang tidak pernah
  // sampai diingat. Tes ini HANYA membuktikan kata SPESIFIK yang benar-benar
  // dipakai resolve (di posisi pertama) tetap diingat seperti mestinya --
  // bukti utama penyaring stopword ada di tes pertama di atas (jalur
  // `dipilih`, yang menyisir SEMUA kata jawaban, bukan cuma kata pertama).
  it('jalur jawaban-kecamatan ("sandubaya mataram"): kata spesifik yang berhasil resolve tetap diingat', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'sandubaya kak');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) => {
      if (/sandubaya/i.test(kw))
        return [
          { _id: 'd-sdb1', PROVINCE_NAME: 'NUSA TENGGARA BARAT (NTB)', CITY_NAME: 'MATARAM', CITY_NAME_SI: 'Kota Mataram', DISTRICT_NAME: 'SANDUBAYA (SANDUJAYA)', SUBDISTRICT_NAME: 'DASAN CERMEN' },
        ];
      return ROWS_MATARAM;
    });
    const res2: any = await h.svc.quoteForConversation('c1');
    expect(res2.status).toBe('ok');
    expect(res2.quote.city).toBe('MATARAM');

    expect(h.cache.recallDestinationTerm('c1', 'sandubaya')).not.toBeNull();
  });
});
// <<< ANGGA

// >>> ANGGA — koreksi 2026-08-06 (REPLAY insiden "GSM Naga Merah" nyasar ke
// order "bedog betekok, bedog sicepot"): grounding kutipan penuh wajib
// menyebut nama barang order SECARA EKSPLISIT & WAJIB (bukan cuma via token
// opsional {{rincian_order}}), supaya model tidak menebak nama dari produk
// LAIN yang kebetulan disebut di blok stok (harga boleh sama/mirip).
describe('Jangkar nama barang di grounding — REPLAY insiden "GSM Naga Merah" nyasar ke order lain', () => {
  it('kutipan penuh (matchedItems > 0) menyebut nama barang order SECARA PASTI, eksplisit & wajib', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? bedog betekok 1 pcs',
      extract: { kota: 'Medan', items: [{ nama: 'Bedog Betekok', qty: 1 }] },
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('Bedog Betekok');
    expect(grounding).toContain('SECARA PASTI');
    expect(grounding).toContain('JANGAN pakai nama produk lain');
  });
});
// <<< ANGGA

// >>> ANGGA — Q-Chain fix 2 (2026-08-05, REPLAY insiden "mataram dobel"):
// draft nyata pada giliran "ongkir ke mataram berapa?" (qty BELUM pasti)
// menyodorkan blok tagihan lengkap + total transfer/COD SEBELUM qty dijawab
// (keluar pakem, MANDAT KERAS Bossfren: "ditotalin itu jika qty udah jelas
// dijawab") DAN bernarasi teater "saya cek dulu… mohon tunggu… saya proses
// dulu… setelah saya cek" padahal angkanya tertulis di pesan yang sama.
// Fix: (1) langkah PRA-TOTAL → katalog kelas total disensor + gerbang menahan
// pemakaiannya; (2) penjaga anti-teater (kontradiksi dalam satu pesan).

describe('Q-Chain fix 2 — REPLAY "mataram dobel": total prematur + teater proses', () => {
  it('langkah PRA-TOTAL: katalog total DISENSOR dari grounding (qty belum pasti)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('mau ambil berapa pcs kak?'); // funnel tetap jalan
    // Pra-fix: seluruh katalog total ikut ditawarkan walau langkahnya qty.
    expect(grounding).not.toContain('{{rincian_tagihan}}');
    expect(grounding).not.toContain('{{total_transfer}}');
    expect(grounding).not.toContain('{{subtotal_barang}}');
    expect(grounding).toContain('LARANGAN KERAS GILIRAN INI');
  });

  it('gerbang MENAHAN total yang disodorkan sebelum qty pasti (walau modelnya nulis sendiri)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    await h.svc.getGroundingText('c1'); // funnelExpect langkah qty tercatat
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Ongkirnya {{ongkir}} ya kak untuk Golok Sembelih Multifungsi. Jadi totalnya:\n{{rincian_tagihan}}\nmau ambil berapa pcs kak?',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('belum waktunya menyodorkan total');
  });

  it('ANTI-TEATER: "saya cek dulu… mohon tunggu… setelah saya cek" + angka di pesan yang sama → DITAHAN', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Baik kak, saya cek dulu ongkir ke Medan ya 🙏 Mohon tunggu sebentar ya kak, saya proses dulu 🕒 Setelah saya cek, ongkirnya {{ongkir}} untuk Golok Sembelih Multifungsi. Mau ambil berapa pcs kak?',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('berpura-pura masih mengecek');
  });

  it('REPLAY "cakranegara kak": anti-cerewet TIDAK membuka gembok total (qty sudah 2x ditanya)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    (h.orderLog.funnelAsks as jest.Mock).mockResolvedValue({ qty: 2 }); // cap kena
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).not.toContain('mau ambil berapa pcs kak?'); // pertanyaan baku dibungkam
    // Pra-fix: cap → directive null → sensor mati → katalog total ikut tampil.
    expect(grounding).not.toContain('{{rincian_tagihan}}');
    expect(grounding).not.toContain('{{total_transfer}}');
    expect(grounding).toContain('LARANGAN KERAS');
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Baik kak, untuk pengiriman ke Medan:\n{{rincian_tagihan}}',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('belum waktunya menyodorkan total');
  });

  it('kontrol: giliran TOTAL (qty pasti + metode terjawab) → {{rincian_tagihan}} tetap sah', async () => {
    const h = harness({
      lastCustomerText: 'COD deh kak. beli 2 ya',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }], { qtyPasti: true })],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('{{rincian_tagihan}}'); // langkah total: TIDAK disensor
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Ini ya kak:\n{{rincian_tagihan}}\nboleh diinfokan alamat lengkapnya dan dicantumkan patokan rumahnya dekat apa kak? biar kurir gampang nemuin alamatnya 🙏☺️',
    );
    expect(out.ok).toBe(true);
  });

  it('kontrol: frasa teater TANPA angka di pesan yang sama → tidak salah tangkap', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Untuk stok warna lain mohon tunggu sebentar ya kak, saya cek dulu ke admin 🙏',
    );
    expect(out.ok).toBe(true);
  });
});
// <<< ANGGA

// >>> ANGGA — AUDIT TOTAL (2026-08-05, REPLAY insiden "ongkir ke purwokerto?"
// dijawab data MATARAM Rp50.000): akar = ekstraksi tujuan GAGAL (LLM error/
// JSON rusak) dikembalikan sebagai "kosong" → fallback `cached?.city` diam-diam
// memakai kota LAMA → cache-hit → penanda uang kota lama tersedia → model
// melabeli kota BARU dengan angka kota lama, dan gerbang tak bisa menangkap
// (semua digit hasil sisipan sah). Fix: gagal ≠ kosong (flag `failed`); giliran
// ber-hint tempat/order + ekstraksi gagal → JUJUR api_error (grounding UNKNOWN,
// nol angka). Plus: melempar pelanggan ke ekspedisi = frasa haram.

describe('AUDIT TOTAL — REPLAY "purwokerto dijawab data mataram"', () => {
  it('ekstraksi GAGAL + giliran ber-hint tempat → api_error JUJUR, BUKAN kutipan kota lama', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // kutipan MEDAN aktif

    // Giliran 2: pelanggan pindah kota, ekstraktor MATI (timeout) — persis
    // kelas insiden: pra-fix jatuh ke kota lama & menjawab seolah beres.
    pesanBaru(h, 'm2', 'ongkir ke purwokerto berapa?');
    (h.provider.chat as jest.Mock).mockRejectedValue(new Error('timeout'));
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('api_error'); // pra-fix: 'ok' berisi kutipan MEDAN (BAHAYA)
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('BELUM bisa memastikan tarif'); // UNKNOWN jujur
    expect(grounding).not.toContain('{{ongkir}}'); // nol penanda uang kota lama
    // Kutipan lama ikut dikosongkan — model yang nekat menulis {{ongkir}}
    // TIDAK mendapat angka MEDAN, drafnya ditahan (penanda tak dikenal).
    const out = await h.svc.resolvePriceTokens('c1', 'Ongkirnya {{ongkir}} ya kak 🙏');
    expect(out.ok).toBe(false);
  });

  it('ekstraksi gagal TANPA hint tempat (basa-basi) → tidak ikut kena (cache tetap sah)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    pesanBaru(h, 'm2', 'oke kak makasih infonya');
    (h.provider.chat as jest.Mock).mockRejectedValue(new Error('timeout'));
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok'); // cache-hit tanpa hint — tidak ada risiko salah kota
  });

  it('melempar pelanggan ke "website resmi ekspedisi / cs ekspedisi" → DITAHAN', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Ongkirnya {{ongkir}} ya kak untuk Golok Sembelih Multifungsi. Kalau mau lebih detail bisa cek di website resmi ekspedisi ya kak 🙏 mau ambil berapa pcs kak?',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('istilah internal');
  });
});
// <<< ANGGA

// >>> ANGGA — TANGGA BARANG TERBUKA (2026-08-05, ketok Bossfren, REPLAY insiden
// "kalau golok sembelih berapa kak?" dijawab "konfirmasi dulu ke admin"):
// (1) giliran uang yang menyebut nama produk katalog tidak boleh ditelan
// cache/log-hit — wajib turun ke tangga BARANG; (2) cocok TEPAT 2 → tertutup
// "A atau B?"; cocok >2 → TERBUKA "X-nya yang mana ya kak?" tanpa daftar.

const GOLOK2 = {
  id: 'p-golok2', sku: 'GLK-03', name: 'Golok Sembelih Super', category: 'golok',
  description: '', price: 199000, weightGrams: null, status: 'active',
};
const GOLOK3 = {
  id: 'p-golok3', sku: 'GLK-04', name: 'Golok Sembelih Mini', category: 'golok',
  description: '', price: 99000, weightGrams: null, status: 'active',
};

describe('Tangga BARANG terbuka — REPLAY "golok sembelih" → "konfirmasi ke admin"', () => {
  it('giliran uang menyebut produk ambigu + cache hangat → item_ambiguous, TERBUKA tanpa daftar; jawaban pemilih → resolve', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      products: [GOLOK, GOLOK2, GOLOK3, BEDOG],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // kutipan MEDAN hangat

    pesanBaru(h, 'm2', 'kalau golok sembelih berapa kak?');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: null, items: [{ nama: 'Golok Sembelih', qty: 1 }] }),
    );
    const res: any = await h.svc.quoteForConversation('c1');
    // Pra-fix: cache-hit menelan giliran ini → 'ok' → model mentok → "cek admin".
    expect(res.status).toBe('item_ambiguous');
    expect(res.itemCandidates.length).toBe(3);
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('yang mana ya kak'); // pertanyaan TERBUKA pola ketok
    expect(grounding).toContain('Golok Sembelih');
    expect(grounding).not.toContain('Golok Sembelih Super'); // daftar TIDAK dibacakan

    pesanBaru(h, 'm3', 'yang multifungsi kak');
    const res3: any = await h.svc.quoteForConversation('c1');
    expect(res3.status).toBe('ok');
    expect(res3.quote.matchedItems[0].name).toBe('Golok Sembelih Multifungsi');
  });

  it('cocok TEPAT 2 produk → pertanyaan TERTUTUP "A atau B" (dua-duanya dibacakan)', async () => {
    const h = harness({
      lastCustomerText: 'harga golok sembelih berapa kak? kirim ke medan',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih', qty: 1 }] },
      products: [GOLOK, GOLOK2, BEDOG],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('item_ambiguous');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('Golok Sembelih Multifungsi');
    expect(grounding).toContain('Golok Sembelih Super');
  });
});
// <<< ANGGA

// >>> ANGGA — REPLAY insiden "GSM Naga Merah" (2026-08-05): percakapan lahir
// dari FORM (penawaran Bedog) → "ongkir ke mataram?" → jawab qty "1 aja kak".
// Pra-fix: (a) funnel tak menghitung penawaran form sebagai barang → tanya
// "produknya mana" (bebal); (b) jawaban qty polos ditelan cache ongkir-doang →
// sistem tak pernah tahu barangnya → model ngarang produk lain dari katalog.

describe('Jalur FORM → ongkir → qty (REPLAY "GSM Naga Merah")', () => {
  it('jawaban-pilihan kota → tanya QTY (bukan "produknya mana"); "1 aja kak" → kutipan penuh + TOTAL', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa?',
      extract: { kota: 'Purwokerto', items: [] },
      addresses: ROWS_PURWOKERTO,
      offers: [offer([{ productId: 'p-bedog', name: 'Bedog Betekok' }])],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    // Jawaban pilihan kota — dulu ongkir-doang; kini UPGRADE otomatis ke
    // kutipan penuh (barang tunggal dikenal dari penawaran form, 2026-08-06).
    pesanBaru(h, 'm2', 'banyumas kak');
    const r2: any = await h.svc.quoteForConversation('c1');
    expect(r2.status).toBe('ok');
    expect(r2.quote.shippingOnly).toBe(false);
    expect(r2.quote.matchedItems[0]).toEqual(expect.objectContaining({ name: 'Bedog Betekok' }));
    const g2 = await h.svc.getGroundingText('c1');
    expect(g2).toContain('mau ambil berapa pcs kak?'); // pra-fix: "produknya mau yang mana kak?" (bebal)
    expect(g2).not.toContain('produknya mau yang mana kak?');

    // Jawaban qty polos — pra-fix DITELAN cache ongkir-doang → model ngarang produk.
    pesanBaru(h, 'm3', '1 aja kak');
    (h.provider.chat as jest.Mock).mockResolvedValue(JSON.stringify({ kota: null, items: [] }));
    const r3: any = await h.svc.quoteForConversation('c1');
    expect(r3.status).toBe('ok');
    expect(r3.quote.shippingOnly).toBe(false); // naik kelas: kutipan penuh dari penawaran form
    expect(r3.quote.matchedItems).toEqual([
      expect.objectContaining({ name: 'Bedog Betekok', qty: 1 }),
    ]);

    // Snapshot giliran ini ter-persist (qtyPasti dari "1 aja") — tiru untuk
    // pembacaan funnel berikutnya (mock candidates statis).
    (h.orderLog.candidates as jest.Mock).mockResolvedValue([
      entry([{ productId: 'p-bedog', name: 'Bedog Betekok', qty: 1 }], { qtyPasti: true }),
    ]);
    const g3 = await h.svc.getGroundingText('c1');
    expect(g3).toContain('{{rincian_tagihan}}'); // qty pasti → SODORKAN TOTAL
    expect(g3).toContain('mau diproses COD atau transfer kak?');
  });
});
// <<< ANGGA

// >>> ANGGA — GERBANG PAKEM (2026-08-05, KETOK Bossfren): pakem v3 + blueprint
// ongkir jujur + blueprint produk jujur DIANGKAT jadi lapisan gerbang (bukan
// sekadar prompt) — pelanggaran → feedback → revisi → mode Draft ditahan /
// AI ON kirim revisiannya (mekanisme retry gerbang uang yang sudah ada).

describe('GERBANG PAKEM — pakem & kejujuran jadi lapisan gerbang', () => {
  it('#1 ANTI-NGARANG PRODUK: angka kutipan ditempel ke produk lain → DITAHAN; sebut produk order → sah', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const buruk = await h.svc.resolvePriceTokens(
      'c1',
      'Untuk Bedog Betekok totalnya {{total_transfer}} ya kak. mau ambil berapa pcs kak?',
    );
    expect(buruk.ok).toBe(false);
    expect(buruk.issues.join(' ')).toContain('menempelkan angka kutipan ke produk yang salah');
    const baik = await h.svc.resolvePriceTokens(
      'c1',
      'Untuk Golok Sembelih Multifungsi totalnya {{total_transfer}} ya kak. mau ambil berapa pcs kak?',
    );
    expect(baik.issues.join(' ')).not.toContain('menempelkan angka kutipan');
  });

  it('#2 KOTA AMBIGU: draft wajib memuat pertanyaan terbuka ketok', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak?',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');
    await h.svc.getGroundingText('c1'); // kewajiban kalimat tercatat
    const buruk = await h.svc.resolvePriceTokens('c1', 'Wah untuk Mataram aku bantu pastikan dulu ya kak 🙏');
    expect(buruk.ok).toBe(false);
    expect(buruk.issues.join(' ')).toContain('melanggar alur');
    const baik = await h.svc.resolvePriceTokens(
      'c1',
      'Mataramnya mana ya kak? boleh sebut provinsinya, atau langsung kecamatannya 🙏',
    );
    expect(baik.ok).toBe(true);
  });

  it('#3 BARANG AMBIGU (>2): draft wajib memuat pertanyaan terbuka "yang mana"', async () => {
    const h = harness({
      lastCustomerText: 'harga golok sembelih berapa kak? kirim ke medan',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih', qty: 1 }] },
      products: [GOLOK, GOLOK2, GOLOK3, BEDOG],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('item_ambiguous');
    await h.svc.getGroundingText('c1');
    const buruk = await h.svc.resolvePriceTokens('c1', 'Golok sembelihnya ready kak, mau dikirim ke mana?');
    expect(buruk.ok).toBe(false);
    const baik = await h.svc.resolvePriceTokens('c1', 'Golok Sembelih-nya yang mana ya kak? 🙏');
    expect(baik.ok).toBe(true);
  });

  it('#4 GAGAL JUJUR: sistem gagal → draft wajib eskalasi "ke admin"', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    (h.mengantar.searchAddress as jest.Mock).mockResolvedValue(null); // API mati
    const res: any = await h.svc.quoteForConversation('c1');
    expect(['api_error', 'not_configured', 'no_courier']).toContain(res.status);
    await h.svc.getGroundingText('c1');
    const buruk = await h.svc.resolvePriceTokens('c1', 'Sebentar ya kak, ongkirnya menyusul 🙏');
    expect(buruk.ok).toBe(false);
    const baik = await h.svc.resolvePriceTokens('c1', 'Ongkirnya aku cek dulu ke admin ya kak 🙏');
    expect(baik.ok).toBe(true);
  });
});
// <<< ANGGA

// >>> ANGGA — JAWABAN KECAMATAN (2026-08-05, REPLAY insiden "sandubaya kak",
// TERBUKTI DARI LOG): kita minta kecamatan, pelanggan patuh menjawab
// "Sandubaya kak" — tapi ekstraktor memetakan balik ke kota=Mataram → search
// "mataram" → saringan provinsi menolak semua → need_more_detail selamanya.
// Fix: kata-kata JAWABAN pelanggan dicoba sebagai kata kunci search sendiri.

describe('JAWABAN KECAMATAN — REPLAY "sandubaya kak"', () => {
  it('jawaban kecamatan dipakai sebagai kata kunci search → resolve Kota Mataram NTB + funnel lanjut', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak?',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'sandubaya kak');
    // Persis log insiden: ekstraktor memetakan jawaban balik ke kota Mataram.
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) =>
      /sandubaya/i.test(kw)
        ? [{ _id: 'd-sdb', PROVINCE_NAME: 'NUSA TENGGARA BARAT', CITY_NAME: 'MATARAM', CITY_NAME_SI: 'Kota Mataram', DISTRICT_NAME: 'SANDUBAYA', SUBDISTRICT_NAME: 'X' }]
        : ROWS_MATARAM,
    );
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok'); // pra-fix: need_more_detail selamanya
    expect(res.quote.province).toBe('NUSA TENGGARA BARAT');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('mau ambil berapa pcs kak?'); // funnel lanjut (viaPilihan)
  });

  it('giliran minta-kecamatan: draft menggantung "konfirmasi ke admin" → DITAHAN; kalimat terkunci verbatim → sah', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram nusa tenggara barat berapa kak?',
      extract: { kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('need_more_detail');
    await h.svc.getGroundingText('c1');
    const buruk = await h.svc.resolvePriceTokens('c1', 'Untuk ongkirnya, saya akan bantu konfirmasi dulu ke admin ya kak 🙏');
    expect(buruk.ok).toBe(false);
    // >>> ANGGA — fix (2026-08-06, insiden "Kab. Purwokerto ngaco"): tangga
    // minta-kecamatan DULU cuma butuh substring bebas "kecamatan" di mana
    // pun (draft "Boleh sebut kecamatannya kak?" lolos) — sekarang kalimat
    // dikunci VERBATIM (dirakit dari result.keyword) supaya model tidak bisa
    // mengarang teks bebas di sekelilingnya (lihat setExpectGiliran). <<<
    const nm = (res.keyword ?? '').trim() || 'tujuannya';
    const rapi = nm.charAt(0).toUpperCase() + nm.slice(1);
    const kalimatWajib = `${rapi}nya itu kecamatan apa ya kak?`;
    const baik = await h.svc.resolvePriceTokens('c1', `Baik kak, ${kalimatWajib}`);
    expect(baik.ok).toBe(true);
  });
});
// <<< ANGGA

// >>> ANGGA — REPLAY LIVE (2026-08-06, laporan Bossfren "kumat lagi abis 2
// perbaikan terakhir"): honorifik "kakak" (BUKAN "kak" yang sudah difilter)
// lolos dari stopword `generik` (>=4 karakter, tidak match "kak"/"kk") ->
// kataJawaban jadi 2 kata ["sandubaya","kakak"] -> memicu cabang frasa-utuh
// (fix d0b0f0e) yang SIA-SIA ("kakak" bukan istilah lokasi apa pun, frasa
// gabungan pasti nol hasil) sebelum jatuh ke loop kata-per-kata lama —
// pemborosan 1-2 panggilan API pencarian tambahan per giliran yang TIDAK
// PERNAH terjadi sebelum fix itu ada. "kakak" ditambahkan ke stopword
// generik (sejajar "kak"/"mas"/"bang" yang sudah ada) supaya jawaban
// sesederhana "sandubaya kakak" berperilaku IDENTIK dengan "sandubaya kak"
// yang sudah lama terbukti aman — bukan tambal khusus "kakak", tapi
// melengkapi daftar honorifik yang memang seharusnya bukan kata kunci
// lokasi. <<<
describe('REPLAY live 2026-08-06 — honorifik "kakak" lolos filter, memicu frasa-utuh sia-sia', () => {
  it('"sandubaya kakak" resolve LANGSUNG ke Kota Mataram NTB, TANPA memicu pencarian frasa gabungan sia-sia', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak?',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'sandubaya kakak');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) =>
      /sandubaya/i.test(kw)
        ? [{ _id: 'd-sdb', PROVINCE_NAME: 'NUSA TENGGARA BARAT', CITY_NAME: 'MATARAM', CITY_NAME_SI: 'Kota Mataram', DISTRICT_NAME: 'SANDUBAYA', SUBDISTRICT_NAME: 'X' }]
        : ROWS_MATARAM,
    );
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.province).toBe('NUSA TENGGARA BARAT');
    // Diagnostik akar sebab: kalau "kakak" TIDAK difilter, kode akan
    // memanggil searchAddress dengan frasa "sandubaya kakak" (sia-sia) DULU
    // sebelum jatuh ke kata polos "sandubaya" — panggilan API ekstra yang
    // tidak pernah ada di jalur "sandubaya kak" yang sudah lama aman.
    const semuaKeyword = (h.mengantar.searchAddress as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(semuaKeyword.some((kw) => /kakak/i.test(kw))).toBe(false);
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('mau ambil berapa pcs kak?'); // funnel lanjut (viaPilihan)
  });
});
// <<< ANGGA

// >>> ANGGA — GABUNG DUA JAWABAN (2026-08-05 malam, KETOK BOSSFREN, dibuktikan
// di API NYATA via widget): "kota mataram" = NOL baris (varian jenis-kota
// DICABUT), tapi "sandubaya mataram" = 7 baris presisi Kota Mataram NTB.
// Saat stuck: jawaban kedua + konteks pertama digabung jadi SATU keyword.

describe('GABUNG DUA JAWABAN — "sandubaya mataram" (data API nyata)', () => {
  it('jawaban kecamatan digabung kota konteks → search presisi → resolve + funnel lanjut', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke mataram berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Mataram', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_MATARAM,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'sandubaya kak');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Mataram', provinsi: 'Nusa Tenggara Barat', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    // Persis perilaku API nyata (widget Bossfren): gabungan presisi, kata
    // polos sendirian TIDAK dites kemurahannya (dibuat gagal di mock ini
    // supaya terbukti jalur GABUNGAN yang dipakai).
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) => {
      if (/^sandubaya mataram$/i.test(kw))
        return [
          { _id: 'd-sdb1', PROVINCE_NAME: 'NUSA TENGGARA BARAT (NTB)', CITY_NAME: 'MATARAM', CITY_NAME_SI: 'Kota Mataram', DISTRICT_NAME: 'SANDUBAYA (SANDUJAYA)', SUBDISTRICT_NAME: 'DASAN CERMEN' },
          { _id: 'd-sdb2', PROVINCE_NAME: 'NUSA TENGGARA BARAT (NTB)', CITY_NAME: 'MATARAM', CITY_NAME_SI: 'Kota Mataram', DISTRICT_NAME: 'SANDUBAYA (SANDUJAYA)', SUBDISTRICT_NAME: 'BERTAIS' },
        ];
      if (/^sandubaya$/i.test(kw)) return [];
      return ROWS_MATARAM;
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok'); // pra-ketok: need_more_detail selamanya
    expect(res.quote.city).toBe('MATARAM');
    expect(h.mengantar.searchAddress).toHaveBeenCalledWith('sandubaya mataram');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('mau ambil berapa pcs kak?');
  });
});
// <<< ANGGA

// >>> ANGGA — GANTI TUJUAN URUTAN TERBALIK (2026-08-06, REPLAY insiden "mahal
// ya, ke purwokerto aja deh berapa ongkirnya?" dijawab ongkir MATARAM):
// PLACE_HINT tak mengenali "berapa ongkirnya" (terbalik) / "ke X aja deh" →
// giliran ketelan cache → angka kota lama nempel ke kota baru.

describe('Ganti tujuan urutan terbalik — REPLAY "ke purwokerto aja deh"', () => {
  it('"mahal ya, ke purwokerto aja deh berapa ongkirnya?" → TIDAK ditelan cache; resolve ulang', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // kutipan MEDAN hangat

    pesanBaru(h, 'm2', 'mahal ya, ke purwokerto aja deh berapa ongkirnya?');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) =>
      /purwokerto/i.test(kw) ? ROWS_PURWOKERTO : [{
        _id: 'dest-medan', PROVINCE_NAME: 'SUMATERA UTARA', CITY_NAME: 'MEDAN',
        CITY_NAME_SI: 'Kota Medan', DISTRICT_NAME: 'X', SUBDISTRICT_NAME: 'Z',
      }],
    );
    const res: any = await h.svc.quoteForConversation('c1');
    // Pra-fix: 'ok' berisi kutipan MEDAN → "ongkir ke Purwokerto Rp<medan>" (BAHAYA).
    expect(res.status).toBe('ambiguous'); // purwokerto 2 kandidat → tanya jujur
  });
});
// <<< ANGGA

// >>> ANGGA — GERBANG REKENING (2026-08-06, REPLAY insiden "sandubaya 1 pcs"):
// draft menulis nomor BCA/BRI/Mandiri ASLI padahal metode bayar belum
// ditanya-jawab. Pakem: rekening HANYA setelah pelanggan memilih transfer;
// deretan digit panjang haram diketik model sendiri (wajib penanda kamus).

describe('GERBANG REKENING — rekening hanya setelah pilih transfer', () => {
  it('nomor rekening diketik mentah + metode belum dijawab → DITAHAN (dua pelanggaran)', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Ongkirnya {{ongkir}} ya kak untuk Golok Sembelih Multifungsi. Silakan transfer ke BCA 6765556680 ya kak 🙏 Mau ambil berapa pcs kak?',
    );
    expect(out.ok).toBe(false);
    const gabung = out.issues.join(' ');
    expect(gabung).toContain('ditulis langsung oleh model'); // digit panjang mentah
    expect(gabung).toContain('BELUM memilih metode bayar');  // timing rekening
  });

  it('sebut "rekening" tanpa pilihan transfer → DITAHAN; setelah pelanggan bilang transfer → sah', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const buruk = await h.svc.resolvePriceTokens(
      'c1',
      'Nanti saya kirimkan rekening kami ya kak. Mau ambil berapa pcs kak?',
    );
    expect(buruk.ok).toBe(false);
    expect(buruk.issues.join(' ')).toContain('BELUM memilih metode bayar');

    pesanBaru(h, 'm2', 'transfer aja kak');
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // cache
    const baik = await h.svc.resolvePriceTokens(
      'c1',
      'Siap kak, untuk transfer nanti saya kirimkan detail rekeningnya ya 🙏',
    );
    expect(baik.ok).toBe(true);
  });
});
// <<< ANGGA

// >>> ANGGA — UPGRADE ONGKIR-DOANG (2026-08-06, REPLAY insiden "sandubaya
// 1 pcs"): kutipan jatuh ongkir-doang PADAHAL barang (form) + qty diketahui →
// model mengarang total manual (tertahan gerbang). Fix: finalize meng-upgrade
// kutipan ongkir-doang jadi PENUH saat tepat satu produk dikenal.

describe('UPGRADE ongkir-doang → kutipan penuh (alur total Bossfren)', () => {
  it('REPLAY: jawaban pilihan kota menjatuhkan barang → upgrade dari penawaran form → rincian tagihan hidup', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa?',
      extract: { kota: 'Purwokerto', items: [] },
      addresses: ROWS_PURWOKERTO,
      offers: [offer([{ productId: 'p-bedog', name: 'Bedog Betekok' }])],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'banyumas kak'); // jalur pilihan: items tidak terbawa (akar insiden)
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    // Pra-fix: shippingOnly → penanda total tak tersedia → model ngarang
    // "{{subtotal_barang}} (Harga + Ongkir)" → tertahan gerbang.
    expect(res.quote.shippingOnly).toBe(false);
    expect(res.quote.matchedItems).toEqual([
      expect.objectContaining({ name: 'Bedog Betekok' }),
    ]);
    // Alur total Bossfren jalan: berat+COD → estimate API → subtotal+total+estimasi.
    const out = await h.svc.resolvePriceTokens('c1', 'Ini ya kak:\n{{rincian_tagihan}}\nmau ambil berapa pcs kak?');
    expect(out.text).toContain('Estimasi tiba');
    expect(out.text).toContain('Total TRANSFER');
  });

  it('pengecualian T4 tetap hidup: barang BARU tak dikenal disebut → TIDAK di-upgrade diam-diam', async () => {
    const h = harness({
      lastCustomerText: 'kalau paket promo spesial ke medan ongkirnya berapa?',
      extract: { kota: 'Medan', items: [{ nama: 'Paket Promo Spesial', qty: 1 }] },
      offers: [offer([{ productId: 'p-bedog', name: 'Bedog Betekok' }])],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.shippingOnly).toBe(true); // konfirmasi dulu, jangan balik ke Bedog diam-diam
  });
});
// <<< ANGGA

// >>> ANGGA — GERBANG PAKEM: larangan PENJUMLAHAN MANUAL (2026-08-06, REPLAY
// insiden "kalau cod total berapa kalau transfer total berapa?" — draft
// menjawab "Rp139.000 + Rp11.000" mentah, SAMA PERSIS untuk COD maupun
// Transfer, alih-alih {{total_cod}}/{{total_transfer}} yang sudah beda nilai
// karena biaya COD). Dua penanda dijumlahkan "+" ditahan, apa pun kombinasi
// tokennya; penanda total resmi (blok_total / pasangan total_cod+total_transfer
// yang benar) tetap sah.

describe('GERBANG PAKEM — larangan penjumlahan manual sebagai "total" (REPLAY "cod total berapa, transfer total berapa")', () => {
  it('draft menjumlahkan {{harga_satuan}} + {{ongkir}} sebagai total COD & Transfer → DITAHAN', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const buruk = await h.svc.resolvePriceTokens(
      'c1',
      'Untuk COD, totalnya adalah {{harga_satuan}} + {{ongkir}}. Untuk transfer, totalnya juga {{harga_satuan}} + {{ongkir}}, kak.',
    );
    expect(buruk.ok).toBe(false);
    expect(buruk.issues.join(' ')).toContain('menjumlahkan penanda sendiri');
  });

  it('draft pakai {{blok_total}} (bukan penjumlahan manual) → sah', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const baik = await h.svc.resolvePriceTokens(
      'c1',
      'Ini rekapnya kak:\n{{blok_total}}\nmau diproses yang mana kak?',
    );
    expect(baik.ok).toBe(true);
  });

  it('draft pakai {{total_cod}} dan {{total_transfer}} terpisah (tanpa "+") → tetap sah', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const baik = await h.svc.resolvePriceTokens(
      'c1',
      'Kalau COD totalnya {{total_cod}} kak, kalau transfer totalnya {{total_transfer}} kak.',
    );
    expect(baik.ok).toBe(true);
  });
});
// <<< ANGGA

describe('P5 — alat debug search keyword (dipakai widget Settings Ongkir)', () => {
  it('mengembalikan baris mentah + ringkasan kelompok ber-level', async () => {
    const h = harness({ addresses: ROWS_MATARAM });
    const out = await (h.svc as any).debugSearchAddress('mataram');
    expect(out.total).toBe(3);
    expect(out.rows[0]).toEqual(expect.objectContaining({ provinsi: 'LAMPUNG' }));
    expect(out.groups.length).toBe(3);
    expect(out.groups[0]).toEqual(
      expect.objectContaining({ city: 'LAMPUNG TIMUR', level: 'district' }),
    );
  });
});
// <<< ANGGA

// >>> ANGGA — audit grounding #3 (2026-08-06, keputusan Bossfren "fixkan aja
// semua ID"): toko ini Indonesia-only; katalogPenanda()+lines.push internal
// 100% hardcode Bahasa Indonesia tanpa pernah menerima `lang`, sementara
// SEBAGIAN instruksi lain (SHIPPING_GROUNDING_*) sudah id/en dan bot BISA
// di-set 'en' dari pengaturan web — kalau tidak dijaga, giliran itu dapat
// grounding campur aduk setengah Inggris. Keputusan: grounding order SELALU
// Bahasa Indonesia, `lang` diabaikan di dalam getGroundingText.
describe('Audit grounding #3 — grounding order SELALU Bahasa Indonesia (parameter lang diabaikan)', () => {
  it('getGroundingText("c1", "en") tetap mengeluarkan teks Bahasa Indonesia, bukan Inggris', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke medan berapa kak? golok sembelih multifungsi',
      extract: { kota: 'Medan', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    const grounding = await h.svc.getGroundingText('c1', 'en');
    expect(grounding).toContain('DATA ONGKIR TERKINI');
    expect(grounding).not.toContain('CURRENT AUTHORITATIVE SHIPPING DATA');
  });
});
// <<< ANGGA

// >>> ANGGA — audit grounding #1 (2026-08-06): instruksi bridge ASUMSI order
// ("sebutkan nama barangnya atau pakai {{rincian_order}}/{{rincian_tagihan}}")
// TIDAK sadar soal langkah PRA_TOTAL_STEPS/patokan yang melarang total sama
// sekali — menyuruh model "pakai {{rincian_tagihan}}" di langkah itu cuma
// memindahkan pelanggaran. Fix: di langkah itu HANYA {{rincian_order}} (bukan
// token uang) yang sah memenuhi bridge.
describe('Audit grounding #1 — bridge ASUMSI di langkah PATOKAN tidak lagi menerima {{rincian_tagihan}}', () => {
  it('giliran PATOKAN + ASUMSI order: {{rincian_tagihan}} TIDAK memenuhi bridge (harus sebut nama atau {{rincian_order}})', async () => {
    const h = harness({
      lastCustomerText: 'jadi berapa totalnya kak?',
      extract: { kota: null, items: [] },
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 2 }], { qtyPasti: true })],
    });
    (h.orderLog.funnelAsks as jest.Mock).mockResolvedValue({ total: 1, metode_terjawab: 1 });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    await h.svc.getGroundingText('c1'); // funnelExpect langkah patokan + assumed cache tercatat
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Untuk order ini {{harga_satuan}} per pcs kak.\n{{rincian_tagihan}}',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('tidak menyebut nama barangnya');
  });

  // Catatan: regresi "rincian_tagihan tetap memenuhi bridge di luar langkah
  // PRA_TOTAL/patokan" sudah tercakup oleh tes S2 "bridge jalur asumsi:
  // {{rincian_tagihan}} MEMENUHI wajib-sebut-nama-barang" di atas (skenario
  // tanpa funnelExpect giliran-ini — guard #1 di kode: tanpa funnelExpect
  // yang cocok, perilaku lama dipakai apa adanya).
});
// <<< ANGGA

// >>> ANGGA — audit grounding #2 (2026-08-06): gerbang bridge-enforcement
// dulu jalan TANPA SYARAT begitu ada `assumed` + token uang di draft — tidak
// sinkron dengan instruksi SHIPPING_GROUNDING_ASSUMED yang cuma disuntik ke
// grounding kalau giliran ini `isObrolanOrder` (dipersempit sengaja F2
// 2026-08-05 insiden "halo"). Draft bisa tertahan untuk aturan yang giliran
// itu TIDAK PERNAH diberitahukan ke model. Fix: gerbang ikut dipersempit
// dengan kondisi yang SAMA seperti instruksinya.
describe('Audit grounding #2 — gerbang bridge ASUMSI kini sinkron dengan kondisi tampil instruksinya', () => {
  it('giliran basa-basi (BUKAN obrolan order) + cache assumed hangat → bridge TIDAK ditegakkan', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    pesanBaru(h, 'm2', 'oke makasih infonya kak'); // sama seperti tes F2 — terbukti BUKAN obrolan order
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok'); // cache hangat
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).not.toContain('ASUMSI'); // F2: instruksi bridge memang tidak disuntik giliran ini
    const out = await h.svc.resolvePriceTokens('c1', 'Sama-sama kak! Harga satuannya {{harga_satuan}} kalau mau order lagi ya.');
    expect(out.ok).toBe(true); // FIX #2: giliran bukan obrolan order → bridge tidak ikut ditegakkan
  });

  it('kontrol: giliran tanya-uang (obrolan order) + assumed → bridge TETAP ditegakkan seperti biasa', async () => {
    const h = harness({
      lastCustomerText: 'totalnya berapa?',
      logEntries: [entry([{ productId: 'p-golok', name: 'Golok Sembelih Multifungsi', qty: 1 }])],
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ok');
    await h.svc.getGroundingText('c1');
    const out = await h.svc.resolvePriceTokens('c1', 'Harga satuannya {{harga_satuan}} kak.');
    expect(out.ok).toBe(false); // obrolan order + assumed + token uang tanpa nama barang → tetap ditahan
  });
});
// <<< ANGGA

// >>> ANGGA — GERBANG PAKEM (2026-08-06, REPLAY laporan Bossfren "Kab.
// Purwokerto ngaco"): tangga ronde-2 ("Purwokertonya mana ya kak?" dijawab
// "purwokerto timur kak" tapi masih belum ketemu) SEBELUMNYA cuma prompt
// bebas "minta KECAMATAN-nya" — model mengarang kabupaten yang TIDAK ADA
// ("Kab. Purwokerto") demi menyusun pertanyaan tertutup sendiri. Sama seperti
// tangga ronde-1 (AMBIGUOUS_OPEN), sekarang kalimatnya DIKUNCI verbatim dan
// ditegakkan funnelExpect — bukan cuma diminta di prompt.
describe('GERBANG PAKEM — anti-ngarang lokasi tangga LANJUTAN (REPLAY laporan Bossfren "Kab. Purwokerto ngaco")', () => {
  it('ronde 2 tujuan AMBIGUOUS (belum tunggal, belum sempit): grounding terkunci verbatim, draft yang mengarang kabupaten palsu DITAHAN', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa kak?',
      extract: { kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_PURWOKERTO,
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    // Jawaban yang TIDAK mengandung kata lokasi apa pun (beda dari REPLAY nyata
    // "purwokerto timur kak" yang di harness ini malah cocok subset sempit yang
    // SUDAH aman) -> jalur jawabanPolosTujuan gagal total, jatuh balik ke
    // pencarian dasar "purwokerto" -> ambigu dari NOL (bukan subset), ronde 2
    // -> tangga minta-kecamatan (bukan daftar kandidat).
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    pesanBaru(h, 'm2', 'masih bingung nih kak, gimana ya enaknya');
    const res2: any = await h.svc.quoteForConversation('c1');
    expect(res2.status).toBe('ambiguous');
    expect(res2.sempit).toBeFalsy();

    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('kecamatan apa ya kak');
    // Grounding SENDIRI tidak boleh menyodorkan nama kabupaten kandidat mana
    // pun ke model (dulu prompt cuma bilang "minta KECAMATAN-nya" tanpa
    // larangan eksplisit ini di tangga lanjutan).
    expect(grounding).not.toContain('Kab.');

    // Draft ngaco PERSIS insiden nyata Bossfren: menyebut kabupaten yang
    // TIDAK ADA ("Kab. Purwokerto") sebagai salah satu pilihan tertutup.
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Mohon maaf kak, saya perlu tahu Purwokerto Timur itu di kabupaten mana, apakah di Kab. Banyumas, JAWA TENGAH atau Kab. Purwokerto, JAWA TENGAH? 🙏',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('minta_kecamatan');
  });

  it('ronde 2 tujuan NEED_MORE_DETAIL (tidak ketemu sama sekali): tangga tawar-provinsi SEBELUMNYA sama sekali TIDAK dikunci — kini ditegakkan juga', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke antahberantah berapa kak?',
      extract: { kota: 'Antahberantah', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: [], // nol kandidat sama sekali -> need_more_detail
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('need_more_detail');

    pesanBaru(h, 'm2', 'kecamatan antahberantah juga kak, tetep gak ketemu ya?');
    const res2: any = await h.svc.quoteForConversation('c1');
    expect(res2.status).toBe('need_more_detail');

    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('provinsi apa');

    // Draft yang mengarang nama provinsi/kabupaten dari pengetahuan sendiri
    // (kelas bug yang sama seperti "Kab. Purwokerto") kini WAJIB ditahan —
    // pra-fix tangga ini sama sekali tidak punya funnelExpect, jadi apa pun
    // yang ditulis model lolos begitu saja.
    const out = await h.svc.resolvePriceTokens(
      'c1',
      'Antahberantah itu setahu saya di Provinsi Jawa Tengah ya kak, benar begitu?',
    );
    expect(out.ok).toBe(false);
    expect(out.issues.join(' ')).toContain('minta_provinsi');
  });
});
// <<< ANGGA


// >>> ANGGA — fix (2026-08-06, REPLAY laporan Bossfren, dibuktikan LANGSUNG
// pakai widget "Destination keyword search debug" Bossfren sendiri): akar
// masalah SESUNGGUHNYA di balik "Kab. Purwokerto ngaco" (lebih dalam dari
// perbaikan kunci-verbatim #31 di atas — itu tetap perlu sebagai jaring
// pengaman, tapi ini akar SEBAB kenapa sistem sampai bertanya lagi padahal
// jawaban pelanggan sudah cukup). Data di bawah PERSIS hasil widget: cari
// "purwokerto timur" -> API balik 8 baris (5 kecamatan PURWOKERTO TIMUR di
// Kab. Banyumas + 3 KELURAHAN "Purwokerto" tunggal yang sama sekali tak
// terkait di Lamongan/Kediri/Blitar, Jawa Timur) -> widget Bossfren
// menyaring bersih jadi 1 grup kandidat (Kab. Banyumas, level "district").
// Sebelum fix ini, sistem BOT (bukan widget) memecah jawaban "purwokerto
// timur kak" jadi kata per kata dan menilai baris HANYA terhadap kata
// tunggal "purwokerto" — kata pembeda "timur" hilang di langkah penilaian,
// jadi 3 kelurahan tak-terkait itu ikut lolos jadi "kandidat", ambiguitas
// PALSU muncul lagi, dan sistem terpaksa bertanya ronde 3 (di sinilah model
// akhirnya mengarang "Kab. Purwokerto").
const ROWS_PURWOKERTO_TIMUR_REAL = [
  { _id: 'r1', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'BANYUMAS', CITY_NAME_SI: 'Kab. Banyumas', DISTRICT_NAME: 'PURWOKERTO TIMUR', SUBDISTRICT_NAME: 'MERSI' },
  { _id: 'r2', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'BANYUMAS', CITY_NAME_SI: 'Kab. Banyumas', DISTRICT_NAME: 'PURWOKERTO TIMUR', SUBDISTRICT_NAME: 'ARCAWINANGUN' },
  { _id: 'r3', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'BANYUMAS', CITY_NAME_SI: 'Kab. Banyumas', DISTRICT_NAME: 'PURWOKERTO TIMUR', SUBDISTRICT_NAME: 'PURWOKERTO LOR' },
  { _id: 'r4', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'BANYUMAS', CITY_NAME_SI: 'Kab. Banyumas', DISTRICT_NAME: 'PURWOKERTO TIMUR', SUBDISTRICT_NAME: 'SOKANEGARA' },
  { _id: 'r5', PROVINCE_NAME: 'JAWA TENGAH', CITY_NAME: 'BANYUMAS', CITY_NAME_SI: 'Kab. Banyumas', DISTRICT_NAME: 'PURWOKERTO TIMUR', SUBDISTRICT_NAME: 'KRANJI' },
  { _id: 'r6', PROVINCE_NAME: 'JAWA TIMUR', CITY_NAME: 'LAMONGAN', CITY_NAME_SI: 'Kab. Lamongan', DISTRICT_NAME: 'NGIMBANG', SUBDISTRICT_NAME: 'PURWOKERTO' },
  { _id: 'r7', PROVINCE_NAME: 'JAWA TIMUR', CITY_NAME: 'KEDIRI', CITY_NAME_SI: 'Kab. Kediri', DISTRICT_NAME: 'NGADILUWIH', SUBDISTRICT_NAME: 'PURWOKERTO' },
  { _id: 'r8', PROVINCE_NAME: 'JAWA TIMUR', CITY_NAME: 'BLITAR', CITY_NAME_SI: 'Kab. Blitar', DISTRICT_NAME: 'SRENGAT', SUBDISTRICT_NAME: 'PURWOKERTO' },
];

describe('GERBANG PAKEM — jawaban FRASA (≥2 kata) dinilai UTUH, bukan kata per kata (REPLAY widget debug Bossfren "purwokerto timur")', () => {
  it('"purwokerto timur kak" setelah ronde 1 ambigu -> resolve LANGSUNG ke Kab. Banyumas, TIDAK bertanya lagi', async () => {
    const h = harness({
      lastCustomerText: 'ongkir ke purwokerto berapa kak?',
      extract: { kota: 'Purwokerto', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] },
      addresses: ROWS_PURWOKERTO, // 2 kandidat nyata (Banyumas vs Lampung Tengah) -> ronde 1 ambigu, SAH
    });
    expect(((await h.svc.quoteForConversation('c1')) as any).status).toBe('ambiguous');

    pesanBaru(h, 'm2', 'purwokerto timur kak');
    (h.provider.chat as jest.Mock).mockResolvedValue(
      JSON.stringify({ kota: 'Purwokerto Timur', items: [{ nama: 'Golok Sembelih Multifungsi', qty: 1 }] }),
    );
    (h.mengantar.searchAddress as jest.Mock).mockImplementation(async (kw: string) =>
      /purwokerto timur/i.test(kw) ? ROWS_PURWOKERTO_TIMUR_REAL : ROWS_PURWOKERTO,
    );
    const res2: any = await h.svc.quoteForConversation('c1');
    // Pra-fix: 'ambiguous' lagi (kelurahan "Purwokerto" di Lamongan/Kediri/
    // Blitar ikut kebawa jadi kandidat palsu karena penilaian cuma pakai
    // kata "purwokerto"). Pasca-fix: resolve bersih, TIDAK bertanya lagi.
    expect(res2.status).toBe('ok');
    expect(res2.quote.city).toBe('BANYUMAS');
    const grounding = await h.svc.getGroundingText('c1');
    expect(grounding).toContain('mau ambil berapa pcs kak?'); // funnel lanjut, bukan tanya lokasi lagi
  });
});
// <<< ANGGA
