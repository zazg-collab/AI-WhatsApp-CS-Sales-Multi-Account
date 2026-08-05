import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
// >>> ANGGA — addendum v2 M1/M3: deteksi produk di teks keluar/form memakai
// pencocok katalog yang sama dengan resolveItems (satu perilaku, satu sumber).
import { tokenizeForMatch, scoreProductMatch } from '../products/products.util';
// <<< ANGGA

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

/** >>> ANGGA — addendum v2 M1: PENAWARAN — produk yang disodorkan sistem/bot/
 *  admin ke pelanggan (teks/media/form). Jangkar deterministik untuk kata
 *  tunjuk ("yg ini", "yg itu") dan fallback konteks sebelum ada kutipan. <<< */
export interface OfferEntry {
  items: OrderSnapshotItem[];
  medium: 'text' | 'media' | 'form';
  createdAt: Date;
  /** true = masih dalam jendela `orderOfferWindowMinutes`. */
  fresh: boolean;
}

/** Berapa event terakhir yang dibaca saat menyusun kandidat. Parameter teknis
 *  (bukan angka bisnis): satu sesi belanja wajar jauh di bawah ini. */
export const CANDIDATE_SCAN_LIMIT = 50;

/** >>> ANGGA — addendum v2 M1: batas produk yang dicatat per satu penawaran
 *  (pesan katalog panjang tetap terekam tanpa membengkak). Parameter teknis. */
export const MAX_OFFER_ITEMS = 4;

/** Ambang skor pencocokan nama produk — SAMA dengan MIN_PRODUCT_MATCH_SCORE
 *  di shipping.service (nilai disalin sebagai konstanta teknis untuk
 *  menghindari impor melingkar; dijaga selaras lewat tes). */
const MIN_MATCH_SCORE = 2;

/**
 * Produk katalog yang DISEBUT di teks (skor ≥ ambang), terurut skor menurun.
 * Dipakai M1 (offer scan pesan keluar), M3 (seed form), dan interseksi deixis.
 * Pure + diekspor supaya bisa diuji tanpa Nest/DB.
 */
export function catalogMatchesInText(
  text: string,
  products: Array<{ id: string; sku?: string | null; name: string }>,
): Array<{ productId: string; sku: string | null; name: string; score: number }> {
  const tokens = tokenizeForMatch(text ?? '');
  if (!tokens.size) return [];
  return (products ?? [])
    .map((p) => ({
      productId: p.id,
      sku: p.sku ?? null,
      name: p.name,
      score: scoreProductMatch(p as never, tokens),
    }))
    .filter((m) => m.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);
}

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
  /** >>> ANGGA — addendum v2 M1: pagar dedupe penawaran per pesan (bounded). */
  private readonly offerWrittenFor = new Set<string>();
  // <<< ANGGA

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async oc() {
    return this.settings.orderContext();
  }

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
    const cfg = await this.oc();
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
      const cfg = await this.oc();
      const note = (cfg.orderClosingNote ?? '').trim();
      if (note.length < 10) return;
      if (!text.includes(note)) return;
      await this.recordMarker(conversationId, 'completed', 'closing');
    } catch (err) {
      this.logger.warn(`Gagal deteksi closing ${conversationId}: ${err}`);
    }
  }

  // >>> ANGGA — addendum v2 M1: hook TUNGGAL untuk pesan keluar yang
  // benar-benar terkirim — (a) deteksi closing (marker selesai), (b) scan
  // PENAWARAN: teks yang menyebut produk katalog tercatat sebagai offer.
  // Fire-and-forget dari jalur kirim; tidak pernah melempar.
  async noteOutbound(conversationId: string, messageId: string, text: string): Promise<void> {
    await this.noteOutboundSent(conversationId, text);
    await this.scanOffer(conversationId, messageId, text, 'text');
  }

  /** M3 — seed deterministik dari pesan FORM funnel (masuk ATAU keluar):
   *  pesan memuat frasa penanda form → produk di dalamnya dicatat sebagai
   *  penawaran `form`, TANPA lewat LLM (pesan template = fakta pasti). */
  async noteInboundForm(conversationId: string, messageId: string, text: string): Promise<void> {
    if (!conversationId || !text) return;
    try {
      const cfg = await this.oc();
      const t = text.toLowerCase();
      const isForm = (cfg.orderFormHintKeywords ?? []).some(
        (k) => k && t.includes(k.toLowerCase()),
      );
      if (!isForm) return;
      await this.scanOffer(conversationId, messageId, text, 'form');
    } catch (err) {
      this.logger.warn(`Gagal seed form ${conversationId}: ${err}`);
    }
  }

  /** Scan teks → produk katalog yang disebut → recordOffer. Dedupe per pesan. */
  private async scanOffer(
    conversationId: string,
    messageId: string,
    text: string,
    medium: 'text' | 'media' | 'form',
  ): Promise<void> {
    if (!conversationId || !messageId || !text) return;
    const key = `${conversationId}:${messageId}`;
    if (this.offerWrittenFor.has(key)) return;
    try {
      const products = await (this.prisma as unknown as {
        product: { findMany(args: Record<string, unknown>): Promise<Array<{ id: string; sku?: string | null; name: string }>> };
      }).product.findMany({ where: { status: 'active' }, take: 500 });
      const matches = catalogMatchesInText(text, products);
      if (!matches.length) return;
      this.offerWrittenFor.add(key);
      while (this.offerWrittenFor.size > 1000) {
        const oldest = this.offerWrittenFor.values().next().value;
        if (oldest === undefined) break;
        this.offerWrittenFor.delete(oldest);
      }
      await this.recordOffer(
        conversationId,
        matches.slice(0, MAX_OFFER_ITEMS).map((m) => ({
          productId: m.productId,
          sku: m.sku,
          name: m.name,
          qty: 1,
        })),
        medium,
        messageId,
      );
    } catch (err) {
      this.logger.warn(`Gagal scan penawaran ${conversationId}: ${err}`);
    }
  }

  /** Catat penawaran (M1). Tidak pernah melempar. */
  async recordOffer(
    conversationId: string,
    items: OrderSnapshotItem[],
    medium: 'text' | 'media' | 'form',
    messageId?: string,
  ): Promise<void> {
    if (!conversationId || !items?.length) return;
    try {
      await this.table.create({
        data: {
          conversationId,
          type: 'offer',
          payload: { items, medium, messageId: messageId ?? null } as unknown as object,
          source: medium,
        },
      });
    } catch (err) {
      this.logger.warn(`Gagal menulis penawaran ${conversationId}: ${err}`);
    }
  }

  /**
   * Penawaran SETELAH penanda lifecycle terakhir, terbaru dulu, berlabel
   * `fresh` (jendela `orderOfferWindowMinutes`). Dipakai resolusi deixis
   * ("yg ini") dan fallback konteks pra-kutipan (form seed).
   */
  async recentOffers(conversationId: string): Promise<OfferEntry[]> {
    if (!conversationId) return [];
    let rows: Array<{ type: string; payload: unknown; createdAt: Date }>;
    try {
      rows = await this.table.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: CANDIDATE_SCAN_LIMIT,
      });
    } catch (err) {
      this.logger.warn(`Gagal membaca penawaran ${conversationId}: ${err}`);
      return [];
    }
    const cfg = await this.oc();
    const windowMs = Math.max(1, cfg.orderOfferWindowMinutes) * 60_000;
    const now = Date.now();
    const out: OfferEntry[] = [];
    for (const row of rows) {
      if (row.type === 'completed' || row.type === 'cancelled') break;
      if (row.type !== 'offer') continue;
      const p = row.payload as { items?: unknown; medium?: unknown } | null;
      if (!p || typeof p !== 'object') continue;
      const items = (Array.isArray(p.items) ? p.items : [])
        .filter((i): i is OrderSnapshotItem => !!i && typeof (i as OrderSnapshotItem).productId === 'string' && typeof (i as OrderSnapshotItem).name === 'string')
        .map((i) => ({ productId: i.productId, sku: i.sku ?? null, name: i.name, qty: Number(i.qty) > 0 ? Math.floor(Number(i.qty)) : 1 }));
      if (!items.length) continue;
      out.push({
        items,
        medium: (p.medium === 'media' || p.medium === 'form' ? p.medium : 'text'),
        createdAt: row.createdAt,
        fresh: now - new Date(row.createdAt).getTime() <= windowMs,
      });
    }
    return out;
  }

  /**
   * M4 — kandidat segmen BERJALAN + snapshot segmen COMPLETED terakhir.
   * Segmen completed hanya boleh dipakai bila pelanggan MERUJUKNYA eksplisit
   * (orderReferenceKeywords) — dihitung ulang inputnya, wajib bridge.
   */
  async candidatesWithCompleted(conversationId: string): Promise<{
    current: OrderContextEntry[];
    lastCompleted: OrderContextEntry[];
  }> {
    const current = await this.candidates(conversationId);
    const empty = { current, lastCompleted: [] as OrderContextEntry[] };
    if (!conversationId) return empty;
    let rows: Array<{ type: string; payload: unknown; createdAt: Date }>;
    try {
      rows = await this.table.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: CANDIDATE_SCAN_LIMIT,
      });
    } catch {
      return empty;
    }
    // Cari marker pertama; hanya jenis `completed` yang boleh dirujuk balik
    // (order `cancelled` memang dibatalkan — tidak untuk dilanjutkan).
    let i = 0;
    while (i < rows.length && rows[i].type !== 'completed' && rows[i].type !== 'cancelled') i++;
    if (i >= rows.length || rows[i].type !== 'completed') return empty;
    const lastCompleted: OrderContextEntry[] = [];
    for (let j = i + 1; j < rows.length; j++) {
      const row = rows[j];
      if (row.type === 'completed' || row.type === 'cancelled') break;
      if (row.type !== 'snapshot') continue;
      const p = row.payload as Partial<OrderSnapshot> | null;
      if (!p || typeof p !== 'object') continue;
      const items = (Array.isArray(p.items) ? p.items : [])
        .filter((it): it is OrderSnapshotItem => !!it && typeof it.productId === 'string' && typeof it.name === 'string')
        .map((it) => ({ productId: it.productId, sku: it.sku ?? null, name: it.name, qty: Number(it.qty) > 0 ? Math.floor(Number(it.qty)) : 1 }));
      lastCompleted.push({
        snapshot: {
          city: String(p.city ?? ''),
          province: String(p.province ?? ''),
          destinationId: String(p.destinationId ?? ''),
          items,
        },
        createdAt: row.createdAt,
        // Segmen completed selalu diperlakukan TIDAK segar untuk keperluan
        // jawaban langsung — hanya boleh lewat jalur referensi eksplisit.
        fresh: false,
      });
    }
    return { current, lastCompleted };
  }
  // <<< ANGGA (addendum v2)

  // >>> ANGGA — E1 (2026-08-05, ketok Bossfren): SAMBUTAN FORM deterministik.
  // Pesan form funnel = momen paling ter-skrip di alur CS (Aluna/Defa selalu
  // balas template yang sama) → kontrak KODE, bukan harapan ke LLM: template
  // AppSetting dirender SISTEM (nama dari "atas nama X" / profil WA, produk &
  // harga dari KATALOG — harga promo cuma gimmick, ketok Bossfren), sekali per
  // percakapan (jejak persisten event `form_welcome` di log yang sama).
  // Angka ditulis sistem → gerbang uang tidak pernah terlibat. Return null =
  // bukan momen form / sudah disambut / fitur mati → pemanggil lanjut ke LLM.
  async formWelcome(
    conversationId: string,
    messageId: string,
    text: string,
    fallbackName?: string | null,
    // Ketok Bossfren: baris "No HP" diisi nomor WA PENGIRIM (form backend tidak
    // terjangkau bot) — placeholder {{no_hp_form}}.
    phoneNumber?: string | null,
  ): Promise<string | null> {
    if (!conversationId || !text) return null;
    try {
      const cfg = await this.oc();
      const template = (cfg.orderFormWelcomeTemplate ?? '').trim();
      if (!template) return null;
      const t = text.toLowerCase();
      const isForm = (cfg.orderFormHintKeywords ?? []).some(
        (k) => k && t.includes(k.toLowerCase()),
      );
      if (!isForm) return null;
      const products = await (this.prisma as unknown as {
        product: {
          findMany(args: Record<string, unknown>): Promise<
            Array<{ id: string; sku?: string | null; name: string; price?: unknown }>
          >;
        };
      }).product.findMany({ where: { status: 'active' }, take: 500 });
      const matches = catalogMatchesInText(text, products);
      if (!matches.length) return null;
      // Sekali per percakapan (ketok Bossfren) — pagar PERSISTEN, selamat
      // dari restart, lewat event di log yang sama. Jenis event asing di luar
      // snapshot/offer/marker di-skip pembaca lain (loop mereka `continue`).
      const prior = await this.table.findMany({
        where: { conversationId, type: 'form_welcome' },
        take: 1,
      });
      if (prior.length) return null;
      const nama =
        /atas\s+nama\s+([^\n,.;]{2,40})/i.exec(text)?.[1]?.trim() ||
        (fallbackName ?? '').trim() ||
        'kak';
      const prod = products.find((p) => p.id === matches[0].productId);
      const harga = Number(prod?.price ?? 0);
      const rendered = template
        .replace(/\{\{nama_form\}\}/gi, nama)
        .replace(/\{\{produk_form\}\}/gi, matches[0].name)
        .replace(/\{\{harga_form\}\}/gi, harga > 0 ? `Rp${harga.toLocaleString('id-ID')}` : '')
        .replace(/\{\{no_hp_form\}\}/gi, (phoneNumber ?? '').trim());
      await this.table.create({
        data: {
          conversationId,
          type: 'form_welcome',
          payload: { messageId } as unknown as object,
          source: 'system',
        },
      });
      return rendered;
    } catch (err) {
      this.logger.warn(`Gagal sambutan form ${conversationId}: ${err}`);
      return null;
    }
  }
  // <<< ANGGA

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
