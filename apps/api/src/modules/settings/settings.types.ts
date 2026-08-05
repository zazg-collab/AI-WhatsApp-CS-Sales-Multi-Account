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

  // >>> ANGGA — Addendum v2 M5 (2026-08-05, ketok Bossfren): seluruh field
  // memori order (order*) PINDAH ke kategori sendiri `OrderContextSettings`
  // di bawah — memori order urusan PERCAKAPAN, bukan urusan kurir. Nilai lama
  // yang terlanjur tersimpan di baris `shipping` tetap dibaca lewat overlay
  // legacy di SettingsService.getAll(). <<< ANGGA
}
// <<< ANGGA

// >>> ANGGA — Order Context Log (blueprint 2026-08-04 + addendum v2 M5,
// 2026-08-05): kategori TERSENDIRI untuk memori order percakapan — dipisah
// dari `shipping` (ketok Bossfren: memori order bukan urusan kurir). Semua
// daftar kata & angka kebijakan di AppSetting supaya bisa diubah dari
// /settings/order-memory tanpa deploy; kode tidak boleh punya salinannya.
export interface OrderContextSettings {
  /** Jendela basi entri log order, dalam JAM (ketok Bossfren: 24). Entri lebih
   *  tua HARAM dipakai menjawab angka — HALAL untuk menyusun pertanyaan. */
  orderContextStaleHours: number;
  /** Kata pembatalan ORDER UTUH — whole-message; "batal yang golok aja" =
   *  pembatalan parsial (snapshot baru), bukan reset (v1.1 §12.1-5). */
  orderCancelKeywords: string[];
  /** Kata makna AGREGAT ("total semuanya") → gabungan entri segar per identitas
   *  produk, dibacakan (bridge); hanya di konteks resolusi uang (v1.1 §12.2-7). */
  orderAggregateKeywords: string[];
  /** Kata afirmasi pilihan barang — whole-message + hanya saat ada pending. */
  orderAffirmationKeywords: string[];
  /** Kata negasi yang membatalkan afirmasi. */
  orderNegationKeywords: string[];
  /** Kata pengisi netral yang diabaikan pencocok whole-message. */
  orderFillerWords: string[];
  /** Teks catatan S&K — nilai penanda GLOBAL `{{catatan_sk}}`; terkirimnya
   *  pesan berisi substitusinya = penanda selesai-order. Kosong = mati. */
  orderClosingNote: string;
  /** Enforcement bridge-validasi jalur asumsi: 'prompt_only' | 'retry_once'. */
  orderBridgeEnforcement: 'prompt_only' | 'retry_once';
  // ── Addendum v2 (2026-08-05) ──
  /** M1 — frasa TUNJUK ("yg ini","yg itu") yang me-resolve ke penawaran
   *  terakhir (offer registry), dengan aturan interseksi kata generik. */
  orderDeixisKeywords: string[];
  /** M1 — umur maksimum penawaran (menit) untuk resolusi deixis/fallback. */
  orderOfferWindowMinutes: number;
  /** M2 — KAMUS token global: nama_token → teks verbatim yang ditempel sistem
   *  (mis. rekening_transfer). Ditambah dari dashboard tanpa deploy; nama
   *  bentrok token uang/catatan_sk diabaikan resolver. */
  orderGlobalTokens: Record<string, string>;
  /** M3 — frasa penanda pesan FORM funnel ("form pemesanan") → seed offer
   *  deterministik tanpa LLM. */
  orderFormHintKeywords: string[];
  /** M4 — frasa REFERENSI eksplisit ("yang tadi","pesanan tadi") yang membuka
   *  jangkauan 1 order completed terakhir (hitung ulang input + wajib bridge). */
  orderReferenceKeywords: string[];
  /** P2 — frasa NEGO ("diskon lagi","free ongkir") pemicu tangga nego:
   *  tawaran token nego dulu, melewati plafon → eskalasi admin. */
  orderNegoKeywords: string[];
  /** F1/F2 (2026-08-05, insiden "halo" dijawab rekap order) — kata TANYA-UANG
   *  ("total","ongkir","berapa",…) pembuka jalur asumsi (log-hit/carry-over)
   *  dan directive rekap. Dicocokkan SUBSTRING (imbuhan: "totalnya" kena oleh
   *  "total"). Sapaan tanpa kata ini tidak pernah dijawab kutipan order. */
  orderMoneyAskKeywords: string[];
  /** E1 (2026-08-05) — TEMPLATE sambutan pesan form funnel, dirender SISTEM
   *  (bukan LLM) saat pesan form terdeteksi; sekali per percakapan. Placeholder:
   *  {{nama_form}} {{produk_form}} {{harga_form}}. Kosong = fitur mati. */
  orderFormWelcomeTemplate: string;
  /** E3 (2026-08-05) — frasa ISTILAH INTERNAL yang haram muncul di balasan
   *  ("penanda","instruksi sistem",…); kena → ditahan gerbang (retry-sekali). */
  orderMetaPhraseBlacklist: string[];
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
  orderContext: OrderContextSettings; // >>> ANGGA — addendum v2 M5 <<<
}

export type SettingsCategory = keyof AppSettings;
