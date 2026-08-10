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
