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
  | 'need_province'
  | 'unresolved_items'
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
  /** Total harga barang (Σ qty × harga katalog). */
  goodsTotal: number;
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
}

interface Entry {
  quote: ShippingQuote;
  expiresAt: number;
}

@Injectable()
export class ShippingQuoteCache {
  private readonly store = new Map<string, Entry>();
  private readonly outcomes = new Map<string, { outcome: ShippingOutcome; at: number }>();
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

  lastOutcome(conversationId: string): ShippingOutcome | null {
    const memo = this.outcomes.get(conversationId);
    if (!memo) return null;
    if (Date.now() - memo.at > OUTCOME_MEMO_MS) {
      this.outcomes.delete(conversationId);
      return null;
    }
    return memo.outcome;
  }

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
    this.hits = 0;
    this.misses = 0;
  }
}

/** Bandingkan nama kota tanpa peduli besar-kecil huruf & spasi berlebih. */
export function sameCity(a: string, b: string): boolean {
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}
