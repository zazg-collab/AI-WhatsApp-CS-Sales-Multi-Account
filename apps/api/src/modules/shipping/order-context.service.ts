import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * >>> ANGGA — Order Context Log (blueprint 2026-08-04 + amendemen v1.1).
 *
 * Memori order per percakapan, ter-persist di Postgres (tabel
 * `order_context_events`, APPEND-ONLY) — menggantikan peran cache in-memory
 * sebagai SUMBER KEBENARAN konteks; cache kutipan tetap ada tapi cuma memo
 * performa. Konteks selamat dari restart proses.
 *
 * Prinsip yang dijaga kelas ini:
 *  - Log menyimpan INPUT order (productId/nama/qty + tujuan ber-destinationId),
 *    TIDAK PERNAH dipakai membacakan ulang angka uang — harga/ongkir dihitung
 *    ulang dari katalog + API saat menjawab (v1.1 §12.1-2).
 *  - Satu giliran satu kebenaran: snapshot ditulis maksimal SEKALI per pesan
 *    customer (pagar messageId, pola `bumpAsk`; v1.1 §12.1-1) — grounding
 *    terpanggil lebih dari sekali per giliran (prompt-builder lalu Sentinel).
 *  - Basi bukan hapus: entri lebih tua dari `orderContextStaleHours` keluar
 *    dari himpunan kandidat JAWABAN, tapi tetap boleh dipakai menyusun
 *    PERTANYAAN konfirmasi ("yang kemarin Golok itu ya kak?").
 *  - `completed`/`cancelled` = penanda kejadian di log yang sama (bukan
 *    delete); kandidat = entri SETELAH penanda terakhir.
 */

export interface OrderSnapshotItem {
  /** Identitas produk katalog — WAJIB (v1.1 §12.1-4: merge per identitas,
   *  bukan per nama; nama produk bisa diedit admin). */
  productId: string;
  sku?: string | null;
  name: string;
  qty: number;
}

export interface OrderSnapshot {
  city: string;
  province: string;
  destinationId: string;
  items: OrderSnapshotItem[];
}

export interface OrderContextEntry {
  snapshot: OrderSnapshot;
  createdAt: Date;
  /** true = masih dalam jendela `orderContextStaleHours` (boleh dipakai
   *  menjawab angka); false = basi (hanya untuk menyusun pertanyaan). */
  fresh: boolean;
}

export type OrderMarkerType = 'completed' | 'cancelled';

/** Berapa event terakhir yang dibaca saat menyusun kandidat. Parameter teknis
 *  (bukan angka bisnis): satu sesi belanja wajar jauh di bawah ini. */
export const CANDIDATE_SCAN_LIMIT = 50;

/**
 * Union per IDENTITAS PRODUK dari daftar snapshot (terbaru lebih dulu):
 * qty & nama diambil dari entri TERBARU per produk. Ini yang mencegah "total
 * semuanya" menghitung dobel saat snapshot beruntun tumpang tindih
 * ([Golok] lalu [Golok, Pisau]) — satu-satunya celah desain yang bisa
 * meloloskan angka salah MELEWATI gerbang uang (v1.1 §12.1-4).
 * Pure + diekspor supaya bisa diuji tanpa Nest/DB.
 */
export function mergeSnapshots(newestFirst: OrderSnapshot[]): OrderSnapshotItem[] {
  const byProduct = new Map<string, OrderSnapshotItem>();
  for (const snap of newestFirst) {
    for (const item of snap.items ?? []) {
      if (!item?.productId) continue;
      if (!byProduct.has(item.productId)) byProduct.set(item.productId, { ...item });
    }
  }
  return Array.from(byProduct.values());
}

/** Bentuk baris minimal yang dibutuhkan dari tabel — akses lewat cast
 *  struktural, BUKAN tipe klien Prisma yang di-generate: klien di laptop bisa
 *  saja belum di-`db:generate` saat kode ini di-typecheck (mount device bridge
 *  tidak bisa unlink file, `prisma generate` rawan gagal di sana). Perilaku
 *  runtime tetap Prisma asli; jest memakai mock. */
interface OrderContextTable {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  findMany(args: Record<string, unknown>): Promise<Array<{
    type: string;
    payload: unknown;
    createdAt: Date;
  }>>;
}

@Injectable()
export class OrderContextService {
  private readonly logger = new Logger(OrderContextService.name);
  /** Pagar "satu giliran satu kebenaran": messageId customer terakhir yang
   *  sudah menulis snapshot, per percakapan (pola `bumpAsk`). */
  private readonly writtenFor = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private get table(): OrderContextTable {
    return (this.prisma as unknown as { orderContextEvent: OrderContextTable })
      .orderContextEvent;
  }

  /**
   * Catat snapshot order untuk giliran ini. Idempoten per pesan customer:
   * panggilan kedua dengan `messageId` sama (Sentinel me-review giliran yang
   * sama) tidak menulis apa-apa. Gagal menulis TIDAK pernah melempar — log
   * adalah penolong, bukan jalur kritis balasan.
   */
  async recordSnapshot(
    conversationId: string,
    messageId: string,
    snapshot: OrderSnapshot,
    source: string,
  ): Promise<void> {
    if (!conversationId || !messageId) return;
    if (this.writtenFor.get(conversationId) === messageId) return;
    this.writtenFor.set(conversationId, messageId);
    try {
      await this.table.create({
        data: {
          conversationId,
          type: 'snapshot',
          payload: { ...snapshot, messageId } as unknown as object,
          source,
        },
      });
    } catch (err) {
      this.logger.warn(`Gagal menulis snapshot order ${conversationId}: ${err}`);
    }
  }

  /** Catat penanda lifecycle (selesai/batal). Tidak pernah melempar. */
  async recordMarker(
    conversationId: string,
    type: OrderMarkerType,
    source: string,
  ): Promise<void> {
    if (!conversationId) return;
    try {
      await this.table.create({
        data: { conversationId, type, payload: null, source },
      });
      // Penanda menutup sesi order → pagar snapshot direset supaya order baru
      // pasca-closing ("eh nambah 1 lagi") boleh menulis lagi di pesan yang sama.
      this.writtenFor.delete(conversationId);
    } catch (err) {
      this.logger.warn(`Gagal menulis penanda ${type} ${conversationId}: ${err}`);
    }
  }

  /**
   * Kandidat konteks percakapan ini: snapshot SETELAH penanda
   * `completed`/`cancelled` terakhir, terbaru lebih dulu, masing-masing diberi
   * label `fresh` (jendela `orderContextStaleHours`). Gagal baca → himpunan
   * kosong (jujur), bukan melempar.
   */
  async candidates(conversationId: string): Promise<OrderContextEntry[]> {
    if (!conversationId) return [];
    let rows: Array<{ type: string; payload: unknown; createdAt: Date }>;
    try {
      rows = await this.table.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: CANDIDATE_SCAN_LIMIT,
      });
    } catch (err) {
      this.logger.warn(`Gagal membaca log order ${conversationId}: ${err}`);
      return [];
    }
    const cfg = await this.settings.shipping();
    const staleMs = Math.max(1, cfg.orderContextStaleHours) * 3_600_000;
    const now = Date.now();

    const out: OrderContextEntry[] = [];
    for (const row of rows) {
      if (row.type === 'completed' || row.type === 'cancelled') break;
      if (row.type !== 'snapshot') continue;
      const p = row.payload as Partial<OrderSnapshot> | null;
      if (!p || typeof p !== 'object') continue;
      const items = (Array.isArray(p.items) ? p.items : [])
        .filter((i): i is OrderSnapshotItem => !!i && typeof i.productId === 'string' && typeof i.name === 'string')
        .map((i) => ({ productId: i.productId, sku: i.sku ?? null, name: i.name, qty: Number(i.qty) > 0 ? Math.floor(Number(i.qty)) : 1 }));
      out.push({
        snapshot: {
          city: String(p.city ?? ''),
          province: String(p.province ?? ''),
          destinationId: String(p.destinationId ?? ''),
          items,
        },
        createdAt: row.createdAt,
        fresh: now - new Date(row.createdAt).getTime() <= staleMs,
      });
    }
    return out;
  }

  /**
   * Deteksi "selesai order" dari pesan keluar yang BENAR-BENAR TERKIRIM:
   * pesan memuat teks catatan S&K (`orderClosingNote`, nilai penanda global
   * `{{catatan_sk}}` yang ditempel sistem — bukan tebakan dari kalimat bebas
   * model). Dipanggil dari jalur kirim (wa-inbound / approve), BUKAN saat
   * draft dibuat (draft bisa diedit/ditolak; v1.1 §12.3-11). Catatan kosong /
   * terlalu pendek → fitur mati (fallback: resolve percakapan).
   */
  async noteOutboundSent(conversationId: string, text: string): Promise<void> {
    if (!conversationId || !text) return;
    try {
      const cfg = await this.settings.shipping();
      const note = (cfg.orderClosingNote ?? '').trim();
      if (note.length < 10) return;
      if (!text.includes(note)) return;
      await this.recordMarker(conversationId, 'completed', 'closing');
    } catch (err) {
      this.logger.warn(`Gagal deteksi closing ${conversationId}: ${err}`);
    }
  }

  /** Entri SEGAR terbaru yang punya barang — anchor default "order aktif". */
  async latestFresh(conversationId: string): Promise<OrderContextEntry | null> {
    const all = await this.candidates(conversationId);
    return all.find((e) => e.fresh && e.snapshot.items.length > 0) ?? null;
  }

  /** Entri terbaru APA PUN umurnya (untuk menyusun pertanyaan konfirmasi saat
   *  semua entri sudah basi — basi haram untuk ANGKA, halal untuk PERTANYAAN). */
  async latestAny(conversationId: string): Promise<OrderContextEntry | null> {
    const all = await this.candidates(conversationId);
    return all.find((e) => e.snapshot.items.length > 0) ?? null;
  }
}
