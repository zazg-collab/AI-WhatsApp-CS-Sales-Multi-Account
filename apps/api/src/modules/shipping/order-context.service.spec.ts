import {
  OrderContextService,
  mergeSnapshots,
  type OrderSnapshot,
} from './order-context.service';
import { ShippingQuoteCache } from './shipping-quote.cache';

/**
 * >>> ANGGA — Order Context Log (blueprint 2026-08-04), Langkah 2.
 * Tes ini ditulis RED-first: file service belum ada saat tes pertama kali
 * dijalankan (import gagal), lalu implementasi menyusul sampai GREEN.
 */

const H = 3_600_000;

function snap(items: Array<[string, string, number]>, city = 'MEDAN'): OrderSnapshot {
  return {
    city,
    province: 'SUMATERA UTARA',
    destinationId: 'dest-1',
    items: items.map(([productId, name, qty]) => ({ productId, name, qty })),
  };
}

function harness(rows: Array<{ type: string; payload: unknown; createdAt: Date }> = []) {
  const create = jest.fn().mockResolvedValue({});
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma: any = { orderContextEvent: { create, findMany } };
  const settings: any = {
    shipping: jest.fn().mockResolvedValue({ orderContextStaleHours: 24 }),
    // >>> ANGGA — addendum v2 M5: kategori sendiri.
    orderContext: jest.fn().mockResolvedValue({
      orderContextStaleHours: 24,
      orderOfferWindowMinutes: 60,
      orderClosingNote: '',
      orderFormHintKeywords: ['form pemesanan', 'sudah melakukan pemesanan', 'mengisi form'],
    }),
    // <<< ANGGA
  };
  const svc = new OrderContextService(prisma, settings);
  return { svc, create, findMany };
}

describe('mergeSnapshots — union per identitas produk (v1.1 §12.1-4)', () => {
  it('snapshot beruntun yang tumpang tindih TIDAK menghitung dobel', () => {
    // Terbaru dulu: [Golok, Pisau] lalu (lebih lama) [Golok].
    const merged = mergeSnapshots([
      snap([['p1', 'Golok Cordova', 1], ['p2', 'Pisau Dapur', 1]]),
      snap([['p1', 'Golok Cordova', 1]]),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.filter((m) => m.productId === 'p1')).toHaveLength(1);
  });

  it('qty per produk mengikuti entri TERBARU, bukan dijumlah', () => {
    const merged = mergeSnapshots([
      snap([['p1', 'Golok Cordova', 2]]),
      snap([['p1', 'Golok Cordova', 1]]),
    ]);
    expect(merged).toEqual([expect.objectContaining({ productId: 'p1', qty: 2 })]);
  });

  it('item tanpa productId dibuang, bukan diikutkan diam-diam', () => {
    const merged = mergeSnapshots([
      { city: 'X', province: 'Y', destinationId: 'd', items: [{ productId: '', name: 'Tanpa Id', qty: 1 }, { productId: 'p9', name: 'Sah', qty: 1 }] },
    ]);
    expect(merged).toEqual([expect.objectContaining({ productId: 'p9' })]);
  });
});

describe('recordSnapshot — satu giliran satu kebenaran (v1.1 §12.1-1)', () => {
  it('panggilan kedua dengan messageId sama TIDAK menulis lagi', async () => {
    const h = harness();
    await h.svc.recordSnapshot('c1', 'm1', snap([['p1', 'Golok', 1]]), 'extractor');
    await h.svc.recordSnapshot('c1', 'm1', snap([['p2', 'Pisau', 1]]), 'extractor');
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it('pesan customer BARU menulis snapshot baru', async () => {
    const h = harness();
    await h.svc.recordSnapshot('c1', 'm1', snap([['p1', 'Golok', 1]]), 'extractor');
    await h.svc.recordSnapshot('c1', 'm2', snap([['p1', 'Golok', 2]]), 'carryover');
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it('gagal menulis tidak melempar (log = penolong, bukan jalur kritis)', async () => {
    const h = harness();
    h.create.mockRejectedValueOnce(new Error('db down'));
    await expect(h.svc.recordSnapshot('c1', 'm1', snap([['p1', 'G', 1]]), 'extractor')).resolves.toBeUndefined();
  });
});

describe('candidates — penanda lifecycle & jendela basi', () => {
  const now = Date.now();

  it('entri SEBELUM penanda completed/cancelled keluar dari kandidat', async () => {
    const h = harness([
      { type: 'snapshot', payload: snap([['p2', 'Pisau', 1]]), createdAt: new Date(now - 1 * H) },
      { type: 'completed', payload: null, createdAt: new Date(now - 2 * H) },
      { type: 'snapshot', payload: snap([['p1', 'Golok', 1]]), createdAt: new Date(now - 3 * H) },
    ]);
    const out = await h.svc.candidates('c1');
    expect(out).toHaveLength(1);
    expect(out[0].snapshot.items[0].productId).toBe('p2');
  });

  it('entri lebih tua dari jendela 24 jam ditandai TIDAK segar (basi ≠ hapus)', async () => {
    const h = harness([
      { type: 'snapshot', payload: snap([['p1', 'Golok', 1]]), createdAt: new Date(now - 30 * H) },
    ]);
    const out = await h.svc.candidates('c1');
    expect(out).toHaveLength(1);
    expect(out[0].fresh).toBe(false);
    expect(await h.svc.latestFresh('c1')).toBeNull();
    // Basi tetap boleh dipakai menyusun PERTANYAAN.
    expect((await h.svc.latestAny('c1'))?.snapshot.items[0].name).toBe('Golok');
  });

  it('latestFresh melompati snapshot tanpa barang (ongkir-saja)', async () => {
    const h = harness([
      { type: 'snapshot', payload: snap([]), createdAt: new Date(now - 1 * H) },
      { type: 'snapshot', payload: snap([['p1', 'Golok', 2]]), createdAt: new Date(now - 2 * H) },
    ]);
    const fresh = await h.svc.latestFresh('c1');
    expect(fresh?.snapshot.items[0]).toEqual(expect.objectContaining({ productId: 'p1', qty: 2 }));
  });

  it('gagal membaca DB → himpunan kosong, bukan melempar', async () => {
    const h = harness();
    h.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(h.svc.candidates('c1')).resolves.toEqual([]);
  });
});

/**
 * >>> ANGGA — LANGKAH 2a butir 4 (2026-08-10, handover Q-Chain v4):
 * `clearFunnelExpect` ADA di `shipping-quote.cache.ts` sejak 2026-08-10 dan
 * TIDAK PERNAH DIPANGGIL siapa pun (dicatat sebagai temuan di wasit
 * `selesai-170`, belum digarap).
 *
 * Akibatnya: sesudah pesanan DIBATALKAN atau SELESAI (`completed`), titipan
 * langkah funnel tetap menggantung di cache sampai `orderContextStaleHours`
 * (bawaan 24 jam). Selama jendela itu, klausa `menjawabDataKirim` di gerbang
 * `jawabanUang` — yang menyala kalau `funnelExpect.step` masih `patokan`/
 * `closing` dan teks pelanggan memuat penanda alamat atau nomor HP — masih
 * bisa menghidupkan kembali funnel untuk percakapan yang SUDAH DITUTUP.
 *
 * Penjaganya ditaruh di `recordMarker`, bukan di pemanggilnya: itu SATU
 * saluran sempit yang dilewati SEMUA penutupan sesi order — pembatalan
 * (`shipping.service.ts`, kata batal) maupun dua sumber `completed`
 * (`promosikanLangkahTerkirim` dan pencocokan `orderClosingNote`). Ditaruh di
 * pemanggil = invarian yang sama disalin ke tiga tempat dan bisa drift.
 * Pakem 8d butir 4.
 */
describe('LANGKAH 2a: penanda lifecycle mencabut titipan langkah funnel', () => {
  function harnessDenganCache(rows: Array<{ type: string; payload: unknown; createdAt: Date }> = []) {
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma: any = { orderContextEvent: { create, findMany } };
    const settings: any = {
      shipping: jest.fn().mockResolvedValue({ orderContextStaleHours: 24 }),
      orderContext: jest.fn().mockResolvedValue({
        orderContextStaleHours: 24,
        orderOfferWindowMinutes: 60,
        orderClosingNote: '',
        orderFormHintKeywords: [],
      }),
    };
    const cache = new ShippingQuoteCache();
    const svc = new OrderContextService(prisma, settings, cache);
    return { svc, create, findMany, cache };
  }

  it('penanda `completed` mencabut funnelExpect', async () => {
    const h = harnessDenganCache();
    h.cache.setFunnelExpect('c1', { messageId: 'm9', step: 'closing', kalimat: 'x' });
    expect(h.cache.funnelExpect('c1')?.step).toBe('closing');

    await h.svc.recordMarker('c1', 'completed', 'closing');

    expect(h.cache.funnelExpect('c1')).toBeNull();
  });

  it('penanda `cancelled` mencabut funnelExpect', async () => {
    const h = harnessDenganCache();
    h.cache.setFunnelExpect('c1', { messageId: 'm9', step: 'patokan', kalimat: 'x' });

    await h.svc.recordMarker('c1', 'cancelled', 'cancel_keyword');

    expect(h.cache.funnelExpect('c1')).toBeNull();
  });

  /**
   * Arah kegagalan yang aman: kalau penandanya GAGAL ditulis, sesi order tidak
   * benar-benar tertutup — titipan langkah WAJIB tetap ada, persis seperti
   * pagar `writtenFor` yang juga hanya direset di jalur sukses. Tanpa test ini,
   * implementasi yang mencabut di `finally` akan terlihat sama benarnya.
   */
  it('penanda GAGAL ditulis → funnelExpect TIDAK dicabut', async () => {
    const h = harnessDenganCache();
    h.cache.setFunnelExpect('c1', { messageId: 'm9', step: 'closing', kalimat: 'x' });
    h.create.mockRejectedValueOnce(new Error('db down'));

    await h.svc.recordMarker('c1', 'completed', 'closing');

    expect(h.cache.funnelExpect('c1')?.step).toBe('closing');
  });

  /** Cache tidak disuntik (test lama menyusun service dengan dua argumen) —
   *  tidak boleh melempar. */
  it('tanpa cache disuntik → tetap aman', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma: any = { orderContextEvent: { create, findMany: jest.fn().mockResolvedValue([]) } };
    const settings: any = {
      shipping: jest.fn().mockResolvedValue({}),
      orderContext: jest.fn().mockResolvedValue({}),
    };
    const svc = new OrderContextService(prisma, settings);
    await expect(svc.recordMarker('c1', 'completed', 'closing')).resolves.toBeUndefined();
  });
});

/**
 * >>> ANGGA — LANGKAH 5 (2026-08-10, ketok Bossfren): LANGKAH FUNNEL MENEMPEL
 * PADA PESAN KELUAR, lewat kolom `Message.funnelStep`.
 *
 * Sebelumnya sumber promosi adalah `funnelExpect` — SATU slot per PERCAKAPAN,
 * di MEMORI — padahal yang dipromosikan milik SATU pesan keluar yang bisa baru
 * terkirim lama kemudian (draft menunggu approve) atau tidak pernah. Dua mode
 * gagalnya: (1) RESTART menghapus Map-nya; (2) giliran berikutnya (atau
 * endpoint debug grounding) MENIMPA slotnya.
 *
 * ⚠️ Rancangan PERTAMA untuk ini — baris `funnel_pending` di `OrderContextEvent`
 * — sudah ditulis sampai 1016/1016 hijau lalu DICABUT UTUH. Audit K23 mengukur:
 * ia mati senyap sesudah tepat 17 giliran (pembacanya ikut `take: 50`), menyusutkan
 * ingatan lima pembaca log sebesar 33%, dan lupa `break` di penanda segmen
 * sehingga approve draft lama menghapus konteks order berjalan. Kolom pada
 * `Message` menghapus keempatnya sekaligus: pencarian lewat primary key, nol
 * baris tambahan, tidak punya konsep segmen. Rinciannya di
 * `20260810-langkah5-rancangan-funnel-pending-dicabut`. JANGAN diulang.
 *
 * Konsumsinya adalah KLAIM ATOMIK: `updateMany` yang mensyaratkan `funnelStep`
 * masih terisi lalu mengosongkannya. `count === 0` berarti sudah dipromosikan —
 * pagar idempotensi yang tahan restart DAN tahan dua approve bersamaan, tanpa
 * Set di memori. Pola yang sama sudah dipakai `approveDraft` di repo ini.
 */
describe('LANGKAH 5: promosi mengklaim `Message.funnelStep` secara atomik', () => {
  /** Prisma tiruan yang MENGHORMATI argumennya. Harness sebelumnya mengabaikan
   *  `where`/`orderBy`/`take` — penyanggal K23 membuktikan test semacam itu tetap
   *  hijau walau filter percakapan dihapus dan `take` dipotong ke 1. */
  function harnessPesan(pesan: Array<{ id: string; funnelStep: string | null; createdAt?: Date }> = []) {
    const messages = new Map(pesan.map((m) => [m.id, { createdAt: new Date(), ...m }]));
    const rows: Array<{ conversationId: string; type: string; payload: any; createdAt: Date }> = [];
    const create = jest.fn(async ({ data }: any) => {
      rows.unshift({ ...data, createdAt: new Date() });
      return data;
    });
    const findMany = jest.fn(async (args: any) => {
      let out = rows.filter((r) => r.conversationId === args?.where?.conversationId);
      if (args?.orderBy?.createdAt === 'asc') out = [...out].reverse();
      return typeof args?.take === 'number' ? out.slice(0, args.take) : out;
    });
    const updateMany = jest.fn(async ({ where, data }: any) => {
      // Sapuan per-percakapan (dipakai `recordMarker`): tanpa `id`, kena SEMUA
      // pesan yang kolomnya masih terisi.
      if (where && !where.id && where.funnelStep?.not === null) {
        let n = 0;
        for (const m of messages.values()) {
          if (m.funnelStep !== null) { m.funnelStep = data?.funnelStep ?? null; n++; }
        }
        return { count: n };
      }
      const m = messages.get(where?.id);
      if (!m) return { count: 0 };
      // Menghormati syarat `funnelStep: { not: null }` — inti klaim atomiknya.
      if (where?.funnelStep?.not === null && m.funnelStep === null) return { count: 0 };
      if (typeof where?.funnelStep === 'string' && m.funnelStep !== where.funnelStep) return { count: 0 };
      m.funnelStep = data?.funnelStep ?? null;
      return { count: 1 };
    });
    // POTRET, bukan referensi hidup — DB sungguhan memulangkan salinan. Tanpa
    // ini, pembaca kedua dalam satu balapan ikut melihat perubahan pembaca
    // pertama, dan mutasi "syarat klaim atomik dihapus" lolos tanpa ketahuan.
    const findUnique = jest.fn(async ({ where }: any) => {
      const m = messages.get(where?.id);
      return m ? { ...m } : null;
    });
    const prisma: any = {
      orderContextEvent: { create, findMany },
      message: { updateMany, findUnique },
    };
    const settings: any = {
      shipping: jest.fn().mockResolvedValue({ orderContextStaleHours: 24 }),
      orderContext: jest.fn().mockResolvedValue({
        orderContextStaleHours: 24, orderOfferWindowMinutes: 60,
        orderClosingNote: '', orderFormHintKeywords: [],
      }),
    };
    const cache = new ShippingQuoteCache();
    const svc = new OrderContextService(prisma, settings, cache);
    const svcSetelahRestart = () => new OrderContextService(prisma, settings, new ShippingQuoteCache());
    const asks = () => rows.filter((r) => r.type === 'funnel_ask');
    return { svc, svcSetelahRestart, cache, rows, messages, asks, updateMany };
  }

  it('pesan yang membawa langkah → `funnel_ask` ditulis dan kolomnya DIKOSONGKAN', async () => {
    const h = harnessPesan([{ id: 'out-1', funnelStep: 'patokan' }]);

    await h.svc.promosikanLangkahTerkirim('c1', 'out-1');

    expect(h.asks()).toHaveLength(1);
    expect(h.asks()[0].payload).toEqual(expect.objectContaining({ step: 'patokan', messageId: 'out-1' }));
    expect(h.messages.get('out-1')?.funnelStep).toBeNull();
  });

  it('TERTIMPA: cache sudah berisi langkah LAIN, promosi tetap memakai milik PESAN', async () => {
    const h = harnessPesan([{ id: 'out-1', funnelStep: 'closing' }]);
    // Giliran berikutnya (atau endpoint debug grounding) menimpa slot percakapan.
    h.cache.setFunnelExpect('c1', { messageId: 'cust-9', step: 'qty', kalimat: 'berapa pcs' });

    await h.svc.promosikanLangkahTerkirim('c1', 'out-1');

    expect(h.asks()).toHaveLength(1);
    expect(h.asks()[0].payload).toEqual(expect.objectContaining({ step: 'closing' }));
  });

  it('RESTART: cache kosong total, promosi tetap jalan dari kolom pesan', async () => {
    const h = harnessPesan([{ id: 'out-1', funnelStep: 'closing' }]);

    await h.svcSetelahRestart().promosikanLangkahTerkirim('c1', 'out-1');

    expect(h.asks()).toHaveLength(1);
    expect(h.rows.some((r) => r.type === 'completed')).toBe(true);
  });

  it('IDEMPOTEN LINTAS RESTART: approve dua kali → tetap SATU `funnel_ask`', async () => {
    const h = harnessPesan([{ id: 'out-1', funnelStep: 'closing' }]);

    await h.svc.promosikanLangkahTerkirim('c1', 'out-1');
    await h.svcSetelahRestart().promosikanLangkahTerkirim('c1', 'out-1');

    expect(h.asks()).toHaveLength(1);
    expect(h.rows.filter((r) => r.type === 'completed')).toHaveLength(1);
  });

  /**
   * Yang membuat klaimnya harus ATOMIK, bukan sekadar "baca lalu tulis": DUA
   * pemanggil bisa membaca kolom yang sama sebelum salah satunya sempat
   * mengosongkannya. Nyata di produksi — jalur kirim WA menembak `noteOutbound`
   * dan pipeline juga mempromosikan di ujung `run()`.
   *
   * Test ini yang MEMBUNUH mutasi "syarat `funnelStep: { not: null }` dihapus";
   * versi sekuensial di atas tidak, karena `findUnique` sudah menyaringnya.
   * Dibuktikan dengan menjalankan mutasinya, bukan diasumsikan.
   */
  it('BALAPAN: dua promosi bersamaan untuk pesan yang sama → tetap SATU `funnel_ask` dan SATU `completed`', async () => {
    const h = harnessPesan([{ id: 'out-1', funnelStep: 'closing' }]);
    const lain = h.svcSetelahRestart();

    await Promise.all([
      h.svc.promosikanLangkahTerkirim('c1', 'out-1'),
      lain.promosikanLangkahTerkirim('c1', 'out-1'),
    ]);

    expect(h.asks()).toHaveLength(1);
    expect(h.rows.filter((r) => r.type === 'completed')).toHaveLength(1);
  });

  /** Tanpa ini: pelanggan membatalkan → admin approve draft `closing` lama →
   *  penanda `completed` tertulis di atas `cancelled` → `candidates()` break →
   *  konteks order yang sedang berjalan MUSNAH. Temuan penyanggal K23. */
  it('penanda lifecycle MENGOSONGKAN kolom seluruh percakapan (bukan cuma cache)', async () => {
    const h = harnessPesan([
      { id: 'draft-lama', funnelStep: 'closing' },
      { id: 'draft-lain', funnelStep: 'patokan' },
    ]);

    await h.svc.recordMarker('c1', 'cancelled', 'cancel_keyword');

    expect(h.messages.get('draft-lama')?.funnelStep).toBeNull();
    expect(h.messages.get('draft-lain')?.funnelStep).toBeNull();

    await h.svc.promosikanLangkahTerkirim('c1', 'draft-lama');
    expect(h.asks()).toHaveLength(0);
    expect(h.rows.filter((r) => r.type === 'completed')).toHaveLength(0);
  });

  /** Kolom ini tidak punya umur, sementara cache punya `funnelExpectSegar` DAN
   *  amnesia restart. "Tahan restart" justru menghapus pembatas umur itu. */
  it('pesan yang lebih tua dari `orderContextStaleHours` DITOLAK', async () => {
    const h = harnessPesan([
      { id: 'out-tua', funnelStep: 'closing', createdAt: new Date(Date.now() - 25 * 3_600_000) },
    ]);

    await h.svc.promosikanLangkahTerkirim('c1', 'out-tua');

    expect(h.rows).toHaveLength(0);
    expect(h.messages.get('out-tua')?.funnelStep).toBe('closing');
  });

  /** Jalur approve draft & jalur kirim WA memakai `noteOutbound`. Mutasi
   *  "hapus promosi dari `noteOutboundSent`" sebelumnya LOLOS 1019 test —
   *  yaitu seluruh alasan pekerjaan ini ada tidak terjaga sama sekali. */
  it('`noteOutbound` (approve admin / kirim WA) MEMPROMOSIKAN langkah pesan itu', async () => {
    const h = harnessPesan([{ id: 'draft-1', funnelStep: 'patokan' }]);

    await h.svc.noteOutbound('c1', 'draft-1', 'boleh diinfokan alamat lengkapnya kak?');

    expect(h.asks()).toHaveLength(1);
    expect(h.asks()[0].payload).toEqual(expect.objectContaining({ step: 'patokan', messageId: 'draft-1' }));
  });

  it('pesan tanpa langkah (mis. jawaban biasa) → nol baris', async () => {
    const h = harnessPesan([{ id: 'out-1', funnelStep: null }]);
    await h.svc.promosikanLangkahTerkirim('c1', 'out-1');
    expect(h.rows).toHaveLength(0);
  });

  it('klaim ditujukan ke PESAN yang benar — id lain tidak ikut terklaim', async () => {
    // Langkah non-`closing` SENGAJA: `closing` memicu penanda `completed`, dan
    // penanda menyapu kolom seluruh percakapan (lihat test berikutnya). Test ini
    // menguji SASARAN KLAIM, jadi jangan dicampur dengan efek penanda.
    const h = harnessPesan([
      { id: 'out-1', funnelStep: 'patokan' },
      { id: 'out-2', funnelStep: 'total' },
    ]);

    await h.svc.promosikanLangkahTerkirim('c1', 'out-1');

    expect(h.messages.get('out-1')?.funnelStep).toBeNull();
    expect(h.messages.get('out-2')?.funnelStep).toBe('total'); // tidak tersentuh
    expect(h.asks()).toHaveLength(1);
  });

  /** Efek samping yang DISENGAJA dan dicatat, bukan kejutan: closing yang
   *  benar-benar terkirim menutup sesi order, dan penutupan menyapu titipan
   *  langkah yang masih menempel di draft lain percakapan itu. Kalau tidak,
   *  draft lama bisa dipromosikan ke dalam order berikutnya. */
  it('closing yang TERKIRIM menutup sesi → titipan draft lain di percakapan itu ikut disapu', async () => {
    const h = harnessPesan([
      { id: 'out-closing', funnelStep: 'closing' },
      { id: 'draft-lain', funnelStep: 'patokan' },
    ]);

    await h.svc.promosikanLangkahTerkirim('c1', 'out-closing');

    expect(h.rows.filter((r) => r.type === 'completed')).toHaveLength(1);
    expect(h.messages.get('draft-lain')?.funnelStep).toBeNull();
  });
});
