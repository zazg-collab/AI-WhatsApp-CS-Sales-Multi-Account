import {
  ShippingService,
  roundTo,
  gramsToKg,
  resolveDestination,
  labelKandidat,
  passesCourierFilter,
  isCourierCodEligible,
  isRegionCodBlocked,
  pickCourier,
  parseExtract,
  sameItems,
  formatIdr,
  PLACE_HINT,
} from './shipping.service';
import { ShippingQuoteCache } from './shipping-quote.cache';
import { MengantarClient } from './mengantar.client';
import { checkPriceGrounding, checkShippingEscalation } from '../sentinel/rules.engine';

/**
 * >>> ANGGA — Kriteria uji §9 LAMPIRAN, satu per satu.
 *
 * Ini tes yang HARUS GAGAL kalau implementasinya salah, bukan sekadar tes yang
 * lulus. Data kurir di bawah bukan karangan: disalin dari respons LIVE API
 * Mengantar 2026-08-03 (origin Cordova → MEDAN, weight=1), termasuk keanehan
 * aslinya — JNE tanpa field `unsupported`/`unsupported_cod` sama sekali, dan
 * respons performance memakai "Sap" sementara respons estimate memakai "SAP".
 */

// Respons allEstimatePublic MEDAN, weight=1 (live 2026-08-03).
const MEDAN_ESTIMATE: Record<string, any> = {
  JNE: { price: 47000, estimatedPrice: 47000, estimatedSpecialPrice: 37600, codFee: 0 },
  JNECargo: { price: 90000, estimatedPrice: 90000, codFee: 0 },
  SiCepat: { price: 33000, estimatedPrice: 33000, codFee: 0, unsupported: false },
  SiCepatCargo: { price: 33000, estimatedPrice: 33000, codFee: 0, unsupported: false },
  SAP: { price: 50500, estimatedPrice: 50500, codFee: 0, unsupported: false, unsupported_cod: false, coverage_cod: true },
  SAPLite: { price: 35350, estimatedPrice: 35350, codFee: 0, unsupported: false, unsupported_cod: false, coverage_cod: true },
  SapCargo: { price: 165000, estimatedPrice: 165000, codFee: 0, unsupported_cod: true },
  iDexpress: { price: 12000, estimatedPrice: 12000, codFee: 0, unsupported: false, unsupported_cod: false },
  iDlite: { price: 12000, estimatedPrice: 12000, codFee: 0, unsupported: false, unsupported_cod: false },
  JT: { price: 33000, estimatedPrice: 33000, codFee: 0, unsupported: false, unsupported_cod: false },
  lion: { price: 53320, estimatedPrice: 53320, codFee: 0, unsupported: false, unsupported_cod: false },
  iDexpressCargo: { price: 70000, estimatedPrice: 70000, codFee: 0, unsupported: false, unsupported_cod: false },
  anteraja: { price: 39700, estimatedPrice: 39700, codFee: 0, unsupported: false, unsupported_cod: false },
  paxel: { price: 0, estimatedPrice: 0, codFee: 0, unsupported: true, unsupported_cod: true },
  Ninja: { price: 36300, estimatedPrice: 36300, codFee: 0, unsupported: false },
  pos: { price: 34000, estimatedPrice: 34000, codFee: 0, unsupported: false, unsupported_cod: false },
};

// Respons getPerformancePublic MEDAN (live 2026-08-03). Perhatikan "Sap".
const MEDAN_PERF = {
  couriers: [
    { key: 'JNE', score: 96 }, { key: 'SiCepat', score: 96 }, { key: 'Sap', score: 90 },
    { key: 'iDexpress', score: 85 }, { key: 'JT', score: 96 }, { key: 'Ninja', score: 0 },
    { key: 'lion', score: 100 }, { key: 'paxel', score: 0 }, { key: 'anteraja', score: 0 },
    { key: 'pos', score: 0 },
  ],
  bestCourier: 'lion',
  recommendedDGCourier: 'SiCepat',
  recommended: 'JNE',
};

const CONFIG = {
  mengantarApiKey: 'API-TEST',
  mengantarOriginId: 'ORIGIN-TEST',
  baseUrl: 'https://app.mengantar.com',
  courierExclude: ['paxel', 'JNECargo', 'SiCepatCargo', 'SapCargo', 'iDexpressCargo', 'SAPLite', 'iDlite'],
  codAllowlist: ['JNE'],
  codBlockedRegionKeywords: ['papua', 'maluku'],
  defaultWeightGrams: 1000,
  quoteCacheTtlMs: 21_600_000,
  discountMaxPerOrder: 5000,
  priceRoundingIncrement: 500,
};

function addr(province: string, city: string, id: string, district = 'X', opts: { si?: string; sub?: string } = {}) {
  return {
    _id: id,
    PROVINCE_NAME: province,
    CITY_NAME: city,
    CITY_NAME_SI: opts.si ?? `Kota ${city}`,
    DISTRICT_NAME: district,
    SUBDISTRICT_NAME: opts.sub ?? 'Z',
  };
}

interface HarnessOpts {
  addresses?: any[] | null;
  estimate?: any;
  estimateCod?: any;
  performance?: any;
  products?: any[];
  extract?: { kota: string | null; items: Array<{ nama: string; qty: number }> };
  lastCustomerText?: string;
  config?: Partial<typeof CONFIG>;
}

function harness(opts: HarnessOpts = {}) {
  const cfg = { ...CONFIG, ...(opts.config ?? {}) };
  const products = opts.products ?? [
    { id: 'p1', sku: 'GLK-01', name: 'Golok Cordova', category: 'golok', description: '', price: 150000, weightGrams: null, status: 'active' },
    { id: 'p2', sku: 'PSU-01', name: 'Pisau Dapur Cordova', category: 'pisau', description: '', price: 90000, weightGrams: null, status: 'active' },
  ];
  const extract = opts.extract ?? { kota: 'Medan', items: [{ nama: 'Golok Cordova', qty: 1 }] };

  const prisma: any = {
    conversation: {
      findUnique: jest.fn().mockResolvedValue({
        bot: { language: 'id' },
        messages: [{ senderType: 'customer', content: opts.lastCustomerText ?? 'kirim ke Medan ya' }],
      }),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue({ id: 'm1', content: opts.lastCustomerText ?? 'kirim ke Medan ya' }),
    },
    product: {
      findMany: jest.fn().mockResolvedValue(products),
      // Berapa produk aktif yang lebih berat dari berat default toko.
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const settings: any = { shipping: jest.fn().mockResolvedValue(cfg) };
  const provider: any = { chat: jest.fn().mockResolvedValue(JSON.stringify(extract)) };

  const estimate = jest.fn(async ({ codAmount }: any) => {
    if (codAmount != null) return opts.estimateCod !== undefined ? opts.estimateCod : withCodFee(opts.estimate ?? MEDAN_ESTIMATE, codAmount);
    return opts.estimate !== undefined ? opts.estimate : MEDAN_ESTIMATE;
  });
  const mengantar: any = {
    searchAddress: jest.fn().mockResolvedValue(
      opts.addresses !== undefined ? opts.addresses : [addr('SUMATERA UTARA', 'MEDAN', 'dest-medan')],
    ),
    estimate,
    performance: jest.fn().mockResolvedValue(
      opts.performance !== undefined ? opts.performance : MEDAN_PERF,
    ),
  };
  const cache = new ShippingQuoteCache();
  const svc = new ShippingService(prisma, settings, provider, mengantar, cache);
  return { svc, prisma, settings, provider, mengantar, cache, cfg };
}

/** Tiruan perilaku live: codFee ≈ 3,33% × COD_AMOUNT, dikirim untuk SEMUA kurir
 *  (termasuk yang unsupported_cod: true — itu justru buktinya codFee bukan
 *  sinyal kelayakan COD, lihat Rule 2 catatan audit). */
function withCodFee(base: Record<string, any>, codAmount: number) {
  const fee = Math.round(codAmount * 0.0333);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(base)) out[k] = { ...v, codFee: v.price > 0 ? fee : 0 };
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.1 — kota ambigu: bot BERTANYA, bukan menebak', () => {
  /**
   * >>> ANGGA — kriteria §9 nomor 1 DIPERBARUI (disetujui Bossfren 2026-08-03).
   *
   * Bunyi lama: "≥2 KELOMPOK kota → bot bertanya". Terbukti salah dipakai ke
   * data sungguhan: pencarian Mengantar mencocokkan sampai level kelurahan,
   * jadi "Surabaya" balik 10 kelompok dan "Bandung" 25 — hampir semuanya cuma
   * desa senama di kabupaten lain. Kota terbesar justru tidak pernah bisa
   * dikutip ongkirnya.
   *
   * Bunyi baru: ambigu = lebih dari satu KOTA yang NAMANYA sama pada level
   * kecocokan yang sama.
   */
  it('BARU: 10 kelompok tapi hanya 1 kota bernama sama → otomatis, tidak bertanya', async () => {
    const h = harness({
      addresses: [
        addr('JAWA TIMUR', 'SURABAYA', 'sby-1', 'GUBENG'),
        addr('LAMPUNG', 'LAMPUNG TENGAH', 'lt-1', 'SEPUTIH', { sub: 'SURABAYA' }),
        addr('BENGKULU', 'BENGKULU', 'bkl-1', 'X', { sub: 'SURABAYA' }),
        addr('JAWA BARAT', 'BANDUNG', 'bdg-1', 'X', { sub: 'SURABAYA' }),
      ],
      extract: { kota: 'Surabaya', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.city).toBe('SURABAYA');
  });

  it('dua KOTA bernama sama → bertanya, dan API ongkir tidak pernah dipanggil', async () => {
    const h = harness({
      addresses: [
        addr('JAWA BARAT', 'BOGOR', 'b1', 'X', { si: 'Kota Bogor' }),
        addr('JAWA BARAT', 'BOGOR', 'b2', 'X', { si: 'Kab. Bogor' }),
      ],
      extract: { kota: 'Bogor', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ambiguous');
    expect(h.mengantar.estimate).not.toHaveBeenCalled();
    // Seprovinsi → pembedanya nama resmi Mengantar, bukan provinsi.
    expect(res.candidates.map((c: any) => c.label).sort()).toEqual(['Kab. Bogor', 'Kota Bogor']);
    const text = await h.svc.getGroundingText('c1');
    expect(text).toContain('Kota Bogor');
    expect(text).not.toMatch(/\d{3,}/);
  });

  it('kandidat beda provinsi → pembedanya provinsi', () => {
    const kand = [
      { city: 'X', province: 'JAWA BARAT', cityLabel: 'Kab. X', ids: ['1'] },
      { city: 'X', province: 'BANTEN', cityLabel: 'Kab. X', ids: ['2'] },
    ];
    expect(labelKandidat(kand[0], kand)).toBe('Kab. X, JAWA BARAT');
  });

  it('cocok di level KECAMATAN kalau tidak ada kota yang bernama begitu', async () => {
    const h = harness({
      addresses: [
        addr('JAWA BARAT', 'CIREBON', 'crb-1', 'ARJAWINANGUN', { si: 'Kab. Cirebon' }),
        addr('JAWA BARAT', 'CIREBON', 'crb-2', 'ARJAWINANGUN', { si: 'Kab. Cirebon' }),
      ],
      extract: { kota: 'Arjawinangun', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.city).toBe('CIREBON');
  });

  it('cocok "mengandung" TIDAK dianggap cocok — Solo bukan SOLOK', () => {
    const rows = [addr('SUMATERA BARAT', 'SOLOK', 's1')];
    expect(resolveDestination(rows as any, 'Solo')).toBeNull();
    expect(resolveDestination(rows as any, 'Solok')?.candidates).toHaveLength(1);
  });

  it('tidak ada kecocokan persis → minta detail (kecamatan), tanpa angka', async () => {
    const h = harness({
      addresses: [addr('LAMPUNG', 'LAMPUNG TENGAH', 'x1', 'SEPUTIH', { sub: 'PADANG RATU' })],
      extract: { kota: 'Padang', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    const res = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('need_more_detail');
    expect(h.mengantar.estimate).not.toHaveBeenCalled();
    const text = await h.svc.getGroundingText('c1');
    expect(text).toMatch(/KECAMATAN/i);
    expect(text).not.toMatch(/\d{3,}/);
  });

  it('lebih dari 3 kota bernama sama → minta detail, jangan sodorkan daftar', async () => {
    const h = harness({
      addresses: ['A', 'B', 'C', 'D'].map((p, i) => addr(`PROV ${p}`, 'SUKAMAJU', `s${i}`)),
      extract: { kota: 'Sukamaju', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    expect((await h.svc.quoteForConversation('c1')).status).toBe('need_more_detail');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ANGGA — tangga pertanyaan tujuan (jangan pernah mengulang kalimat sama)', () => {
  const bogor = {
    addresses: [
      addr('JAWA BARAT', 'BOGOR', 'b1', 'X', { si: 'Kota Bogor' }),
      addr('JAWA BARAT', 'BOGOR', 'b2', 'X', { si: 'Kab. Bogor' }),
    ],
    extract: { kota: 'Bogor', items: [{ nama: 'Golok Cordova', qty: 1 }] },
  };

  /** Pelanggan mengirim pesan baru; grounding diminta seperti alur sungguhan. */
  async function giliran(h: ReturnType<typeof harness>, id: string, teks: string) {
    h.prisma.message.findFirst.mockResolvedValue({ id, content: teks });
    return h.svc.getGroundingText('c1');
  }

  it('tangga 1 = pertanyaan tertutup Kota/Kab', async () => {
    const h = harness(bogor);
    const teks = await giliran(h, 'm1', 'kirim ke bogor');
    expect(teks).toContain('Kota Bogor');
    expect(teks).toContain('Kab. Bogor');
    expect(teks).not.toMatch(/KECAMATAN/i);
  });

  it('tangga 2 = minta kecamatan, BUKAN mengulang pertanyaan yang sama', async () => {
    const h = harness(bogor);
    await giliran(h, 'm1', 'kirim ke bogor');
    const teks = await giliran(h, 'm2', 'kurang tahu kak');
    expect(teks).toMatch(/KECAMATAN/i);
    expect(teks).toContain('JANGAN mengulang pertanyaan yang sama');
  });

  it('tangga 3 = serahkan ke admin, berhenti bertanya', async () => {
    const h = harness(bogor);
    await giliran(h, 'm1', 'kirim ke bogor');
    await giliran(h, 'm2', 'kurang tahu kak');
    const teks = await giliran(h, 'm3', 'bingung kak');
    expect(teks).toContain('BERHENTI bertanya');
    expect(h.svc.lastOutcome('c1')).toBe('destination_stuck');
    // Sentinel ikut menarik admin kalau pelanggan sudah mengarah checkout.
    expect(checkShippingEscalation('destination_stuck', 'ya udah saya mau order')).not.toBeNull();
  });

  it('satu pesan pelanggan hanya menaikkan tangga SEKALI walau grounding diminta berkali-kali', async () => {
    // Alur nyata memanggil grounding dua kali per giliran: sekali saat menulis
    // draft, sekali lagi saat Sentinel mereview. Tanpa penjaga per-pesan, satu
    // balasan bisa melompat langsung ke tangga 3.
    const h = harness(bogor);
    await giliran(h, 'm1', 'kirim ke bogor');
    const teks = await giliran(h, 'm1', 'kirim ke bogor');
    expect(teks).toContain('Kota Bogor');
    expect(h.svc.lastOutcome('c1')).toBe('ambiguous');
  });

  it('tujuan akhirnya jelas → tangga kembali ke nol', async () => {
    const h = harness(bogor);
    await giliran(h, 'm1', 'kirim ke bogor');
    await giliran(h, 'm2', 'kurang tahu kak');
    // Pelanggan akhirnya menyebut kota yang tidak ambigu.
    h.mengantar.searchAddress.mockResolvedValue([addr('SUMATERA UTARA', 'MEDAN', 'd1')]);
    h.provider.chat.mockResolvedValue(JSON.stringify({ kota: 'Medan', items: [{ nama: 'Golok Cordova', qty: 1 }] }));
    await giliran(h, 'm3', 'medan aja kak');
    expect(h.svc.lastOutcome('c1')).toBe('ok');

    // Ambigu lagi nanti → mulai dari tangga 1 lagi, bukan lanjut ke admin.
    h.mengantar.searchAddress.mockResolvedValue(bogor.addresses);
    h.provider.chat.mockResolvedValue(JSON.stringify(bogor.extract));
    const teks = await giliran(h, 'm4', 'eh kirim ke bogor aja deh');
    expect(teks).toContain('Kota Bogor');
  });

  it('kasus tanpa kecocokan: tangga 1 kecamatan, tangga 2 provinsi', async () => {
    const h = harness({
      addresses: [addr('LAMPUNG', 'LAMPUNG TENGAH', 'x1', 'SEPUTIH', { sub: 'PADANG RATU' })],
      extract: { kota: 'Padang', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    expect(await giliran(h, 'm1', 'ke padang')).toMatch(/KECAMATAN/i);
    expect(await giliran(h, 'm2', 'gak tau kak')).toMatch(/PROVINSI/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.2 — qty > 1 dan/atau lebih dari satu produk berbeda', () => {
  it('menjumlah berat & harga SELURUH item sesuai qty', async () => {
    const h = harness({
      products: [
        { id: 'p1', sku: 'GLK-01', name: 'Golok Cordova', category: 'golok', description: '', price: 150000, weightGrams: null, status: 'active' },
        { id: 'p2', sku: 'PSU-01', name: 'Pisau Dapur Cordova', category: 'pisau', description: '', price: 90000, weightGrams: 2500, status: 'active' },
      ],
      extract: {
        kota: 'Medan',
        items: [{ nama: 'Golok Cordova', qty: 2 }, { nama: 'Pisau Dapur Cordova', qty: 1 }],
      },
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    // 2 × 1000 g (fallback config) + 1 × 2500 g = 4500 g → 5 kg (dibulatkan ke ATAS).
    // GAGAL kalau sistem cuma menghitung 1 pcs / 1 produk (akan jadi 1 kg).
    expect(h.mengantar.estimate).toHaveBeenCalledWith(
      expect.objectContaining({ weightKg: 5 }),
    );
    // 2 × 150.000 + 1 × 90.000 = 390.000
    expect(res.quote.goodsTotal).toBe(390000);
  });

  it('berat per produk dibaca dari katalog, BUKAN konstanta di kode', async () => {
    const h = harness({
      products: [{ id: 'p1', sku: 'GLK-01', name: 'Golok Cordova', category: '', description: '', price: 150000, weightGrams: 7000, status: 'active' }],
      extract: { kota: 'Medan', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    await h.svc.quoteForConversation('c1');
    expect(h.mengantar.estimate).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 7 }));
  });

  /**
   * >>> ANGGA — aturan produk DIPERBARUI (disetujui Bossfren 2026-08-03).
   *
   * Dulu: tidak ada produk cocok => TIDAK ADA ANGKA SAMA SEKALI. Itu menyatukan
   * dua hal terpisah. ONGKIR tidak butuh tahu produknya (seluruh katalog
   * Cordova sama rata 1000 g, jadi ongkir 1 pcs itu angka PASTI); yang butuh
   * produk adalah TOTAL BELANJA. Gerbang untuk total tetap dipertahankan.
   */
  it('tanpa produk → ongkir 1 pcs tetap dikutip, TOTAL tetap ditahan', async () => {
    const h = harness({ extract: { kota: 'Medan', items: [] } });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.shippingOnly).toBe(true);
    expect(res.quote.goodsTotal).toBe(0);
    // Berat default 1000 g → 1 kg; ongkir JNE (recommended) = 47.000.
    expect(h.mengantar.estimate).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 1 }));
    expect(res.quote.transferTotal).toBe(47000);

    const text = await h.svc.getGroundingText('c1');
    expect(text).toContain('ONGKIR SAJA');
    expect(text).toContain('1 pcs');
    // GAGAL kalau angka itu disodorkan sebagai total belanja.
    expect(text).not.toContain('Total kalau TRANSFER');
  });

  it('nama barang tidak cocok katalog → ongkir saja + sebutkan barang yang gagal', async () => {
    const h = harness({ extract: { kota: 'Medan', items: [{ nama: 'kompor gas rinnai', qty: 1 }] } });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.shippingOnly).toBe(true);
    const text = await h.svc.getGroundingText('c1');
    expect(text).toContain('kompor gas rinnai');
    expect(text).not.toContain('Total kalau TRANSFER');
  });

  it('sebagian barang cocok, sebagian tidak → JANGAN kutip total yang bolong', async () => {
    const h = harness({
      extract: { kota: 'Medan', items: [{ nama: 'Golok Cordova', qty: 1 }, { nama: 'kompor gas', qty: 1 }] },
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.quote.shippingOnly).toBe(true);
    expect(res.quote.goodsTotal).toBe(0);
  });

  it('katalog seragam → angka pasti; ada produk lebih berat → "MULAI DARI"', async () => {
    const seragam = harness({ extract: { kota: 'Medan', items: [] } });
    seragam.prisma.product.count = jest.fn().mockResolvedValue(0);
    await seragam.svc.quoteForConversation('c1');
    expect(await seragam.svc.getGroundingText('c1')).not.toContain('MULAI DARI');

    const campur = harness({ extract: { kota: 'Medan', items: [] } });
    campur.prisma.product.count = jest.fn().mockResolvedValue(1);
    await campur.svc.quoteForConversation('c2');
    expect(await campur.svc.getGroundingText('c2')).toContain('MULAI DARI');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.3 — Papua/Maluku termasuk provinsi hasil pemekaran', () => {
  const PEMEKARAN = [
    'PAPUA', 'PAPUA BARAT', 'PAPUA TENGAH', 'PAPUA PEGUNUNGAN', 'PAPUA SELATAN',
    'PAPUA BARAT DAYA', 'MALUKU', 'MALUKU UTARA',
  ];

  it.each(PEMEKARAN)('COD tidak pernah ditawarkan ke %s', async (province) => {
    const h = harness({
      addresses: [addr(province, 'KOTA X', 'dx')],
      extract: { kota: 'Kota X', items: [{ nama: 'Golok Cordova', qty: 1 }] },
    });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    // GAGAL kalau bot menawarkan COD ke wilayah ini, walau kurirnya sanggup
    // secara teknis (JT/lion/pos/SAP semua unsupported_cod: false di fixture).
    expect(res.quote.codEligible).toBe(false);
    expect(res.quote.codTotal).toBeNull();
    expect(res.quote.codBlockedReason).toBe('region');
    const text = await h.svc.getGroundingText('c1');
    expect(text).toContain('COD TIDAK tersedia');
  });

  it('provinsi lain TETAP boleh COD', async () => {
    const h = harness();
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.quote.codEligible).toBe(true);
  });

  it('Rule 3 dicocokkan sebagai substring, bukan exact match', () => {
    expect(isRegionCodBlocked('PAPUA BARAT DAYA', ['papua', 'maluku'])).toBe(true);
    expect(isRegionCodBlocked('Maluku Utara', ['papua', 'maluku'])).toBe(true);
    expect(isRegionCodBlocked('SUMATERA UTARA', ['papua', 'maluku'])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.4 — kurir terbaik tidak COD-eligible, tapi ada kurir lain yang bisa', () => {
  it('COD tetap ditawarkan lewat kurir alternatif', async () => {
    // Ninja = unsupported_cod TIDAK ADA di respons & tidak masuk allowlist →
    // boleh non-COD, tidak boleh COD. Dijadikan `recommended` supaya jadi kurir
    // transfer terpilih.
    const h = harness({ performance: { ...MEDAN_PERF, recommended: 'Ninja' } });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.transferCourier).toBe('Ninja');
    // GAGAL kalau sistem menyimpulkan "COD tidak tersedia untuk tujuan ini"
    // padahal lion (bestCourier, unsupported_cod: false) sebenarnya bisa.
    expect(res.quote.codEligible).toBe(true);
    expect(res.quote.codCourier).toBe('lion');
    expect(res.quote.codCourier).not.toBe(res.quote.transferCourier);
  });

  it('tidak ada satu pun kurir COD-eligible → opsi COD tidak ditawarkan, bukan gagal', async () => {
    const noCod: Record<string, any> = {};
    for (const [k, v] of Object.entries(MEDAN_ESTIMATE)) {
      noCod[k] = { ...v, unsupported_cod: true };
    }
    const h = harness({ estimate: noCod, config: { codAllowlist: [] } });
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('ok');
    expect(res.quote.transferTotal).toBeGreaterThan(0);
    expect(res.quote.codEligible).toBe(false);
    expect(res.quote.codBlockedReason).toBe('no_eligible_courier');
  });

  it('kurir dengan flag kosong hanya boleh COD kalau ada di allowlist', () => {
    expect(isCourierCodEligible('JNE', MEDAN_ESTIMATE.JNE, ['JNE'])).toBe(true);
    expect(isCourierCodEligible('JNE', MEDAN_ESTIMATE.JNE, [])).toBe(false);
    expect(isCourierCodEligible('Ninja', MEDAN_ESTIMATE.Ninja, ['JNE'])).toBe(false);
    expect(isCourierCodEligible('SapCargo', MEDAN_ESTIMATE.SapCargo, ['SapCargo'])).toBe(false);
    expect(isCourierCodEligible('JT', MEDAN_ESTIMATE.JT, [])).toBe(true);
  });

  it('codFee SELALU dari API, tidak pernah dihitung sendiri dengan persentase', async () => {
    const h = harness();
    const res: any = await h.svc.quoteForConversation('c1');
    // Panggilan #1 tanpa COD_AMOUNT, panggilan #2 DENGAN COD_AMOUNT (Langkah 8).
    expect(h.mengantar.estimate).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ codAmount: expect.anything() }));
    const second = h.mengantar.estimate.mock.calls[1][0];
    expect(second.codAmount).toBe(res.quote.goodsTotal + MEDAN_ESTIMATE.JNE.estimatedPrice);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.5 — API mati ATAU 0 kurir lolos filter (tes paling penting)', () => {
  it('API tidak merespons → tidak pernah menyebut angka atau Rp0', async () => {
    const h = harness({ estimate: null });
    const res = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('api_error');
    const text = await h.svc.getGroundingText('c1');
    expect(text).not.toMatch(/\d{3,}/);
    expect(text).toContain('BELUM bisa memastikan');
    // "gratis/Rp0" hanya boleh muncul sebagai LARANGAN untuk LLM, tidak pernah
    // sebagai tawaran — pastikan kalimatnya memang melarang.
    expect(text).toMatch(/JANGAN menyebut angka[\s\S]*jangan menyiratkan gratis\/Rp0/i);
  });

  it('Search Address gagal → api_error, bukan menebak kota', async () => {
    const h = harness({ addresses: null });
    expect((await h.svc.quoteForConversation('c1')).status).toBe('api_error');
  });

  it('getPerformancePublic gagal → api_error, bukan asal pilih termurah', async () => {
    const h = harness({ performance: null });
    expect((await h.svc.quoteForConversation('c1')).status).toBe('api_error');
  });

  it('API sukses tapi 0 kurir lolos filter → diperlakukan sama seperti API mati', async () => {
    // Semua kurir yang tersisa dihapus lewat exclude → 0 lolos Rule 1.
    const h = harness({ config: { courierExclude: Object.keys(MEDAN_ESTIMATE) } });
    const res = await h.svc.quoteForConversation('c1');
    expect(res.status).toBe('no_courier');
    const text = await h.svc.getGroundingText('c1');
    expect(text).not.toMatch(/\d{3,}/);
    // Dibedakan dari "API tidak merespons" untuk keperluan log/monitoring.
    expect(h.svc.lastOutcome('c1')).toBe('no_courier');
  });

  it('kredensial belum diisi → not_configured, tetap tanpa angka', async () => {
    const h = harness({ config: { mengantarApiKey: '' } });
    expect((await h.svc.quoteForConversation('c1')).status).toBe('not_configured');
    expect(await h.svc.getGroundingText('c1')).not.toMatch(/\d{3,}/);
  });

  it('gate Sentinel: sistem ongkir mati + pelanggan siap checkout → naik ke admin', () => {
    const hit = checkShippingEscalation('api_error', 'oke saya mau order, alamat saya di Medan');
    expect(hit).not.toBeNull();
    expect(hit!.decision).toBe('takeover_required');
    expect(hit!.reason).toContain('tidak merespons');

    const zero = checkShippingEscalation('no_courier', 'jadi total bayarnya berapa kak');
    expect(zero!.reason).toContain('TIDAK ADA kurir');

    // Belum mengarah ke checkout → jangan ganggu admin.
    expect(checkShippingEscalation('api_error', 'halo kak')).toBeNull();
    // Ongkir normal → tidak ada eskalasi.
    expect(checkShippingEscalation('ok', 'saya mau order')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.6 — angka bot harus cocok grounding & kelipatan pembulatan', () => {
  it('total dibulatkan ke kelipatan yang dikonfigurasi', async () => {
    const h = harness({
      products: [{ id: 'p1', sku: 'GLK-01', name: 'Golok Cordova', category: '', description: '', price: 145000, weightGrams: null, status: 'active' }],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    // 145.000 + 47.000 = 192.000 → sudah kelipatan 500.
    expect(res.quote.transferTotal % 500).toBe(0);
    expect(res.quote.codTotal! % 500).toBe(0);
    // COD mentah = 145.000 + 47.000 + codFee(3,33% × 192.000 = 6394) = 198.394
    // → dibulatkan ke 198.500, bukan angka ganjil.
    expect(res.quote.codTotal).toBe(198500);
  });

  it('checkPriceGrounding menerima angka ongkir yang SAH', async () => {
    const h = harness({
      products: [{ id: 'p1', sku: 'GLK-01', name: 'Golok Cordova', category: '', description: '', price: 145000, weightGrams: null, status: 'active' }],
    });
    const res: any = await h.svc.quoteForConversation('c1');
    const numbers = await h.svc.getGroundingNumbers('c1');
    const draft = `Totalnya Rp${formatIdr(res.quote.transferTotal)} kalau transfer ya kak`;
    expect(checkPriceGrounding(draft, '', numbers)).toBeNull();
  });

  it('checkPriceGrounding MENAHAN angka ongkir yang tidak dihitung sistem', async () => {
    const h = harness({
      products: [{ id: 'p1', sku: 'GLK-01', name: 'Golok Cordova', category: '', description: '', price: 145000, weightGrams: null, status: 'active' }],
    });
    await h.svc.quoteForConversation('c1');
    const numbers = await h.svc.getGroundingNumbers('c1');
    // Angka mentah sebelum pembulatan pun harus ketahan — bot tidak boleh
    // menyebut angka apa pun selain yang dihitung & dibulatkan sistem.
    const hit = checkPriceGrounding('Totalnya Rp198.394 kak', '', numbers);
    expect(hit).not.toBeNull();
    expect(hit!.reason).toContain('198394');
  });

  it('tanpa data ongkir & tanpa knowledge → tidak ada yang ditandai (perilaku lama utuh)', () => {
    expect(checkPriceGrounding('Rp150.000', '', '')).toBeNull();
  });

  it('roundTo membulatkan ke kelipatan TERDEKAT', () => {
    expect(roundTo(152324, 500)).toBe(152500);
    expect(roundTo(152100, 500)).toBe(152000);
    expect(roundTo(152324, 1000)).toBe(152000);
    expect(roundTo(152324, 1)).toBe(152324);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.7 — kurir yang ditawarkan harus lolos Rule 1', () => {
  it('paxel / varian Cargo / SAPLite / iDlite / harga-nol tidak pernah muncul', async () => {
    const terlarang = ['paxel', 'JNECargo', 'SiCepatCargo', 'SapCargo', 'iDexpressCargo', 'SAPLite', 'iDlite'];
    for (const rec of [...terlarang, 'JNE']) {
      const h = harness({ performance: { ...MEDAN_PERF, recommended: rec, bestCourier: rec } });
      const res: any = await h.svc.quoteForConversation(`c-${rec}`);
      expect(res.status).toBe('ok');
      expect(terlarang).not.toContain(res.quote.transferCourier);
      if (res.quote.codCourier) expect(terlarang).not.toContain(res.quote.codCourier);
    }
  });

  it('Rule 1 satuan: exclude, unsupported, dan price = 0', () => {
    const ex = CONFIG.courierExclude;
    expect(passesCourierFilter('JNE', MEDAN_ESTIMATE.JNE, ex)).toBe(true);
    expect(passesCourierFilter('SAPLite', MEDAN_ESTIMATE.SAPLite, ex)).toBe(false);
    expect(passesCourierFilter('iDlite', MEDAN_ESTIMATE.iDlite, ex)).toBe(false);
    expect(passesCourierFilter('paxel', MEDAN_ESTIMATE.paxel, ex)).toBe(false);
    expect(passesCourierFilter('lion', { price: 0, estimatedPrice: 0 }, ex)).toBe(false);
    expect(passesCourierFilter('lion', { price: 5000, estimatedPrice: 5000, unsupported: true }, ex)).toBe(false);
  });

  it('kurir dicocokkan case-insensitive antara respons performance & estimate', () => {
    // Live: performance mengembalikan "Sap", estimate mengembalikan "SAP".
    expect(pickCourier(['SAP', 'JT'], { couriers: [{ key: 'Sap', score: 90 }], recommended: 'Sap' } as any)).toBe('SAP');
  });

  it('urutan pemilihan: recommended → bestCourier → skor tertinggi', () => {
    const perf: any = { couriers: [{ key: 'JT', score: 96 }, { key: 'lion', score: 100 }], bestCourier: 'lion', recommended: 'JNE' };
    expect(pickCourier(['JNE', 'JT', 'lion'], perf)).toBe('JNE');
    expect(pickCourier(['JT', 'lion'], perf)).toBe('lion');
    expect(pickCourier(['JT'], perf)).toBe('JT');
    expect(pickCourier([], perf)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§9.8 — cache 6 jam: tujuan sama tidak memicu panggilan API berulang', () => {
  it('pesan lanjutan tanpa penyebutan tempat → 0 panggilan API tambahan', async () => {
    const h = harness();
    await h.svc.quoteForConversation('c1');
    expect(h.mengantar.searchAddress).toHaveBeenCalledTimes(1);
    const llmCalls = h.provider.chat.mock.calls.length;

    h.prisma.message.findFirst.mockResolvedValue({ content: 'oke kak siap' });
    const again: any = await h.svc.quoteForConversation('c1');
    expect(again.status).toBe('ok');
    expect(h.mengantar.searchAddress).toHaveBeenCalledTimes(1);
    // Saringan Langkah 1 juga menghemat panggilan LLM deteksi.
    expect(h.provider.chat.mock.calls.length).toBe(llmCalls);
  });

  it('pelanggan menyebut kota LAIN → cache direset, bukan ditambah', async () => {
    const h = harness();
    await h.svc.quoteForConversation('c1');
    h.prisma.message.findFirst.mockResolvedValue({ content: 'eh salah, kirim ke Surabaya aja' });
    h.provider.chat.mockResolvedValue(JSON.stringify({ kota: 'Surabaya', items: [{ nama: 'Golok Cordova', qty: 1 }] }));
    h.mengantar.searchAddress.mockResolvedValue([addr('JAWA TIMUR', 'SURABAYA', 'dest-sby')]);
    const res: any = await h.svc.quoteForConversation('c1');
    expect(res.quote.city).toBe('SURABAYA');
    expect(h.mengantar.searchAddress).toHaveBeenCalledTimes(2);
  });

  it('pelanggan MENAMBAH barang → total dihitung ulang, tidak memakai total lama', async () => {
    const h = harness();
    const first: any = await h.svc.quoteForConversation('c1');
    h.prisma.message.findFirst.mockResolvedValue({ content: 'tambah 1 pisau dapur sekalian' });
    h.provider.chat.mockResolvedValue(JSON.stringify({
      kota: 'Medan',
      items: [{ nama: 'Golok Cordova', qty: 1 }, { nama: 'Pisau Dapur Cordova', qty: 1 }],
    }));
    const second: any = await h.svc.quoteForConversation('c1');
    expect(second.quote.goodsTotal).toBe(240000);
    expect(second.quote.goodsTotal).not.toBe(first.quote.goodsTotal);
  });

  it('cache kedaluwarsa setelah TTL', async () => {
    const h = harness({ config: { quoteCacheTtlMs: 1 } });
    await h.svc.quoteForConversation('c1');
    await new Promise((r) => setTimeout(r, 5));
    h.prisma.message.findFirst.mockResolvedValue({ content: 'oke kak' });
    await h.svc.quoteForConversation('c1');
    expect(h.mengantar.searchAddress).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('pembantu murni & kontrak grounding', () => {
  it('gramsToKg membulatkan KE ATAS (parameter weight API berskala kg)', () => {
    expect(gramsToKg(1000)).toBe(1);
    expect(gramsToKg(1)).toBe(1);
    expect(gramsToKg(1001)).toBe(2);
    expect(gramsToKg(2000)).toBe(2);
    expect(gramsToKg(4500)).toBe(5);
    expect(gramsToKg(0)).toBe(1);
  });

  it('resolveDestination mengelompokkan per kota, bukan per baris', () => {
    const m = resolveDestination([
      addr('SUMATERA UTARA', 'MEDAN', 'a', 'MEDAN KOTA'),
      addr('SUMATERA UTARA', 'MEDAN', 'b', 'MEDAN BARU'),
      addr('SUMATERA BARAT', 'PADANG', 'c'),
    ] as any, 'Medan');
    expect(m!.level).toBe('city');
    expect(m!.candidates).toHaveLength(1);
    expect(m!.candidates[0].ids).toEqual(['a', 'b']);
  });

  it('grounding text hanya memuat angka akhir, tidak pernah rincian mentah', async () => {
    const h = harness();
    const res: any = await h.svc.quoteForConversation('c1');
    const text = await h.svc.getGroundingText('c1');
    expect(text).toContain(formatIdr(res.quote.transferTotal));
    // Ongkir dasar, harga diskon platform (margin toko), dan codFee mentah
    // TIDAK BOLEH bocor ke teks yang dilihat LLM.
    expect(text).not.toContain('37.600'); // estimatedSpecialPrice JNE
    expect(text).not.toContain('47.000'); // estimatedPrice mentah
  });

  it('parseExtract toleran terhadap JSON berpagar & qty tidak wajar', () => {
    expect(parseExtract('```json\n{"kota":"Medan","items":[{"nama":"Golok","qty":"3"}]}\n```'))
      .toEqual({ city: 'Medan', items: [{ name: 'Golok', qty: 3 }] });
    expect(parseExtract('{"kota":null,"items":[]}')).toEqual({ city: null, items: [] });
    expect(parseExtract('bukan json')).toEqual({ city: null, items: [] });
    expect(parseExtract('{"kota":"Medan","items":[{"nama":"Golok"}]}').items[0].qty).toBe(1);
  });

  it('sameItems tidak peduli urutan', () => {
    expect(sameItems([{ name: 'A', qty: 1 }, { name: 'B', qty: 2 }], [{ name: 'b', qty: 2 }, { name: 'a', qty: 1 }])).toBe(true);
    expect(sameItems([{ name: 'A', qty: 1 }], [{ name: 'A', qty: 2 }])).toBe(false);
  });

  it('saringan Langkah 1 menangkap penyebutan tempat', () => {
    expect(PLACE_HINT.test('kirim ke jakarta')).toBe(true);
    expect(PLACE_HINT.test('alamat saya di bekasi')).toBe(true);
    expect(PLACE_HINT.test('ongkir ke medan berapa')).toBe(true);
    expect(PLACE_HINT.test('oke kak makasih')).toBe(false);
  });

  it('kunci API tidak pernah ikut ke teks log', () => {
    const url = 'https://app.mengantar.com/api/public/API-RAHASIA123/address/search?keyword=x';
    expect(MengantarClient.redact(url, 'API-RAHASIA123')).not.toContain('API-RAHASIA123');
    expect(MengantarClient.redact(url, 'API-RAHASIA123')).toContain('***');
  });
});
