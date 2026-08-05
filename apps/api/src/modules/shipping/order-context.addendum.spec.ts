import {
  OrderContextService,
  catalogMatchesInText,
  type OrderSnapshot,
} from './order-context.service';

/**
 * >>> ANGGA — addendum v2 (2026-08-05): unit tes lapisan service untuk
 * mekanisme baru (offer registry M1, seed form M3, jangkauan lintas-marker
 * M4). Tes ALUR RED-first-nya ada di `shipping.order-context.spec.ts`.
 */

const H = 3_600_000;
const PRODUCTS = [
  { id: 'p-golok', sku: 'GLK-02', name: 'Golok Sembelih Multifungsi', status: 'active' },
  { id: 'p-gke', sku: 'GKE-40', name: 'GKE 40 Perak Duralium 2 - Fb - NFR', status: 'active' },
];

function snap(items: Array<[string, string, number]>): OrderSnapshot {
  return {
    city: 'MEDAN',
    province: 'SUMATERA UTARA',
    destinationId: 'dest-1',
    items: items.map(([productId, name, qty]) => ({ productId, name, qty })),
  };
}

function harness(rows: Array<{ type: string; payload: unknown; createdAt: Date }> = []) {
  const create = jest.fn().mockResolvedValue({});
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma: any = {
    orderContextEvent: { create, findMany },
    product: { findMany: jest.fn().mockResolvedValue(PRODUCTS) },
  };
  const settings: any = {
    orderContext: jest.fn().mockResolvedValue({
      orderContextStaleHours: 24,
      orderOfferWindowMinutes: 60,
      orderClosingNote: '',
      orderFormHintKeywords: ['form pemesanan', 'sudah melakukan pemesanan', 'mengisi form'],
    }),
    shipping: jest.fn().mockResolvedValue({}),
  };
  const svc = new OrderContextService(prisma, settings);
  return { svc, create, findMany, prisma };
}

describe('catalogMatchesInText — pencocok produk di teks (M1/M3)', () => {
  it('nama produk funnel bersufiks kampanye tetap cocok', () => {
    const m = catalogMatchesInText(
      'Halo, saya sudah melakukan pemesanan GKE 40 Perak Duralium 2 - Fb - NFR , atas nama Putri',
      PRODUCTS,
    );
    expect(m[0]).toEqual(expect.objectContaining({ productId: 'p-gke' }));
  });

  it('teks tanpa produk katalog → kosong', () => {
    expect(catalogMatchesInText('halo kak mau tanya dong', PRODUCTS)).toEqual([]);
  });
});

describe('noteInboundForm — seed deterministik pesan form (M3)', () => {
  it('pesan form → event offer medium form, tanpa LLM', async () => {
    const h = harness();
    await h.svc.noteInboundForm('c1', 'm1', 'Halo, saya sudah melakukan pemesanan GKE 40 Perak Duralium 2 - Fb - NFR, mohon diproses');
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'offer',
        source: 'form',
        payload: expect.objectContaining({
          items: [expect.objectContaining({ productId: 'p-gke' })],
        }),
      }),
    }));
  });

  it('pesan biasa (bukan form) → tidak seed', async () => {
    const h = harness();
    await h.svc.noteInboundForm('c1', 'm1', 'GKE 40 Perak Duralium ada stok?');
    expect(h.create).not.toHaveBeenCalled();
  });

  it('dedupe per pesan: panggilan kedua messageId sama tidak menulis lagi', async () => {
    const h = harness();
    const teks = 'saya sudah melakukan pemesanan GKE 40 Perak Duralium';
    await h.svc.noteInboundForm('c1', 'm1', teks);
    await h.svc.noteInboundForm('c1', 'm1', teks);
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});

describe('noteOutbound — closing + scan penawaran (M1)', () => {
  it('teks keluar menyebut produk → offer medium text tercatat', async () => {
    const h = harness();
    await h.svc.noteOutbound('c1', 'out1', 'Ini yaa kak GOLOK SEMBELIH MULTIFUNGSI, best seller kami');
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'offer',
        payload: expect.objectContaining({
          items: [expect.objectContaining({ productId: 'p-golok' })],
        }),
      }),
    }));
  });

  it('teks keluar tanpa produk → tidak ada offer', async () => {
    const h = harness();
    await h.svc.noteOutbound('c1', 'out1', 'Siap kak, ditunggu ya 🙏');
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe('recentOffers — jendela & penanda (M1)', () => {
  const now = Date.now();
  const offerRow = (minAgo: number, productId = 'p-golok', name = 'Golok Sembelih Multifungsi') => ({
    type: 'offer',
    payload: { items: [{ productId, sku: null, name, qty: 1 }], medium: 'text' },
    createdAt: new Date(now - minAgo * 60_000),
  });

  it('penawaran > jendela 60 menit ditandai TIDAK segar', async () => {
    const h = harness([offerRow(90)]);
    const out = await h.svc.recentOffers('c1');
    expect(out).toHaveLength(1);
    expect(out[0].fresh).toBe(false);
  });

  it('penawaran SEBELUM penanda lifecycle tidak ikut', async () => {
    const h = harness([
      { type: 'completed', payload: null, createdAt: new Date(now - 10 * 60_000) },
      offerRow(20),
    ]);
    expect(await h.svc.recentOffers('c1')).toEqual([]);
  });
});

describe('candidatesWithCompleted — jangkauan referensi (M4)', () => {
  const now = Date.now();

  it('mengembalikan segmen berjalan + snapshot order COMPLETED terakhir (fresh=false)', async () => {
    const h = harness([
      { type: 'snapshot', payload: snap([['p-golok', 'Golok Sembelih Multifungsi', 1]]), createdAt: new Date(now - 1 * H) },
      { type: 'completed', payload: null, createdAt: new Date(now - 2 * H) },
      { type: 'snapshot', payload: snap([['p-gke', 'GKE 40 Perak Duralium', 1]]), createdAt: new Date(now - 3 * H) },
    ]);
    const out = await h.svc.candidatesWithCompleted('c1');
    expect(out.current).toHaveLength(1);
    expect(out.lastCompleted).toHaveLength(1);
    expect(out.lastCompleted[0].snapshot.items[0].productId).toBe('p-gke');
    expect(out.lastCompleted[0].fresh).toBe(false);
  });

  it('order CANCELLED tidak bisa dirujuk balik', async () => {
    const h = harness([
      { type: 'cancelled', payload: null, createdAt: new Date(now - 1 * H) },
      { type: 'snapshot', payload: snap([['p-gke', 'GKE 40', 1]]), createdAt: new Date(now - 2 * H) },
    ]);
    const out = await h.svc.candidatesWithCompleted('c1');
    expect(out.lastCompleted).toEqual([]);
  });
});
