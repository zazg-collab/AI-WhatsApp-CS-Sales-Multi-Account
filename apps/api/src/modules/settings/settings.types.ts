/** Runtime-editable settings, grouped by category. Each category is stored as
 *  one row in app_settings (key = category name, value = the object below). */
export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  /** Model used by the customer-facing CS chatbots. */
  model: string;
  /** Model used by the Sentinel supervisor (review/ask/insight). Empty string
   *  falls back to `model`. Set a stronger model here for better judgement. */
  sentinelModel: string;
  temperature: number;
  timeoutMs: number;
  /** Embedding model for semantic knowledge retrieval (OpenAI-compatible
   *  `/embeddings`). Empty string disables RAG → keyword retrieval is used. */
  embedModel: string;
  /** Embedding vector dimension. Must match the DB `vector(N)` column. */
  embedDim: number;
}

export interface WaSettings {
  /** Random per-message send delay bounds (anti-ban). */
  humanDelayMinMs: number;
  humanDelayMaxMs: number;
  /** Typing-indicator duration model: perChar, clamped to [min, max]. */
  typingPerCharMs: number;
  typingMinMs: number;
  typingMaxMs: number;
}

export interface NotificationSettings {
  /** Hermes Agent target, e.g. "telegram" or "slack:#alerts". Empty = off. */
  hermesNotifyTarget: string;
}

export interface SlaSettings {
  /** Minutes an inbound customer message may go unanswered before SLA breach. */
  responseMinutes: number;
  /** Days of no activity after which an open conversation is auto-closed. */
  idleCloseDays: number;
}

export interface SentinelSettings {
  /** Confidence >= this auto-sends (PRD default 90). */
  autoSendConfidenceMin: number;
  /** Confidence >= this (and below autoSendConfidenceMin) holds as draft;
   *  below this, the message is blocked pending admin (PRD default 50). */
  draftConfidenceMin: number;
  /** Comma-separated extra risk keywords (case-insensitive), on top of the
   *  built-in legal/refund/complaint rules in rules.engine.ts. A match forces
   *  takeover_required + high risk. */
  riskKeywords: string;
  /** AI mode new WhatsApp accounts start in. */
  defaultAiMode: 'ai_off' | 'ai_draft' | 'ai_supervised' | 'ai_on';
}

export interface CampaignSettings {
  /** Default rateLimitPerMinute for newly created campaigns (per-campaign
   *  value still overrides this). */
  defaultRateLimitPerMinute: number;
  /** When false, a submitted campaign skips the pending_approval step and
   *  the creator can start it directly (no second-reviewer approval). */
  requireApproval: boolean;
}

// >>> ANGGA: config modul Shipping Service Mengantar (LAMPIRAN §6).
// Disimpan sebagai SATU baris app_settings (key = "shipping") mengikuti pola
// kategori yang sudah dipakai Sentinel — bukan 9 baris key flat, karena
// SettingsService.getAll() hanya membaca baris yang key-nya cocok nama kategori.
// Nama key §6 dipertahankan di komentar tiap field supaya tetap bisa ditelusuri
// balik ke dokumen.
export interface ShippingSettings {
  /** §6 `mengantar_api_key`. RAHASIA — jangan pernah dicetak/di-log mentah. */
  mengantarApiKey: string;
  /** §6 `mengantar_origin_id` — titik asal kirim milik Cordova. */
  mengantarOriginId: string;
  /** Base URL API Mengantar. Di luar tabel §6 (parameter teknis, bukan angka
   *  bisnis) supaya endpoint bisa diarahkan ke sandbox/mock tanpa ubah kode. */
  baseUrl: string;
  /** §6 `shipping_courier_exclude` — Rule 1. */
  courierExclude: string[];
  /** §6 `shipping_cod_allowlist` — Rule 2 baris terakhir (flag kosong/null). */
  codAllowlist: string[];
  /** §6 `shipping_cod_blocked_region_keywords` — Rule 3. Dicocokkan sebagai
   *  substring case-insensitive ke PROVINCE_NAME, bukan exact match. */
  codBlockedRegionKeywords: string[];
  /** §6 `shipping_default_weight_grams` — FALLBACK saja (Rule 4), dipakai hanya
   *  kalau `Product.weightGrams` kosong untuk produk itu. */
  defaultWeightGrams: number;
  /** §6 `shipping_quote_cache_ttl_ms` — Rule 8, default 6 jam. */
  quoteCacheTtlMs: number;
  /** §6 `shipping_discount_max_per_pcs` — Rule 7 (diskon BARANG, belum
   *  diimplementasikan). >>> ANGGA — Fase 113 (2026-08-04): di-rename dari
   *  `discountMaxPerOrder`. Nama lamanya BERBOHONG: field ini didokumentasikan
   *  "per order", padahal kebijakan Bossfren untuk diskon barang selalu per
   *  PCS (Rp5.000/pcs, tanpa plafon per order). v1: DOKUMENTASI SAJA,
   *  penegakannya masih kepatuhan LLM, bukan gate numerik — beda dengan
   *  `shippingDiscountPercentMax` di bawah yang SUDAH ditegakkan sistem. */
  discountMaxPerPcs: number;
  /** §6 `shipping_price_rounding_increment` — Rule 11. */
  priceRoundingIncrement: number;
  /** >>> ANGGA — Fase 113: persen maksimum diskon ONGKIR (dihitung dari
   *  ongkir, BUKAN dari total transfer/COD), dibulatkan ke BAWAH saat dipakai
   *  (`floorTo` di shipping.service.ts) supaya tidak pernah melewati batas
   *  ini. Default 20. Beda dari `discountMaxPerPcs` di atas: ini SUDAH
   *  ditegakkan sistem (`ShippingService.buildPriceTokens`), bukan cuma
   *  dokumentasi untuk LLM. */
  shippingDiscountPercentMax: number;
  /**
   * >>> ANGGA — kamus nama panggilan daerah → kata kunci yang DIKENAL Mengantar.
   *
   * Di luar tabel §6: ini kosakata, bukan aturan bisnis, dan isinya memang
   * harus bisa berubah tanpa menyentuh kode — itu sebabnya ia di sini dan
   * bukan konstanta di modul shipping.
   *
   * Alasannya nyata: data Mengantar memakai nama RESMI, sementara pelanggan
   * WhatsApp memakai nama panggilan. Diuji live 2026-08-03 — "solo", "jogja",
   * "tangsel", "sby", "malang" semuanya nol kandidat, sedangkan "surakarta",
   * "yogyakarta", "tangerang selatan", "surabaya", "klojen" bersih satu kota.
   *
   * Kunci dicocokkan pada SELURUH kata kunci (bukan sebagian), huruf besar-kecil
   * diabaikan. Nilainya bebas: boleh nama kota resmi, boleh nama kecamatan —
   * yang penting Mengantar mengenalinya.
   */
  destinationAliases: Record<string, string>;

  // >>> ANGGA — Order Context Log (blueprint 2026-08-04). Semua daftar kata &
  // angka kebijakan modul memori order di AppSetting (ketok Bossfren) supaya
  // bisa diubah dari /settings/shipping tanpa deploy; kode tidak boleh punya
  // salinannya sendiri.
  /** Jendela basi entri log order, dalam JAM (ketok Bossfren: 24). Entri lebih
   *  tua dari ini HARAM dipakai menjawab angka — tapi HALAL dipakai menyusun
   *  pertanyaan konfirmasi ("yang kemarin Golok itu ya kak?"). */
  orderContextStaleHours: number;
  /** Kata pembatalan ORDER UTUH. Dicocokkan whole-message (seluruh pesan hanya
   *  berisi kata pembatalan + filler) — "batal yang golok aja" TIDAK termasuk:
   *  itu pembatalan parsial = snapshot baru berisi item sisa, bukan reset
   *  konteks (amendemen v1.1 §12.1-5). */
  orderCancelKeywords: string[];
  /** Kata pemicu makna AGREGAT ("total semuanya") → order GABUNGAN dari semua
   *  entri segar, daftarnya dibacakan (gabung-dengan-bridge), bukan tanya-dulu.
   *  Hanya dievaluasi di dalam konteks resolusi pertanyaan uang (v1.1 §12.2-7). */
  orderAggregateKeywords: string[];
  /** Kata afirmasi jawaban atas pertanyaan pilihan barang ("iya yg itu").
   *  HANYA berlaku whole-message + saat ada pending pilihan barang dari giliran
   *  bot sebelumnya (v1.1 §12.2-6). */
  orderAffirmationKeywords: string[];
  /** Kata negasi yang MEMBATALKAN afirmasi ("gak", "bukan"). */
  orderNegationKeywords: string[];
  /** Kata pengisi netral yang diabaikan pencocok whole-message ("kak","deh"). */
  orderFillerWords: string[];
  /** Teks catatan S&K COD + pemesanan untuk penutupan order — nilai penanda
   *  GLOBAL `{{catatan_sk}}`, dikenal resolver TANPA kutipan aktif (v1.1
   *  §12.1-3). Terkirimnya pesan berisi substitusi penanda ini = penanda
   *  kejadian "selesai order" di log. Kosong = penanda tidak tersedia dan
   *  deteksi selesai otomatis tidak pernah terpicu (fallback: resolve). */
  orderClosingNote: string;
  /** Level enforcement bridge-validasi saat jawaban memakai jalur asumsi
   *  (default-ke-terbaru / agregat): 'prompt_only' = instruksi saja;
   *  'retry_once' (default) = draft yang menyebut total tanpa menyebut nama
   *  barang di-retry otomatis sekali, tetap gagal → ditahan jadi draft. */
  orderBridgeEnforcement: 'prompt_only' | 'retry_once';
  // <<< ANGGA
}
// <<< ANGGA

export interface AppSettings {
  ai: AiSettings;
  wa: WaSettings;
  notifications: NotificationSettings;
  sla: SlaSettings;
  sentinel: SentinelSettings;
  campaign: CampaignSettings;
  shipping: ShippingSettings; // >>> ANGGA <<<
}

export type SettingsCategory = keyof AppSettings;
