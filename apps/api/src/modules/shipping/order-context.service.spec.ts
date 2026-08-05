import {
  OrderContextService,
  mergeSnapshots,
  type OrderSnapshot,
} from './order-context.service';

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
