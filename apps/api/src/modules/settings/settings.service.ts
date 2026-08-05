import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AppSettings,
  AiSettings,
  WaSettings,
  NotificationSettings,
  SlaSettings,
  SentinelSettings,
  CampaignSettings,
  ShippingSettings, // >>> ANGGA <<<
  OrderContextSettings, // >>> ANGGA — addendum v2 M5 <<<
} from './settings.types';

/**
 * Layers runtime-editable settings (app_settings table) over env-derived
 * defaults. Consumers (AiProvider, WaService, Notifications, SLA) read through
 * this so an admin can change behaviour from the dashboard without a redeploy.
 *
 * Values are cached in memory and refreshed on write, so the hot path stays a
 * cheap object read.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: AppSettings | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private num(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  // >>> ANGGA: parser daftar dari env (CSV) untuk config modul shipping.
  // Nilai kosong/tidak diset → pakai fallback (daftar default §6 LAMPIRAN).
  private list(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    const raw = typeof value === 'string' ? value : '';
    const parsed = raw.split(',').map((v) => v.trim()).filter(Boolean);
    return parsed.length ? parsed : fallback;
  }

  /**
   * Parser kamus alias dari env: `"solo=surakarta,jogja=yogyakarta"`.
   * Kunci dinormalkan (huruf kecil, spasi rapat) supaya pencocokan nanti murni
   * perbandingan string — tidak ada normalisasi tersembunyi di sisi pemakai.
   */
  private pairs(value: unknown, fallback: Record<string, string>): Record<string, string> {
    const dari = (obj: Record<string, unknown>): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        const kunci = String(k).trim().toLowerCase().replace(/\s+/g, ' ');
        const nilai = String(v ?? '').trim();
        if (kunci && nilai) out[kunci] = nilai;
      }
      return out;
    };
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return dari(value as Record<string, unknown>);
    }
    const raw = typeof value === 'string' ? value : '';
    const parsed: Record<string, unknown> = {};
    for (const bagian of raw.split(',')) {
      const i = bagian.indexOf('=');
      if (i <= 0) continue;
      parsed[bagian.slice(0, i)] = bagian.slice(i + 1);
    }
    const hasil = dari(parsed);
    return Object.keys(hasil).length ? hasil : fallback;
  }
  // <<< ANGGA

  /** Env-derived defaults — the baseline before any DB override. */
  private defaults(): AppSettings {
    return {
      ai: {
        baseUrl: (this.config.get<string>('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
        apiKey: this.config.get<string>('AI_API_KEY') ?? '',
        model: this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini',
        sentinelModel: this.config.get<string>('SENTINEL_MODEL') ?? this.config.get<string>('HERMES_MODEL') ?? '',
        temperature: this.num(this.config.get('AI_TEMPERATURE'), 0.6),
        timeoutMs: this.num(this.config.get('AI_TIMEOUT_MS'), 30_000),
        embedModel: this.config.get<string>('AI_EMBED_MODEL') ?? '',
        embedDim: this.num(this.config.get('AI_EMBED_DIM'), 1536),
      },
      wa: {
        humanDelayMinMs: this.num(this.config.get('WA_HUMAN_DELAY_MIN_MS'), 600),
        humanDelayMaxMs: this.num(this.config.get('WA_HUMAN_DELAY_MAX_MS'), 1800),
        typingPerCharMs: this.num(this.config.get('WA_TYPING_PER_CHAR_MS'), 50),
        typingMinMs: this.num(this.config.get('WA_TYPING_MIN_MS'), 800),
        typingMaxMs: this.num(this.config.get('WA_TYPING_MAX_MS'), 6000),
      },
      notifications: {
        hermesNotifyTarget: this.config.get<string>('HERMES_NOTIFY_TARGET') ?? '',
      },
      sla: {
        responseMinutes: this.num(this.config.get('SLA_RESPONSE_MINUTES'), 15),
        idleCloseDays: this.num(this.config.get('IDLE_CLOSE_DAYS'), 3),
      },
      sentinel: {
        autoSendConfidenceMin: this.num(this.config.get('SENTINEL_AUTO_SEND_MIN'), 90),
        draftConfidenceMin: this.num(this.config.get('SENTINEL_DRAFT_MIN'), 50),
        riskKeywords: this.config.get<string>('SENTINEL_RISK_KEYWORDS') ?? '',
        defaultAiMode: (this.config.get<string>('SENTINEL_DEFAULT_AI_MODE') as SentinelSettings['defaultAiMode']) ?? 'ai_draft',
      },
      campaign: {
        defaultRateLimitPerMinute: this.num(this.config.get('CAMPAIGN_DEFAULT_RATE_LIMIT'), 6),
        requireApproval: (this.config.get<string>('CAMPAIGN_REQUIRE_APPROVAL') ?? 'true') !== 'false',
      },
      // >>> ANGGA: default modul shipping. Angka & daftar di sini SAMA PERSIS
      // dengan tabel §6 LAMPIRAN; kode modul shipping tidak boleh punya salinan
      // angka-angka ini sendiri.
      shipping: {
        mengantarApiKey: this.config.get<string>('MENGANTAR_API_KEY') ?? '',
        mengantarOriginId: this.config.get<string>('MENGANTAR_ORIGIN_ID') ?? '',
        baseUrl: (this.config.get<string>('MENGANTAR_BASE_URL') ?? 'https://app.mengantar.com').replace(/\/$/, ''),
        courierExclude: this.list(this.config.get('SHIPPING_COURIER_EXCLUDE'), [
          'paxel', 'JNECargo', 'SiCepatCargo', 'SapCargo', 'iDexpressCargo', 'SAPLite', 'iDlite',
        ]),
        codAllowlist: this.list(this.config.get('SHIPPING_COD_ALLOWLIST'), ['JNE']),
        codBlockedRegionKeywords: this.list(
          this.config.get('SHIPPING_COD_BLOCKED_REGION_KEYWORDS'), ['papua', 'maluku'],
        ),
        defaultWeightGrams: this.num(this.config.get('SHIPPING_DEFAULT_WEIGHT_GRAMS'), 1000),
        quoteCacheTtlMs: this.num(this.config.get('SHIPPING_QUOTE_CACHE_TTL_MS'), 21_600_000),
        // >>> ANGGA — Fase 113 (2026-08-04): env var IKUT di-rename bersama field
        // (ketok palu Bossfren) — SHIPPING_DISCOUNT_MAX_PER_ORDER lama di .env
        // TIDAK lagi dibaca, harus diupdate ke SHIPPING_DISCOUNT_MAX_PER_PCS
        // sebelum/saat deploy, kalau tidak field ini diam-diam balik ke default.
        discountMaxPerPcs: this.num(this.config.get('SHIPPING_DISCOUNT_MAX_PER_PCS'), 5000),
        priceRoundingIncrement: this.num(this.config.get('SHIPPING_PRICE_ROUNDING_INCREMENT'), 500),
        shippingDiscountPercentMax: this.num(this.config.get('SHIPPING_DISCOUNT_PERCENT_MAX'), 20), // >>> ANGGA — Fase 113 <<<
        // >>> ANGGA — daftar awal, SELURUHNYA diverifikasi live ke API Mengantar
        // 2026-08-03: setiap kunci di kiri terbukti nol kandidat (atau salah
        // kota), dan setiap nilai di kanan terbukti menghasilkan tepat satu kota
        // yang benar. Bossfren bisa menambah/menghapus dari /settings/shipping
        // tanpa menyentuh kode.
        destinationAliases: this.pairs(this.config.get('SHIPPING_DESTINATION_ALIASES'), {
          // Nama resmi ≠ nama sehari-hari.
          solo: 'surakarta',
          jogja: 'yogyakarta',
          jogjakarta: 'yogyakarta',
          yogya: 'yogyakarta',
          'ujung pandang': 'makassar',
          // Salah eja yang BERBAHAYA: "makasar" (satu s) adalah kecamatan di
          // Jakarta Timur — tanpa baris ini, pelanggan Makassar dikutip ongkir
          // Jakarta Timur dengan penuh percaya diri.
          makasar: 'makassar',
          // Singkatan yang lazim di WhatsApp; semuanya nol baris di Mengantar.
          sby: 'surabaya',
          smg: 'semarang',
          bdg: 'bandung',
          tangsel: 'tangerang selatan',
          bsd: 'tangerang selatan',
          jaksel: 'jakarta selatan',
          jakbar: 'jakarta barat',
          jaktim: 'jakarta timur',
          jakut: 'jakarta utara',
          jakpus: 'jakarta pusat',
          // Kota yang tenggelam karena hasil pencarian dipotong 50 baris:
          // "malang" & "padang" tidak pernah memunculkan kotanya sendiri, jadi
          // dialihkan ke kecamatan pusatnya yang bersih satu kota.
          malang: 'klojen',
          padang: 'padang barat',
          // >>> ANGGA — 2026-08-05 (temuan live Bossfren): "mataram" malah
          // resolve DOMINAN ke LAMPUNG TIMUR (banyak kelurahan "Mataram
          // Baru" dkk di sana) — Kota Mataram NTB tenggelam. Kelas bug yang
          // sama; dialihkan ke kecamatan pusat Kota Mataram yang namanya unik.
          mataram: 'cakranegara',
          // <<< ANGGA
        }),
      },
      // <<< ANGGA
      // >>> ANGGA — Order Context Log (blueprint 2026-08-04 + addendum v2 M5
      // 2026-08-05): kategori TERSENDIRI (ketok Bossfren — memori order bukan
      // urusan kurir). Default = ketok/usulan yang disetujui; semuanya bisa
      // diubah dari /settings/order-memory tanpa deploy.
      orderContext: {
        orderContextStaleHours: this.num(this.config.get('ORDER_CONTEXT_STALE_HOURS'), 24),
        orderCancelKeywords: this.list(this.config.get('ORDER_CANCEL_KEYWORDS'), [
          'batal', 'gak jadi', 'ga jadi', 'nggak jadi', 'tidak jadi', 'cancel',
        ]),
        orderAggregateKeywords: this.list(this.config.get('ORDER_AGGREGATE_KEYWORDS'), [
          'semuanya', 'semua', 'seluruhnya', 'sekaligus', 'digabung', 'gabung',
          'totalin semua', 'dua-duanya', 'tiga-tiganya', 'borong',
          'sama yang tadi', 'sama yg tadi',
        ]),
        orderAffirmationKeywords: this.list(this.config.get('ORDER_AFFIRMATION_KEYWORDS'), [
          'iya', 'iyaa', 'ya', 'yup', 'betul', 'bener', 'benar', 'itu',
          'oke', 'ok', 'sip', 'gas', 'boleh', 'mau', 'jadi', 'lanjut',
        ]),
        orderNegationKeywords: this.list(this.config.get('ORDER_NEGATION_KEYWORDS'), [
          'gak', 'ga', 'nggak', 'ngga', 'bukan', 'jangan', 'tidak', 'no',
        ]),
        orderFillerWords: this.list(this.config.get('ORDER_FILLER_WORDS'), [
          'kak', 'ka', 'dong', 'deh', 'aja', 'sih', 'min', 'gan', 'bang',
          'mas', 'mbak', 'pak', 'bu', 'nya', 'yg', 'yang', 'yaudah', 'udah',
        ]),
        orderClosingNote: (this.config.get<string>('ORDER_CLOSING_NOTE') ?? '').trim(),
        orderBridgeEnforcement:
          this.config.get<string>('ORDER_BRIDGE_ENFORCEMENT') === 'prompt_only'
            ? ('prompt_only' as const)
            : ('retry_once' as const),
        // ── Addendum v2 (2026-08-05) ──
        orderDeixisKeywords: this.list(this.config.get('ORDER_DEIXIS_KEYWORDS'), [
          'yg ini', 'yang ini', 'yg itu', 'yang itu', 'ini aja', 'itu aja',
          'yg td ditawarkan', 'yg tadi ditawarkan',
        ]),
        orderOfferWindowMinutes: this.num(this.config.get('ORDER_OFFER_WINDOW_MINUTES'), 60),
        orderGlobalTokens: this.pairs(this.config.get('ORDER_GLOBAL_TOKENS'), {}),
        orderFormHintKeywords: this.list(this.config.get('ORDER_FORM_HINT_KEYWORDS'), [
          'form pemesanan', 'sudah melakukan pemesanan', 'mengisi form',
        ]),
        orderReferenceKeywords: this.list(this.config.get('ORDER_REFERENCE_KEYWORDS'), [
          'yang tadi', 'yg tadi', 'pesanan tadi', 'order tadi', 'yang kemarin',
          'yg kemarin', 'sebelumnya',
        ]),
        orderNegoKeywords: this.list(this.config.get('ORDER_NEGO_KEYWORDS'), [
          'diskon lagi', 'kurangin', 'kurangi lagi', 'murahin', 'free ongkir',
          'gratis ongkir', 'nego', 'dikurangiin',
        ]),
        // >>> ANGGA — F1/F2 (2026-08-05): kata tanya-uang (substring, kata
        // dasar cukup — "totalnya" tertangkap "total").
        orderMoneyAskKeywords: this.list(this.config.get('ORDER_MONEY_ASK_KEYWORDS'), [
          'total', 'ongkir', 'ongkos', 'harga', 'berapa', 'bayar', 'biaya',
          'transfer', 'rekening', 'cod',
        ]),
        // <<< ANGGA
        // >>> ANGGA — E1 (2026-08-05): template sambutan form (kosong = mati;
        // diisi dari dashboard, contoh siap pakai ada di dok 06 folder
        // dokumentasi-order-context-log).
        orderFormWelcomeTemplate: (this.config.get<string>('ORDER_FORM_WELCOME_TEMPLATE') ?? '').trim(),
        // >>> ANGGA — E3 (2026-08-05): frasa internal yang haram bocor ke
        // pelanggan (backstop deterministik; BASE_RULES #13 lapisan promptnya).
        orderMetaPhraseBlacklist: this.list(this.config.get('ORDER_META_PHRASE_BLACKLIST'), [
          'penanda', 'placeholder', 'instruksi sistem', 'gerbang uang', 'grounding',
          'informasi harga yang akurat', 'informasi ongkir yang akurat',
          'dicek kembali di chat', 'cek chat ini',
          // >>> ANGGA — audit total (2026-08-05, insiden "purwokerto"): bot
          // HARAM melempar pelanggan ke ekspedisi ("cek di website resmi
          // ekspedisi / hubungi cs ekspedisi") — ongkir urusan toko.
          'website resmi ekspedisi', 'website ekspedisi', 'cs ekspedisi',
          // <<< ANGGA
        ]),
        // <<< ANGGA
        // >>> ANGGA — P2 (2026-08-05): frasa penyangkalan data. "admin" SENGAJA
        // tidak masuk daftar — "saya bantu konfirmasi dulu ke admin" adalah
        // jawaban resmi utk info yang memang tidak tersedia (BASE_RULES #3),
        // dan eskalasi nego memakai "atasan". Daftar ini khusus pola insiden
        // "tim/logistik/belum punya info" saat kutipan sebenarnya SUDAH ada.
        orderContradictionPhrases: this.list(this.config.get('ORDER_CONTRADICTION_PHRASES'), [
          'belum memiliki informasi', 'belum ada informasi', 'belum punya info',
          'tidak memiliki informasi', 'belum bisa memastikan', 'akan saya cek dulu',
          'cek dengan tim', 'tim logistik', 'menghubungkan dengan tim',
          'akan segera memberikan informasi',
          // >>> ANGGA — Q-Chain fix (2026-08-05, insiden "banyumas kak"): draft
          // nyata lolos karena urutan katanya beda ('saya AKAN CEK DULU ya kak',
          // bukan 'akan saya cek dulu'). Varian di bawah menambal celah urutan
          // kata; 'konfirmasi dulu ke admin' TIDAK dimasukkan — itu fallback sah
          // BASE_RULES #3 saat data memang tidak ada.
          'akan cek dulu', 'saya akan cek', 'akan konfirmasi ke admin',
          // >>> ANGGA — audit total (2026-08-05, insiden "purwokerto"): varian
          // penyangkalan baru dari draft nyata.
          'tidak bisa memberikan info', 'belum bisa mengakses',
          // <<< ANGGA
        ]),
        // >>> ANGGA — anti-teater proses (2026-08-05, insiden "mataram dobel"):
        // narasi "sedang mengecek" yang ditahan HANYA kalau draft yang sama
        // sudah menyisipkan penanda uang (kontradiksi satu pesan). Beda kelas
        // dari orderContradictionPhrases (itu bersyarat giliran-uang, ini
        // bersyarat token-terpasang) — nego dikecualikan di kode.
        orderTheaterPhrases: this.list(this.config.get('ORDER_THEATER_PHRASES'), [
          'saya cek dulu', 'saya bantu cek dulu', 'mohon tunggu', 'mohon ditunggu',
          'tunggu sebentar', 'saya proses dulu', 'setelah saya cek', 'sedang saya cek',
          'saya cek terlebih dahulu',
        ]),
        // <<< ANGGA
        // <<< ANGGA
        // >>> ANGGA — Q-Chain (2026-08-05, ketok Bossfren): funnel pertanyaan
        // berantai. Wording default = ketok; ubah dari dashboard tanpa deploy.
        orderFunnelEnabled: this.config.get<string>('ORDER_FUNNEL_ENABLED') !== 'false',
        orderFunnelAskItem: (this.config.get<string>('ORDER_FUNNEL_ASK_ITEM') ?? 'produknya mau yang mana kak? 😊').trim(),
        orderFunnelAskAddress: (this.config.get<string>('ORDER_FUNNEL_ASK_ADDRESS') ?? 'boleh diinfo alamat lengkapnya kak biar kami bantu hitung ongkirnya ya? 🙏').trim(),
        orderFunnelAskBasket: (this.config.get<string>('ORDER_FUNNEL_ASK_BASKET') ?? 'jadinya mau ambil dua-duanya sekalian ({{daftar_produk}}) atau salah satu dulu kak? 😊').trim(),
        orderFunnelAskBasketOpen: (this.config.get<string>('ORDER_FUNNEL_ASK_BASKET_OPEN') ?? 'produk yang mana aja kak yang jadi diambil? 😊').trim(),
        orderFunnelAskQty: (this.config.get<string>('ORDER_FUNNEL_ASK_QTY') ?? 'mau ambil berapa pcs kak?').trim(),
        orderFunnelAskPayment: (this.config.get<string>('ORDER_FUNNEL_ASK_PAYMENT') ?? 'mau diproses COD atau transfer kak? 😊').trim(),
        // >>> ANGGA — Q-Chain v3: patokan rumah (audit transkrip Aluna+Defa).
        orderFunnelAskLandmark: (this.config.get<string>('ORDER_FUNNEL_ASK_LANDMARK') ?? 'boleh dicantumkan patokan rumahnya dekat apa kak? biar kurir gampang nemuin alamatnya 🙏').trim(),
        // <<< ANGGA
      },
      // <<< ANGGA (Order Context)
    };
  }

  /** Load + cache the merged settings (defaults overlaid with DB rows). */
  async getAll(): Promise<AppSettings> {
    if (this.cache) return this.cache;
    const merged = this.defaults();
    try {
      const rows = await this.prisma.appSetting.findMany();
      // >>> ANGGA — addendum v2 M5, overlay LEGACY: sebelum kategori
      // `orderContext` ada, field order* tersimpan di baris `shipping`.
      // Nilai lama itu tetap dihormati (disalin ke orderContext DULU), lalu
      // baris `orderContext` sendiri menimpanya kalau ada — tidak ada nilai
      // Bossfren yang hilang, tanpa migrasi data.
      const shippingRow = rows.find((r) => r.key === 'shipping');
      if (shippingRow?.value && typeof shippingRow.value === 'object') {
        const legacy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(shippingRow.value as Record<string, unknown>)) {
          if (k.startsWith('order')) legacy[k] = v;
        }
        if (Object.keys(legacy).length) {
          merged.orderContext = { ...merged.orderContext, ...legacy } as never;
        }
      }
      // <<< ANGGA
      for (const row of rows) {
        const cat = row.key as keyof AppSettings;
        if (cat in merged && row.value && typeof row.value === 'object') {
          merged[cat] = { ...merged[cat], ...(row.value as Record<string, unknown>) } as never;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to load app settings, using env defaults: ${err}`);
    }
    this.cache = merged;
    return merged;
  }

  async ai(): Promise<AiSettings> {
    return (await this.getAll()).ai;
  }
  async wa(): Promise<WaSettings> {
    return (await this.getAll()).wa;
  }
  async notifications(): Promise<NotificationSettings> {
    return (await this.getAll()).notifications;
  }
  async sla(): Promise<SlaSettings> {
    return (await this.getAll()).sla;
  }
  async sentinel(): Promise<SentinelSettings> {
    return (await this.getAll()).sentinel;
  }
  async campaign(): Promise<CampaignSettings> {
    return (await this.getAll()).campaign;
  }
  // >>> ANGGA
  async shipping(): Promise<ShippingSettings> {
    return (await this.getAll()).shipping;
  }
  /** Addendum v2 M5 — kategori memori order percakapan. */
  async orderContext(): Promise<OrderContextSettings> {
    return (await this.getAll()).orderContext;
  }
  // <<< ANGGA

  /** Persist a category's values (partial merge) and invalidate the cache. */
  async updateCategory<K extends keyof AppSettings>(
    category: K,
    patch: Partial<AppSettings[K]>,
  ): Promise<AppSettings[K]> {
    const current = await this.getAll();
    const next = { ...current[category], ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: category },
      create: { key: category, value: next as object },
      update: { value: next as object },
    });
    this.cache = null;
    return next;
  }
}
