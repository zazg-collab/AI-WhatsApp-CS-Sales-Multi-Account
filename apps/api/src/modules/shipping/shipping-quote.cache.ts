import { Injectable } from '@nestjs/common';

/**
 * >>> ANGGA — Cache kutipan ongkir per percakapan (LAMPIRAN §8, Rule 8).
 *
 * Kelas baru dengan pendekatan IDENTIK `ai-cache.service.ts` (Map + `expiresAt`
 * dicek pakai `Date.now()`, eviction insertion-order, TANPA Redis), tapi
 * instance & TTL-nya sendiri: 6 jam, bukan 10 menit — karena yang di-cache di
 * sini "tujuan yang dipakai sepanjang sesi belanja", bukan "pertanyaan sama
 * diulang sebentar".
 *
 * Satu tujuan aktif per percakapan (Rule 8): key = `conversationId` saja, dan
 * begitu kota yang terdeteksi berbeda dari yang tersimpan, entri lama DIRESET,
 * bukan ditambah.
 */

/** Batas entri sebelum yang tertua dibuang. Parameter teknis (bukan angka
 *  bisnis §6), sejajar `MAX_ENTRIES` di `ai-cache.service.ts`. */
export const MAX_QUOTE_ENTRIES = 500;
/** Berapa lama hasil terakhir per percakapan diingat untuk keperluan gate
 *  Sentinel (Langkah 11). Pendek saja: balasan dibuat lalu langsung direview
 *  dalam hitungan detik di proses yang sama. Parameter teknis. */
export const OUTCOME_MEMO_MS = 5 * 60 * 1000;

/** Status hasil satu upaya kutipan ongkir. Dipakai grounding text + gate. */
export type ShippingOutcome =
  | 'ok'
  | 'no_destination'
  | 'ambiguous'
  | 'need_more_detail'
  | 'destination_stuck'
  | 'unresolved_items'
  | 'item_ambiguous' // >>> ANGGA — Order Context Log: nama barang cocok >1 produk, bot bertanya <<<
  | 'no_courier'
  | 'api_error'
  | 'not_configured';

export interface ShippingQuote {
  /** CITY_NAME dari hasil Search Address. */
  city: string;
  /** PROVINCE_NAME — dipakai Rule 3 (blokir COD per wilayah). */
  province: string;
  destinationId: string;
  /** Berat total order setelah konversi ke kg (dibulatkan ke atas). */
  weightKg: number;
  /** Total harga barang (Σ qty × harga katalog). 0 kalau kutipan ongkir-saja. */
  goodsTotal: number;
  /** >>> ANGGA: true kalau dihitung TANPA daftar barang — hanya mungkin lewat
   *  alat uji admin, tidak pernah dari percakapan pelanggan. Angkanya berarti
   *  ONGKIR saja, bukan total belanja. */
  shippingOnly: boolean;
  /** Nama barang yang disebut pelanggan tapi tidak cocok katalog (kalau ada). */
  unmatchedNames?: string[];
  /** >>> ANGGA — Q-Chain v3 (2026-08-05): estimasi tiba "x-y hari" dari
   *  `estimatedDate` kurir terpilih (API Mengantar). Null bila API tak
   *  menyediakan. <<< */
  eta?: string | null;
  transferCourier: string;
  /** Total transfer SUDAH dibulatkan (Rule 11). */
  transferTotal: number;
  codCourier: string | null;
  /** Total COD SUDAH dibulatkan (Rule 11). Null kalau COD tidak ditawarkan. */
  codTotal: number | null;
  codEligible: boolean;
  /** Alasan COD tidak tersedia, untuk grounding text (bukan angka). */
  codBlockedReason: 'region' | 'no_eligible_courier' | null;
  items: Array<{ name: string; qty: number }>;

  // >>> ANGGA — Fase 113 (2026-08-04): "model menulis KALIMAT, sistem menulis
  // ANGKA UANG". Field di bawah TIDAK PERNAH dibaca LLM langsung — hanya
  // dipakai `buildPriceTokens`/`katalogPenanda` di shipping.service.ts untuk
  // menyusun katalog penanda `{{token}}` dan mengisi nilainya sesudah model
  // menjawab. Menggantikan `getGroundingNumbers()` yang dihapus (dulu satu-
  // satunya pemakainya adalah `checkPriceGrounding`, yang juga dihapus).
  /** Rincian per barang yang cocok katalog — sumber {{rincian_order}} dan
   *  {{harga_satuan}} (yang terakhir HANYA ditawarkan kalau seluruh barang di
   *  order ini satu harga; lihat `buildPriceTokens`). Kosong kalau shippingOnly.
   *  >>> ANGGA — Order Context Log: productId/sku ikut disimpan sebagai
   *  identitas untuk snapshot log (merge per identitas, bukan per nama). <<< */
  matchedItems: Array<{ productId?: string; sku?: string | null; name: string; qty: number; unitPrice: number; lineTotal: number }>;
  /** Ongkir TRANSFER saja (estimatedPrice kurir terpilih) — sumber {{ongkir}}. */
  shippingFee: number;
  /** Potongan ongkir TRANSFER, sudah dibulatkan ke BAWAH ke priceRoundingIncrement
   *  (Rule diskon Fase 113 — supaya tidak pernah melewati plafon). 0 kalau
   *  shippingOnly atau shippingDiscountPercentMax = 0. */
  shippingDiscount: number;
  /** transferTotal - shippingDiscount. 0 kalau shippingDiscount = 0 (tidak
   *  ditawarkan sebagai penanda saat itu — lihat katalogPenanda). */
  transferTotalDiscounted: number;
  /** Ongkir COD saja (estimatedPrice kurir COD terpilih). Null kalau COD tidak
   *  ditawarkan pada kutipan ini. */
  codShippingFee: number | null;
  /** Potongan ongkir COD, pembulatan sama seperti shippingDiscount. Null kalau
   *  COD tidak ditawarkan. */
  codDiscount: number | null;
  /** codTotal - codDiscount. Null kalau COD tidak ditawarkan. */
  codTotalDiscounted: number | null;
  // >>> ANGGA — addendum v2 P1: diskon BARANG per-pcs (opsional supaya kutipan
  // lama di cache/fixture tetap sah). Sumber token {{diskon_barang}}/{{total_*_nego}}.
  goodsDiscount?: number;
  transferTotalNego?: number;
  codTotalNego?: number | null;
  // <<< ANGGA
}

/**
 * >>> ANGGA — satu pilihan tujuan yang SUDAH punya destination_id di tangan.
 *
 * Disimpan saat bot mengajukan pertanyaan tertutup ("Bogor-nya Kota atau
 * Kabupaten?") supaya jawaban pelanggan bisa langsung dipetakan tanpa mencari
 * ulang. Tanpa ini, jawaban "Kota Bogor" justru GAGAL: pencarian Mengantar
 * mencocokkan CITY_NAME persis, dan CITY_NAME-nya "BOGOR" — bukan "KOTA BOGOR".
 */
export interface DestinationChoice {
  city: string;
  province: string;
  /** Teks yang dibacakan ke pelanggan, mis. "Kab. Bogor" / "Kab. Tegal, JAWA TENGAH". */
  label: string;
  destinationId: string;
}

// >>> ANGGA — Order Context Log: pilihan BARANG yang sedang ditawarkan
// ("Bedog Betekok maksudnya kak?"), padanan `DestinationChoice` untuk tangga
// ambiguitas barang. `qty`/`city` dari konteks saat pertanyaan diajukan supaya
// jawaban pelanggan tinggal dipetakan tanpa ekstraksi ulang.
export interface ItemChoicePending {
  candidates: Array<{ productId: string; name: string }>;
  qty: number;
  city: string | null;
  /** >>> ANGGA — Q-Chain (2026-08-05): 'keranjang' = pertanyaan KONKLUSI
   *  ("dua-duanya atau salah satu?") — jawaban agregat memilih SEMUA. <<< */
  mode?: 'barang' | 'keranjang';
}
// <<< ANGGA

/** >>> ANGGA — Q-Chain (2026-08-05, MANDAT KERAS Bossfren): pertanyaan funnel
 *  yang WAJIB ada di balasan giliran ini — dicatat saat directive disuntik,
 *  ditagih `resolvePriceTokens` (gerbang). <<< */
export interface FunnelExpect {
  messageId: string;
  step: string;
  kalimat: string;
}

interface Entry {
  quote: ShippingQuote;
  expiresAt: number;
}

@Injectable()
export class ShippingQuoteCache {
  private readonly store = new Map<string, Entry>();
  private readonly outcomes = new Map<string, { outcome: ShippingOutcome; at: number }>();
  /**
   * >>> ANGGA: berapa kali bot SUDAH bertanya soal tujuan di percakapan ini.
   * Dipakai menaikkan tangga pertanyaan supaya bot tidak pernah mengulang
   * kalimat yang sama dua kali.
   *
   * `messageId` disimpan bersamanya karena satu giliran balasan memanggil
   * grounding LEBIH DARI SEKALI (prompt-builder saat menulis draft, lalu
   * Sentinel saat mereview). Tanpa penjaga ini, satu pesan pelanggan bisa
   * menaikkan tangga 2-3 sekaligus dan bot melompat langsung ke admin.
   */
  private readonly asks = new Map<string, { count: number; messageId: string }>();
  /** Pilihan tujuan yang sedang ditawarkan ke pelanggan, per percakapan. */
  private readonly pendings = new Map<string, DestinationChoice[]>();
  // >>> ANGGA — koreksi 2026-08-06 (insiden "Purwokertonya mana ya kak?"
  // ditanya ULANG walau sudah pernah dijawab & menghasilkan ongkir sebelum
  // pelanggan sempat pindah topik lalu balik lagi): begitu istilah kota/
  // kecamatan AMBIGU berhasil didisambiguasi jadi satu DestinationChoice
  // pasti, ingat pemetaan "istilah yang disebut pelanggan (dinormalisasi)" ->
  // hasilnya, SEPANJANG sesi belanja (TTL sama seperti kutipan ongkir aktif
  // `store`/`quoteCacheTtlMs` — ini fakta yang wajar diingat selama sesi
  // belanja, bukan cuma "sebentar sesudah dihitung" seperti `outcomes`).
  // Begitu istilah yang sama disebut lagi, pakai LANGSUNG hasil lama —
  // jangan tanya ulang. Kunci luar = conversationId, kunci dalam = istilah
  // dinormalisasi (lower-case, trim) — satu percakapan bisa mengingat
  // beberapa istilah tujuan berbeda sekaligus (mis. "purwokerto" DAN
  // "mataram" kalau pelanggan bolak-balik di antara keduanya).
  private readonly resolvedTerms = new Map<string, Map<string, { choice: DestinationChoice; expiresAt: number }>>();
  // <<< ANGGA
  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, insiden "{{139000}}" ronde
  // 2): penanda harga produk (`{{harga_produk_N}}`) untuk giliran balasan yang
  // BELUM punya kutipan ongkir aktif (pelanggan tanya harga sebelum menyebut
  // tujuan). Pola & TTL sama persis `outcomes` di atas — dibangun prompt-builder
  // saat menulis draft, dibaca sebentar kemudian oleh `resolvePriceTokens` di
  // proses yang sama, bukan sesuatu yang perlu diingat lama.
  private readonly productPriceTokens = new Map<string, { tokens: Record<string, string>; at: number }>();
  // >>> ANGGA — Order Context Log (blueprint 2026-08-04):
  // `itemPendings` = pilihan BARANG yang sedang ditawarkan ke pelanggan
  // (tangga ambiguitas barang, meniru `pendings` kota di atas — menambal bug
  // laten `sort[0]` yang memilih diam-diam saat skor produk seri).
  // `assumeds` = penanda bahwa kutipan giliran ini dihitung dari ASUMSI order
  // terakhir / gabungan log (bukan sebutan eksplisit pelanggan di pesan itu) —
  // dibaca `resolvePriceTokens` untuk enforcement bridge-validasi. TTL pendek
  // (OUTCOME_MEMO_MS): draft dibuat lalu diresolve dalam hitungan detik.
  private readonly itemPendings = new Map<string, ItemChoicePending>();
  private readonly assumeds = new Map<string, { productNames: string[]; aggregate: boolean; at: number }>();
  // <<< ANGGA
  private hits = 0;
  private misses = 0;

  /**
   * Ambil kutipan aktif untuk percakapan ini.
   * @param city kalau diisi dan BERBEDA dari kota tersimpan → dianggap tujuan
   * berubah: entri lama dibuang dan hasilnya null (Rule 8 "direset, bukan
   * ditambah").
   */
  get(conversationId: string, city?: string | null): ShippingQuote | null {
    const entry = this.store.get(conversationId);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(conversationId);
      this.misses++;
      return null;
    }
    if (city && !sameCity(entry.quote.city, city)) {
      this.store.delete(conversationId);
      this.misses++;
      return null;
    }
    // Segarkan recency (LRU-ish), sama seperti ai-cache.service.ts.
    this.store.delete(conversationId);
    this.store.set(conversationId, entry);
    this.hits++;
    return entry.quote;
  }

  set(conversationId: string, quote: ShippingQuote, ttlMs: number): void {
    this.store.delete(conversationId);
    this.store.set(conversationId, { quote, expiresAt: Date.now() + ttlMs });
    while (this.store.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  reset(conversationId: string): void {
    this.store.delete(conversationId);
  }

  /** Catat hasil upaya terakhir — dipakai rule eskalasi Sentinel (Langkah 11).
   *  Hasil GAGAL sengaja TIDAK disimpan sebagai kutipan (biar percobaan
   *  berikutnya memanggil API lagi), tapi statusnya tetap diingat sebentar. */
  recordOutcome(conversationId: string, outcome: ShippingOutcome): void {
    this.outcomes.set(conversationId, { outcome, at: Date.now() });
    while (this.outcomes.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.outcomes.keys().next().value;
      if (oldest === undefined) break;
      this.outcomes.delete(oldest);
    }
  }

  // >>> ANGGA — addendum v2 P2: tangga NEGO, pola sama `asks` (sekali per
  // pesan pelanggan). Ronde 1 → tawarkan token nego; ronde ≥2 → eskalasi admin.
  private readonly negoAsks = new Map<string, { count: number; messageId: string }>();

  bumpNego(conversationId: string, messageId: string): number {
    const prev = this.negoAsks.get(conversationId);
    if (prev && prev.messageId === messageId) return prev.count;
    const next = { count: (prev?.count ?? 0) + 1, messageId };
    this.negoAsks.set(conversationId, next);
    while (this.negoAsks.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.negoAsks.keys().next().value;
      if (oldest === undefined) break;
      this.negoAsks.delete(oldest);
    }
    return next.count;
  }

  negoCount(conversationId: string): number {
    return this.negoAsks.get(conversationId)?.count ?? 0;
  }

  resetNego(conversationId: string): void {
    this.negoAsks.delete(conversationId);
  }
  // <<< ANGGA

  /** Naikkan penghitung SEKALI per pesan pelanggan. Mengembalikan ronde saat ini. */
  bumpAsk(conversationId: string, messageId: string): number {
    const prev = this.asks.get(conversationId);
    if (prev && prev.messageId === messageId) return prev.count;
    const next = { count: (prev?.count ?? 0) + 1, messageId };
    this.asks.set(conversationId, next);
    while (this.asks.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.asks.keys().next().value;
      if (oldest === undefined) break;
      this.asks.delete(oldest);
    }
    return next.count;
  }

  askCount(conversationId: string): number {
    return this.asks.get(conversationId)?.count ?? 0;
  }

  /** Tujuan akhirnya jelas → tangga kembali ke nol. */
  resetAsks(conversationId: string): void {
    this.asks.delete(conversationId);
  }

  /** Simpan pilihan yang sedang ditawarkan. SELURUH kandidat disimpan, bukan
   *  cuma dua yang dibacakan — pelanggan sering menyebut yang ketiga. */
  setPending(conversationId: string, choices: DestinationChoice[]): void {
    this.pendings.delete(conversationId);
    this.pendings.set(conversationId, choices);
    while (this.pendings.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.pendings.keys().next().value;
      if (oldest === undefined) break;
      this.pendings.delete(oldest);
    }
  }

  pending(conversationId: string): DestinationChoice[] {
    return this.pendings.get(conversationId) ?? [];
  }

  clearPending(conversationId: string): void {
    this.pendings.delete(conversationId);
  }

  // >>> ANGGA — koreksi 2026-08-06: lihat komentar di field `resolvedTerms`.
  rememberDestinationTerm(
    conversationId: string,
    term: string,
    choice: DestinationChoice,
    ttlMs: number,
  ): void {
    const key = term.trim().toLowerCase();
    if (!key) return;
    let byTerm = this.resolvedTerms.get(conversationId);
    if (!byTerm) {
      byTerm = new Map();
      this.resolvedTerms.set(conversationId, byTerm);
      while (this.resolvedTerms.size > MAX_QUOTE_ENTRIES) {
        const oldest = this.resolvedTerms.keys().next().value;
        if (oldest === undefined) break;
        this.resolvedTerms.delete(oldest);
      }
    }
    byTerm.set(key, { choice, expiresAt: Date.now() + ttlMs });
  }

  recallDestinationTerm(conversationId: string, term: string): DestinationChoice | null {
    const key = term.trim().toLowerCase();
    if (!key) return null;
    const byTerm = this.resolvedTerms.get(conversationId);
    if (!byTerm) return null;
    const memo = byTerm.get(key);
    if (!memo) return null;
    if (Date.now() > memo.expiresAt) {
      byTerm.delete(key);
      return null;
    }
    return memo.choice;
  }
  // <<< ANGGA

  lastOutcome(conversationId: string): ShippingOutcome | null {
    const memo = this.outcomes.get(conversationId);
    if (!memo) return null;
    if (Date.now() - memo.at > OUTCOME_MEMO_MS) {
      this.outcomes.delete(conversationId);
      return null;
    }
    return memo.outcome;
  }

  /** Simpan penanda harga produk (mis. `{{harga_produk_1}}`) untuk giliran ini —
   *  dipanggil prompt-builder saat blok stok produk disuntik TANPA kutipan
   *  ongkir aktif (lihat komentar di atas field `productPriceTokens`). */
  setProductPriceTokens(conversationId: string, tokens: Record<string, string>): void {
    this.productPriceTokens.set(conversationId, { tokens, at: Date.now() });
    while (this.productPriceTokens.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.productPriceTokens.keys().next().value;
      if (oldest === undefined) break;
      this.productPriceTokens.delete(oldest);
    }
  }

  /** Penanda harga produk yang tersimpan untuk giliran ini, kalau masih segar
   *  (TTL sama seperti `lastOutcome` — cukup untuk round-trip draft -> resolve
   *  di proses yang sama). {} kalau tidak ada / sudah kedaluwarsa. */
  getProductPriceTokens(conversationId: string): Record<string, string> {
    const memo = this.productPriceTokens.get(conversationId);
    if (!memo) return {};
    if (Date.now() - memo.at > OUTCOME_MEMO_MS) {
      this.productPriceTokens.delete(conversationId);
      return {};
    }
    return memo.tokens;
  }

  // >>> ANGGA — Order Context Log: tangga ambiguitas barang + penanda asumsi.
  setPendingItems(conversationId: string, pending: ItemChoicePending): void {
    this.itemPendings.delete(conversationId);
    this.itemPendings.set(conversationId, pending);
    while (this.itemPendings.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.itemPendings.keys().next().value;
      if (oldest === undefined) break;
      this.itemPendings.delete(oldest);
    }
  }

  pendingItems(conversationId: string): ItemChoicePending | null {
    return this.itemPendings.get(conversationId) ?? null;
  }

  clearPendingItems(conversationId: string): void {
    this.itemPendings.delete(conversationId);
  }

  // >>> ANGGA — Q-Chain (2026-08-05): memo pertanyaan funnel WAJIB per giliran.
  private readonly funnelExpects = new Map<string, FunnelExpect>();

  setFunnelExpect(conversationId: string, expect: FunnelExpect): void {
    this.funnelExpects.delete(conversationId);
    this.funnelExpects.set(conversationId, expect);
    while (this.funnelExpects.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.funnelExpects.keys().next().value;
      if (oldest === undefined) break;
      this.funnelExpects.delete(oldest);
    }
  }

  funnelExpect(conversationId: string): FunnelExpect | null {
    return this.funnelExpects.get(conversationId) ?? null;
  }

  clearFunnelExpect(conversationId: string): void {
    this.funnelExpects.delete(conversationId);
  }
  // <<< ANGGA

  /** Tandai kutipan giliran ini hasil ASUMSI (default-ke-terbaru / agregat). */
  setAssumed(conversationId: string, productNames: string[], aggregate: boolean): void {
    this.assumeds.set(conversationId, { productNames, aggregate, at: Date.now() });
    while (this.assumeds.size > MAX_QUOTE_ENTRIES) {
      const oldest = this.assumeds.keys().next().value;
      if (oldest === undefined) break;
      this.assumeds.delete(oldest);
    }
  }

  assumed(conversationId: string): { productNames: string[]; aggregate: boolean } | null {
    const memo = this.assumeds.get(conversationId);
    if (!memo) return null;
    if (Date.now() - memo.at > OUTCOME_MEMO_MS) {
      this.assumeds.delete(conversationId);
      return null;
    }
    return { productNames: memo.productNames, aggregate: memo.aggregate };
  }

  clearAssumed(conversationId: string): void {
    this.assumeds.delete(conversationId);
  }
  // <<< ANGGA

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  clear(): void {
    this.store.clear();
    this.outcomes.clear();
    this.asks.clear();
    this.pendings.clear();
    this.resolvedTerms.clear(); // >>> ANGGA <<<
    this.productPriceTokens.clear();
    this.itemPendings.clear(); // >>> ANGGA — Order Context Log <<<
    this.assumeds.clear(); // >>> ANGGA — Order Context Log <<<
    this.negoAsks.clear(); // >>> ANGGA — addendum v2 P2 <<<
    this.funnelExpects.clear(); // >>> ANGGA — Q-Chain <<<
    this.hits = 0;
    this.misses = 0;
  }
}

/** Bandingkan nama kota tanpa peduli besar-kecil huruf & spasi berlebih. */
export function sameCity(a: string, b: string): boolean {
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}
