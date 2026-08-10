import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ShippingQuoteCache } from './shipping-quote.cache';
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
  /** >>> ANGGA — Q-Chain (2026-08-05): true kalau qty di snapshot ini berasal
   *  dari SEBUTAN EKSPLISIT pelanggan (pola angka), bukan default 1. Slot
   *  funnel "qty" dianggap terisi hanya kalau ini true. <<< */
  qtyPasti?: boolean;
  /** >>> ANGGA — Q-Chain: true kalau snapshot ini lahir dari jawaban
   *  pertanyaan KONKLUSI keranjang — keranjang dianggap final utk funnel. <<< */
  konklusi?: boolean;
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
  /** >>> ANGGA — Q-Chain: pagar dedupe funnel_ask per (langkah, pesan). <<< */
  private readonly funnelAskWritten = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    // >>> ANGGA — fix (2026-08-10): cache dibutuhkan untuk MEMPROMOSIKAN
    // langkah funnel yang tertunda begitu balasannya benar-benar terkirim.
    // Opsional supaya test lama yang menyusun service ini dengan dua argumen
    // tetap sah. <<<
    @Optional() private readonly quoteCache?: ShippingQuoteCache,
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
      // >>> ANGGA — LANGKAH 2a butir 4 (2026-08-10): titipan langkah funnel
      // ikut dicabut. `clearFunnelExpect` ada sejak 2026-08-10 dan TIDAK
      // PERNAH DIPANGGIL siapa pun (temuan wasit `selesai-170`), sehingga
      // sesudah pesanan dibatalkan atau selesai, `funnelExpect` menggantung
      // sampai `orderContextStaleHours` (bawaan 24 jam). Selama jendela itu
      // klausa `menjawabDataKirim` di gerbang `jawabanUang` masih bisa
      // menghidupkan kembali funnel percakapan yang SUDAH ditutup — cukup
      // dengan pelanggan menyebut alamat atau nomor HP.
      //
      // Ditaruh di sini, bukan di pemanggil: ini SATU saluran sempit yang
      // dilewati SEMUA penutupan sesi order. Pemanggilnya EMPAT, bukan tiga
      // (dihitung ulang oleh penyanggal K23 — angka pertamaku salah):
      //   1. `shipping.service.ts` — kata pembatalan utuh → `cancelled`.
      //   2. `promosikanLangkahTerkirim` (di berkas ini) — closing yang
      //      BENAR-BENAR TERKIRIM → `completed`.
      //   3. `noteOutboundSent` (di berkas ini) — pencocokan `orderClosingNote`.
      //   4. `conversations.service.ts` — ADMIN menekan Resolve → `completed`.
      // Menaruhnya di pemanggil berarti menyalin invarian yang sama ke empat
      // tempat, dan salinan itu drift.
      //
      // Jalur ke-4 (`resolved`) sengaja TIDAK digerbangi khusus: penulisan
      // penandanya sendiri sudah mengosongkan `funnelAsks` dan `candidates`
      // (keduanya `break` di baris penanda), jadi mencabut titipan langkah
      // hanya membuat cache in-memory ikut mengatakan hal yang SAMA dengan
      // basis data. Membiarkannya menggantung justru menciptakan dua sumber
      // kebenaran yang bertentangan untuk percakapan yang sama.
      //
      // SENGAJA di jalur sukses (di dalam `try`, bukan `finally`), sejajar
      // dengan `writtenFor` di atas: kalau penandanya gagal ditulis, sesi
      // order tidak benar-benar tertutup dan titipan langkahnya harus tetap
      // ada. ⚠️ Catatan jujur (temuan K23): jalur pembatalan di
      // `shipping.service.ts` justru membersihkan lima keadaan cache lain
      // TANPA SYARAT sebelum `await recordMarker` — jadi "hanya di jalur
      // sukses" adalah pilihan berkas ini, bukan pakem rumah yang konsisten.
      //
      // ⚠️ Yang TIDAK ditutup di sini, sengaja (satu perubahan satu alasan):
      // `computeFunnelMeta` membaca `funnelExpect` TANPA cek umur, sementara
      // `funnelDirective` memakai `funnelExpectSegar`. Order yang berakhir
      // tanpa penanda sama sekali (pelanggan menghilang; auto-close SLA yang
      // memakai `updateMany` sehingga tidak pernah melewati sini) meninggalkan
      // sensor harga + kompresi riwayat menyala PERMANEN. Itu cacat terpisah
      // dengan sebab terpisah — irisannya sendiri, bukan ditumpangkan ke sini. <<<
      this.quoteCache?.clearFunnelExpect(conversationId);
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
          qtyPasti: (p as { qtyPasti?: unknown }).qtyPasti === true, // >>> ANGGA — Q-Chain <<<
          konklusi: (p as { konklusi?: unknown }).konklusi === true, // >>> ANGGA — Q-Chain <<<
        },
        createdAt: row.createdAt,
        fresh: now - new Date(row.createdAt).getTime() <= staleMs,
      });
    }
    return out;
  }

  // >>> ANGGA — Q-Chain (2026-08-05, MANDAT KERAS Bossfren): jejak pertanyaan
  // funnel per segmen (append-only, tabel sama, nol migrasi). Anti-cerewet:
  // satu langkah maks 2x per segmen — pembacanya `funnelAsks`.
  async recordFunnelAsk(conversationId: string, step: string, messageId: string): Promise<void> {
    if (!conversationId || !step) return;
    const key = `${conversationId}:${step}:${messageId}`;
    if (this.funnelAskWritten.has(key)) return; // grounding terpanggil ≥2x per giliran
    this.funnelAskWritten.add(key);
    while (this.funnelAskWritten.size > 1000) {
      const oldest = this.funnelAskWritten.values().next().value;
      if (oldest === undefined) break;
      this.funnelAskWritten.delete(oldest);
    }
    try {
      await this.table.create({
        data: { conversationId, type: 'funnel_ask', payload: { step, messageId } as unknown as object, source: 'system' },
      });
    } catch (err) {
      this.logger.warn(`Gagal menulis funnel_ask ${conversationId}: ${err}`);
    }
  }

  /** Berapa kali tiap langkah funnel sudah ditanyakan di SEGMEN berjalan. */
  async funnelAsks(conversationId: string): Promise<Record<string, number>> {
    if (!conversationId) return {};
    let rows: Array<{ type: string; payload: unknown; createdAt: Date }>;
    try {
      rows = await this.table.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: CANDIDATE_SCAN_LIMIT,
      });
    } catch {
      return {};
    }
    const out: Record<string, number> = {};
    for (const row of rows) {
      if (row.type === 'completed' || row.type === 'cancelled') break;
      if (row.type !== 'funnel_ask') continue;
      const step = String((row.payload as { step?: unknown } | null)?.step ?? '');
      if (step) out[step] = (out[step] ?? 0) + 1;
    }
    return out;
  }
  // <<< ANGGA

  /**
   * Deteksi "selesai order" dari pesan keluar yang BENAR-BENAR TERKIRIM:
   * pesan memuat teks catatan S&K (`orderClosingNote`, nilai penanda global
   * `{{catatan_sk}}` yang ditempel sistem — bukan tebakan dari kalimat bebas
   * model). Dipanggil dari jalur kirim (wa-inbound / approve), BUKAN saat
   * draft dibuat (draft bisa diedit/ditolak; v1.1 §12.3-11). Catatan kosong /
   * terlalu pendek → fitur mati (fallback: resolve percakapan).
   */
  /** >>> ANGGA — fix (2026-08-10): promosikan langkah funnel yang tertunda
   *  menjadi catatan permanen — dipanggil HANYA dari jalur pesan yang
   *  BENAR-BENAR TERKIRIM (pipeline balasan untuk WhatsApp maupun tester, dan
   *  `noteOutboundSent` untuk jalur kirim lain). Idempoten: aman dipanggil
   *  dua kali untuk pesan yang sama. <<< */
  private readonly langkahDipromosikan = new Set<string>();

  async promosikanLangkahTerkirim(conversationId: string): Promise<void> {
    if (!conversationId) return;
    const tertunda = this.quoteCache?.funnelExpect(conversationId) ?? null;
    if (!tertunda?.step) return;
    const kunci = `${conversationId}:${tertunda.step}:${tertunda.messageId ?? ''}`;
    if (this.langkahDipromosikan.has(kunci)) return;
    this.langkahDipromosikan.add(kunci);
    while (this.langkahDipromosikan.size > 1000) {
      const tertua = this.langkahDipromosikan.values().next().value;
      if (tertua === undefined) break;
      this.langkahDipromosikan.delete(tertua);
    }
    try {
      await this.recordFunnelAsk(conversationId, tertunda.step, tertunda.messageId ?? '');
      // Closing yang BENAR-BENAR TERKIRIM = order selesai. Ini penentu utama;
      // pencocokan string `orderClosingNote` tetap ada sebagai jalur kedua.
      if (tertunda.step === 'closing') {
        await this.recordMarker(conversationId, 'completed', 'closing');
      }
    } catch (err) {
      this.logger.warn(`Gagal promosi langkah funnel ${conversationId}: ${err}`);
    }
  }

  async noteOutboundSent(conversationId: string, text: string): Promise<void> {
    if (!conversationId || !text) return;

    // >>> ANGGA — fix (2026-08-10, TERBUKTI merugikan di lapangan): langkah
    // funnel dicatat DI SINI, sesudah balasannya benar-benar terkirim —
    // bukan di `pilih()` saat prompt baru disusun.
    //
    // Kejadiannya: giliran alamat menghasilkan langkah `closing`, catatannya
    // masuk saat prompt dibangun, lalu balasannya GAGAL TERKIRIM kena timeout
    // provider. Pelanggan tidak pernah melihat formulir pesanan — tapi funnel
    // sudah menganggap closing selesai, sehingga giliran berikutnya jatuh ke
    // `closing_followup` dan formulir itu hangus permanen.
    //
    // Balasan yang tidak sampai seharusnya cuma membuang satu giliran, bukan
    // membakar satu langkah. Arah kegagalannya sekarang aman: kalau promosi
    // ini gagal, langkahnya TIDAK tercatat dan bot mengulang pertanyaannya —
    // jauh lebih baik daripada melompatinya diam-diam. <<<
    await this.promosikanLangkahTerkirim(conversationId);
    try {
      // Order SELESAI. Dulu satu-satunya pendeteksinya adalah pencocokan
      // string `orderClosingNote` VERBATIM di teks — dan nilai bawaannya
      // KOSONG, sehingga `note.length < 10` membuat fitur ini mati total di
      // pemasangan mana pun yang tidak mengisinya. Template closing TRANSFER
      // bahkan tidak memuat `{{catatan_sk}}` sama sekali, jadi order transfer
      // tidak akan pernah selesai walau notenya diisi.
      //
      // Akibat berantainya besar: tanpa marker, `funnelAsks` tidak pernah
      // ter-reset, `asks['closing']` tetap >= 1 selamanya, dan
      // `closing_followup` — yang SENGAJA menembus cap 2x — menodong
      // "pesanannya mau diproses sekarang kak?" tanpa batas.
      //
      // Sekarang langkah funnel yang jadi penentu utama: closing yang
      // BENAR-BENAR TERKIRIM = order selesai. Pencocokan string tetap
      // dipertahankan sebagai jalur kedua supaya pemasangan yang sudah
      // mengandalkannya tidak berubah perilaku.
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
