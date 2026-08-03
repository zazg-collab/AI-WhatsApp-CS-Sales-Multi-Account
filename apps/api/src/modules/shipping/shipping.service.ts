import { Injectable, Logger } from '@nestjs/common';
import { SenderType } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { tokenizeForMatch, scoreProductMatch } from '../products/products.util';
// >>> ANGGA: satu pemindai JSON dipakai bersama seluruh parser keluaran LLM,
// supaya tidak ada dua perilaku yang bisa diam-diam berbeda. <<< ANGGA
import { extractFirstJson } from '../../common/json-extract.util';
import {
  t,
  SHIPPING_EXTRACT_SYSTEM,
  SHIPPING_EXTRACT_USER,
  SHIPPING_GROUNDING_INTRO,
  SHIPPING_GROUNDING_UNKNOWN,
  SHIPPING_GROUNDING_AMBIGUOUS,
  SHIPPING_GROUNDING_NEED_PROVINCE,
  SHIPPING_GROUNDING_UNRESOLVED_ITEMS,
} from '../../i18n/bot-prompts';
import {
  MengantarClient,
  type CourierEstimate,
  type EstimateData,
  type MengantarAddress,
  type PerformanceData,
} from './mengantar.client';
import {
  ShippingQuoteCache,
  sameCity,
  type ShippingOutcome,
  type ShippingQuote,
} from './shipping-quote.cache';

/**
 * >>> ANGGA — Modul Shipping Service Mengantar (LAMPIRAN §2 Langkah 1-9).
 *
 * Pagar paling penting di seluruh berkas ini: TIDAK PERNAH menebak angka. Kalau
 * apa pun gagal (API mati, 0 kurir lolos filter, barang tidak cocok katalog),
 * hasilnya adalah status jujur "belum bisa dipastikan" — bukan Rp0, bukan
 * perkiraan, bukan angka dari LLM.
 *
 * Semua angka & aturan bisnis dibaca dari `settings.shipping()` (§6), bukan
 * ditulis di sini. Konstanta di bawah murni parameter teknis.
 */

/**
 * Langkah 1 — saringan kata kunci murah & deterministik (BUKAN panggilan LLM).
 * Tujuannya cuma: memutuskan apakah perlu memanggil LLM deteksi di Langkah 2
 * padahal sudah ada kutipan aktif. Sengaja longgar (lebih baik memanggil LLM
 * sekali lebih banyak daripada mengutip ongkir kota yang salah).
 */
export const PLACE_HINT =
  /(kirim(kan)?\s+ke|ongkir(nya)?\s+(ke|berapa)|dikirim\s+ke|alamat|domisili|lokasi\s?(saya|ku|aku)?|kota|kabupaten|kab\.|provinsi|daerah|luar\s+(kota|pulau)|jne|sicepat|j&t|kurir|ekspedisi)/i;

/**
 * Perubahan isi order juga membatalkan cache — di luar teks LAMPIRAN, tapi
 * diperlukan supaya "tambah 1 lagi" tidak dijawab dengan total lama. Rule 8
 * hanya menyebut perubahan KOTA sebagai pemicu reset; kalau hanya itu yang
 * dicek, total transfer/COD yang di-cache jadi salah begitu pelanggan menambah
 * barang. Dicatat eksplisit sebagai penguatan sadar, bukan penyimpangan diam.
 */
export const ORDER_CHANGE_HINT =
  /(tambah|nambah|sekalian|plus|lagi|jadi\s*\d+|ganti|kurangi|batal(kan)?\s+(satu|yang)|\b\d+\s*(pcs|pc|buah|biji|unit|set|lusin)\b)/i;

/**
 * Ambang skor pencocokan nama produk ke katalog. `scoreProductMatch` memberi
 * 2 poin untuk token yang cocok di name/sku dan 1 poin untuk category/
 * description; 2 = minimal satu token nama/SKU benar-benar cocok, bukan sekadar
 * nyerempet deskripsi. Parameter teknis (bukan angka bisnis §6).
 */
export const MIN_PRODUCT_MATCH_SCORE = 2;

/** Berapa pesan terakhir yang dibaca LLM deteksi Langkah 2. Parameter teknis. */
export const EXTRACT_HISTORY_LIMIT = 20;

export interface ExtractedItem {
  name: string;
  qty: number;
}

export interface ShippingOrderExtract {
  city: string | null;
  items: ExtractedItem[];
}

export type ShippingResult =
  | { status: 'ok'; quote: ShippingQuote }
  | { status: 'ambiguous'; candidates: Array<{ city: string; province: string }> }
  | { status: 'need_province'; keyword: string }
  | { status: 'no_destination' }
  | { status: 'unresolved_items'; unmatched: string[] }
  | { status: 'no_courier' }
  | { status: 'api_error' }
  | { status: 'not_configured' };

// ── Pembantu murni (diekspor supaya bisa diuji tanpa Nest/DB) ──────────────

/** Rule 11 — bulatkan ke kelipatan terdekat. inc <= 1 → tanpa pembulatan. */
export function roundTo(value: number, increment: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(increment) || increment <= 1) return Math.round(value);
  return Math.round(value / increment) * increment;
}

/**
 * Konversi berat total gram → KILOGRAM, dibulatkan KE ATAS.
 *
 * Parameter `weight` API Mengantar berskala kilogram (dibuktikan live
 * 2026-08-03: JNE Medan w=1 → 47.000, w=2 → 94.000, w=3 → 141.000, dan w=0,5
 * ditagih sama dengan w=1). Langkah 4-5 LAMPIRAN menyebut "gram" — kalau itu
 * dituruti mentah, 2 pcs (2000 g) dikirim sebagai 2000 kg dan API balas
 * Rp94.000.000. Pembulatan ke atas dilakukan di sini (bukan menyandarkan diri
 * pada pembulatan API yang tidak terdokumentasi), keputusan Bossfren.
 */
export function gramsToKg(totalGrams: number): number {
  if (!Number.isFinite(totalGrams) || totalGrams <= 0) return 1;
  return Math.max(1, Math.ceil(totalGrams / 1000));
}

/** Kelompokkan hasil Search Address per PROVINCE_NAME + CITY_NAME (Langkah 3). */
export function groupAddresses(rows: MengantarAddress[]): Array<{
  city: string;
  province: string;
  ids: string[];
}> {
  const groups = new Map<string, { city: string; province: string; ids: string[] }>();
  for (const r of rows ?? []) {
    const city = (r?.CITY_NAME ?? '').trim();
    const province = (r?.PROVINCE_NAME ?? '').trim();
    if (!city || !r?._id) continue;
    const key = `${province.toLowerCase()}|${city.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) existing.ids.push(r._id);
    else groups.set(key, { city, province, ids: [r._id] });
  }
  return Array.from(groups.values());
}

/** Rule 1 — filter kurir. */
export function passesCourierFilter(
  name: string,
  est: CourierEstimate,
  excludeList: string[],
): boolean {
  const lower = (name ?? '').toLowerCase();
  if (excludeList.some((x) => x.toLowerCase() === lower)) return false;
  if (est?.unsupported === true) return false;
  const price = Number(est?.price ?? 0);
  const estimated = Number(est?.estimatedPrice ?? 0);
  if (!(price > 0) || !(estimated > 0)) return false;
  return true;
}

/** Rule 2 — kelayakan COD satu kurir (setelah Rule 3 lolos). */
export function isCourierCodEligible(
  name: string,
  est: CourierEstimate,
  codAllowlist: string[],
): boolean {
  if (est?.unsupported_cod === true) return false;
  if (est?.unsupported_cod === false) return true;
  // Field tidak ada / null — tidak didefinisikan di dokumentasi Mengantar.
  // Satu-satunya jalan aman: allowlist manual (§10). `coverage_cod` dan
  // `codFee = 0` sudah diuji live dan DITOLAK sebagai sinyal pengganti.
  const lower = (name ?? '').toLowerCase();
  return codAllowlist.some((x) => x.toLowerCase() === lower);
}

/** Rule 3 — kebijakan toko: wilayah yang tidak menerima COD. Substring, bukan
 *  exact match, supaya provinsi hasil pemekaran ikut terblokir otomatis. */
export function isRegionCodBlocked(province: string, keywords: string[]): boolean {
  const lower = (province ?? '').toLowerCase();
  if (!lower) return false;
  return (keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
}

/**
 * Rule 5 — pilih satu kurir dari daftar kandidat yang SUDAH tersaring:
 * `recommended` → `bestCourier` → skor tertinggi. Cocokkan nama kurir secara
 * case-insensitive: respons performance memakai "Sap" sementara respons
 * estimate memakai "SAP" (terbukti live).
 */
export function pickCourier(candidates: string[], perf: PerformanceData | null): string | null {
  if (!candidates.length) return null;
  const find = (name?: string): string | null => {
    if (!name) return null;
    const hit = candidates.find((c) => c.toLowerCase() === name.toLowerCase());
    return hit ?? null;
  };
  const recommended = find(perf?.recommended);
  if (recommended) return recommended;
  const best = find(perf?.bestCourier);
  if (best) return best;
  const scored = (perf?.couriers ?? [])
    .map((c) => ({ name: find(c.key), score: Number(c.score) || 0 }))
    .filter((c): c is { name: string; score: number } => c.name !== null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.name ?? null;
}

/** Format rupiah untuk grounding text: "152.500". Sengaja manual, bukan
 *  `toLocaleString('id-ID')`, supaya hasilnya tidak bergantung pada ICU build
 *  Node di server produksi. */
export function formatIdr(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly provider: AiProviderService,
    private readonly mengantar: MengantarClient,
    private readonly cache: ShippingQuoteCache,
  ) {}

  cacheStats() {
    return this.cache.stats();
  }

  lastOutcome(conversationId: string): ShippingOutcome | null {
    return this.cache.lastOutcome(conversationId);
  }

  // ── Langkah 2 — deteksi tujuan & item order (satu panggilan LLM kecil) ────

  /**
   * Satu pemanggilan LLM mode JSON yang mengembalikan DUA hal sekaligus (kota
   * tujuan + daftar item), persis pola `LEAD_SCORE_SYSTEM`/`SENTIMENT_SYSTEM`.
   * Tidak pernah melempar: parse gagal → hasil kosong → alur berhenti dengan
   * jujur, bukan menebak.
   *
   * Yang deterministik (harga & berat per item) TIDAK diambil dari sini —
   * hanya nama & qty. Harga/berat dibaca dari katalog `Product`.
   */
  async extractOrderTarget(conversationId: string): Promise<ShippingOrderExtract> {
    const empty: ShippingOrderExtract = { city: null, items: [] };
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        bot: { select: { language: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: EXTRACT_HISTORY_LIMIT,
          select: { senderType: true, content: true },
        },
      },
    });
    if (!conv) return empty;
    const lang = conv.bot?.language ?? 'id';

    const history = conv.messages
      .slice()
      .reverse()
      .filter((m) => (m.content ?? '').trim())
      .map((m) => ({
        role: m.senderType === SenderType.customer ? ('user' as const) : ('assistant' as const),
        content: m.content as string,
      }));
    if (!history.length) return empty;

    let raw: string;
    try {
      raw = await this.provider.chat(
        [
          { role: 'system', content: t(SHIPPING_EXTRACT_SYSTEM, lang) },
          ...history,
          { role: 'user', content: t(SHIPPING_EXTRACT_USER, lang) },
        ],
        { temperature: 0, json: true, maxTokens: 300 },
      );
    } catch (err) {
      this.logger.warn(`Deteksi tujuan/item gagal: ${err}`);
      return empty;
    }
    return parseExtract(raw);
  }

  // ── Langkah 1-9 — alur utama ─────────────────────────────────────────────

  async quoteForConversation(conversationId: string): Promise<ShippingResult> {
    const cfg = await this.settings.shipping();
    if (!cfg.mengantarApiKey || !cfg.mengantarOriginId) {
      this.cache.recordOutcome(conversationId, 'not_configured');
      return { status: 'not_configured' };
    }

    // Langkah 1 — cek cache dulu, deterministik, tanpa LLM.
    const lastCustomerText = await this.lastCustomerText(conversationId);
    const cached = this.cache.get(conversationId);
    const mayHaveChanged =
      PLACE_HINT.test(lastCustomerText) || ORDER_CHANGE_HINT.test(lastCustomerText);
    if (cached && !mayHaveChanged) {
      this.cache.recordOutcome(conversationId, 'ok');
      return { status: 'ok', quote: cached };
    }

    // Langkah 2 — deteksi tujuan & item.
    const extract = await this.extractOrderTarget(conversationId);
    const city = extract.city?.trim() || cached?.city || null;
    if (!city) {
      this.cache.recordOutcome(conversationId, 'no_destination');
      return { status: 'no_destination' };
    }

    // Kutipan lama masih sah kalau kota DAN isi order sama persis.
    if (cached && sameCity(cached.city, city) && sameItems(cached.items, extract.items)) {
      this.cache.recordOutcome(conversationId, 'ok');
      return { status: 'ok', quote: cached };
    }
    // Tujuan/isi berubah → reset (Rule 8: direset, bukan ditambah).
    this.cache.reset(conversationId);

    const result = await this.quote({ keyword: city, items: extract.items });
    if (result.status === 'ok') {
      this.cache.set(conversationId, result.quote, cfg.quoteCacheTtlMs);
    }
    this.cache.recordOutcome(conversationId, result.status);
    return result;
  }

  /**
   * Inti Langkah 3-9, tanpa percakapan — dipakai juga oleh endpoint uji manual
   * admin di controller (pola "kolom uji pertanyaan" di menu Knowledge).
   */
  async quote(input: {
    keyword: string;
    items: ExtractedItem[];
    /**
     * >>> ANGGA: izinkan menghitung TANPA daftar barang — ongkir saja, memakai
     * berat default toko untuk 1 unit, harga barang 0.
     *
     * HANYA dipakai alat uji manual admin. Jalur pelanggan
     * (`quoteForConversation`) TIDAK PERNAH menyalakan ini: total transfer/COD
     * yang dikutip ke pelanggan menurut definisi butuh harga barang, dan
     * mengarangnya berarti menebak — pagar utama LAMPIRAN. Untuk admin yang
     * cuma ingin tahu "ongkir ke Magetan berapa", memaksa mengisi barang dulu
     * membuat alat ujinya tidak berguna.
     */
    allowEmptyItems?: boolean;
  }): Promise<ShippingResult> {
    const cfg = await this.settings.shipping();
    if (!cfg.mengantarApiKey || !cfg.mengantarOriginId) return { status: 'not_configured' };

    // Langkah 3 — Search Address + pengelompokan per provinsi+kota.
    const rows = await this.mengantar.searchAddress(input.keyword);
    if (rows === null) return { status: 'api_error' };
    const groups = groupAddresses(rows);
    // Kata kunci disebut tapi tidak ketemu sama sekali di data Mengantar —
    // beda kasus dari "pelanggan belum menyebut kota": minta pelanggan
    // menyebut provinsi/kota yang lebih jelas, jangan diam soal ongkir.
    if (groups.length === 0) return { status: 'need_province', keyword: input.keyword };
    if (groups.length > 3) return { status: 'need_province', keyword: input.keyword };
    if (groups.length > 1) {
      return {
        status: 'ambiguous',
        candidates: groups.map((g) => ({ city: g.city, province: g.province })),
      };
    }
    const target = groups[0];
    // Tarif Mengantar seragam per kota/kabupaten (dibuktikan live), jadi _id
    // mana pun dari kelompok ini boleh dipakai sebagai destination_id.
    const destinationId = target.ids[0];

    // Langkah 4 — berat & harga total order dari katalog (deterministik).
    const shippingOnly = input.items.length === 0 && input.allowEmptyItems === true;
    const resolved = shippingOnly
      ? { matched: [], unmatched: [], totalGrams: cfg.defaultWeightGrams, totalPrice: 0 }
      : await this.resolveItems(input.items, cfg.defaultWeightGrams);
    if (!shippingOnly && (resolved.unmatched.length || resolved.matched.length === 0)) {
      return { status: 'unresolved_items', unmatched: resolved.unmatched };
    }
    const weightKg = gramsToKg(resolved.totalGrams);

    // Langkah 5 — cek ongkir TANPA COD dulu, lalu terapkan Rule 1.
    const estimates = await this.mengantar.estimate({ destinationId, weightKg });
    if (estimates === null) return { status: 'api_error' };
    const passing = Object.entries(estimates).filter(
      ([name, est]) =>
        est && typeof est === 'object' && passesCourierFilter(name, est, cfg.courierExclude),
    );
    // Rule 10 — API hidup tapi 0 kurir lolos: diperlakukan sama seperti API mati.
    if (passing.length === 0) return { status: 'no_courier' };

    // Langkah 6 — pilih kurir, COD-aware.
    const perf = await this.mengantar.performance(target.city, estimates);
    if (perf === null) return { status: 'api_error' };

    const passingNames = passing.map(([name]) => name);
    const transferCourier = pickCourier(passingNames, perf);
    if (!transferCourier) return { status: 'no_courier' };

    // Langkah 7 — kelayakan COD: kebijakan toko dulu, baru kemampuan kurir.
    const regionBlocked = isRegionCodBlocked(target.province, cfg.codBlockedRegionKeywords);
    const codCandidates = regionBlocked
      ? []
      : passing
          .filter(([name, est]) => isCourierCodEligible(name, est, cfg.codAllowlist))
          .map(([name]) => name);
    const codCourier = pickCourier(codCandidates, perf);

    const goodsTotal = resolved.totalPrice;
    const transferShipping = Number(estimates[transferCourier]?.estimatedPrice ?? 0);
    const transferRaw = goodsTotal + transferShipping;

    // Langkah 8 — codFee akurat, SELALU dari API (Rule 6), tidak pernah dihitung
    // sendiri dengan persentase apa pun.
    let codTotal: number | null = null;
    let codCourierFinal: string | null = null;
    if (codCourier) {
      const codShipping = Number(estimates[codCourier]?.estimatedPrice ?? 0);
      const codAmount = goodsTotal + codShipping;
      const withCod = await this.mengantar.estimate({ destinationId, weightKg, codAmount });
      if (withCod === null) return { status: 'api_error' };
      const codFee = Number(withCod[codCourier]?.codFee ?? 0);
      if (codFee > 0) {
        codCourierFinal = codCourier;
        codTotal = roundTo(goodsTotal + codShipping + codFee, cfg.priceRoundingIncrement);
      }
      // codFee tidak masuk akal (<= 0) → jangan tawarkan COD, jangan tebak.
    }

    // Langkah 9 — dua angka akhir, dibulatkan (Rule 11).
    const quote: ShippingQuote = {
      city: target.city,
      province: target.province,
      destinationId,
      weightKg,
      goodsTotal,
      transferCourier,
      transferTotal: roundTo(transferRaw, cfg.priceRoundingIncrement),
      codCourier: codCourierFinal,
      codTotal,
      codEligible: codCourierFinal !== null,
      codBlockedReason: codCourierFinal
        ? null
        : regionBlocked
          ? 'region'
          : 'no_eligible_courier',
      shippingOnly, // >>> ANGGA <<<
      // Sengaja item MENTAH hasil ekstraksi (bukan nama katalog): dipakai untuk
      // membandingkan "isi order masih sama?" saat memutuskan cache masih sah.
      items: input.items.map((i) => ({
        name: i.name,
        qty: Number.isFinite(i.qty) && i.qty > 0 ? Math.floor(i.qty) : 1,
      })),
    };
    return { status: 'ok', quote };
  }

  // ── Langkah 10 — teks yang disuntik ke prompt ─────────────────────────────

  /**
   * HANYA dua angka akhir yang sudah dibulatkan (plus status COD & nama kurir)
   * yang masuk ke sini. Rincian mentah (price/estimatedSpecialPrice/codFee)
   * SENGAJA tidak pernah ikut — supaya otomatis sejalan dengan aturan persona
   * "jangan tunjukkan hitungan ke pelanggan", dan supaya margin ongkir toko
   * (selisih estimatedPrice vs estimatedSpecialPrice) tidak pernah bocor.
   */
  async getGroundingText(conversationId: string, lang = 'id'): Promise<string> {
    let result: ShippingResult;
    try {
      result = await this.quoteForConversation(conversationId);
    } catch (err) {
      this.logger.warn(`Grounding ongkir gagal: ${err}`);
      result = { status: 'api_error' };
    }

    switch (result.status) {
      case 'ok': {
        const q = result.quote;
        const lines = [
          t(SHIPPING_GROUNDING_INTRO, lang),
          `• Tujuan: ${q.city}, ${q.province}`,
          `• Total kalau TRANSFER: Rp${formatIdr(q.transferTotal)} (kurir ${q.transferCourier}, sudah termasuk ongkir)`,
        ];
        if (q.codTotal != null && q.codCourier) {
          lines.push(
            `• Total kalau COD: Rp${formatIdr(q.codTotal)} (kurir ${q.codCourier}, sudah termasuk ongkir + biaya COD)`,
          );
        } else if (q.codBlockedReason === 'region') {
          lines.push('• COD TIDAK tersedia untuk wilayah ini (kebijakan toko). Tawarkan transfer saja.');
        } else {
          lines.push('• COD tidak tersedia untuk tujuan ini. Tawarkan transfer saja.');
        }
        return lines.join('\n');
      }
      case 'ambiguous':
        return (
          t(SHIPPING_GROUNDING_AMBIGUOUS, lang) +
          '\n' +
          result.candidates.map((c) => `• ${c.city}, ${c.province}`).join('\n')
        );
      case 'need_province':
        return t(SHIPPING_GROUNDING_NEED_PROVINCE, lang);
      case 'unresolved_items':
        return t(SHIPPING_GROUNDING_UNRESOLVED_ITEMS, lang);
      case 'no_destination':
        // Belum ada tujuan yang disebut sama sekali → tidak ada apa pun yang
        // perlu disuntik soal ongkir untuk giliran balasan ini.
        return '';
      case 'no_courier':
      case 'api_error':
      case 'not_configured':
      default:
        return t(SHIPPING_GROUNDING_UNKNOWN, lang);
    }
  }

  /**
   * Langkah 11 — angka (sudah dibulatkan) untuk memperluas `checkPriceGrounding`.
   * Terpisah dari `getGroundingText` supaya teks naratif "belum bisa dipastikan"
   * tidak ikut terhitung sebagai data grounding oleh `checkKnowledgeGrounding`.
   */
  async getGroundingNumbers(conversationId: string): Promise<string> {
    const quote = this.cache.get(conversationId);
    if (!quote) return '';
    const parts = [String(quote.transferTotal), String(quote.goodsTotal)];
    if (quote.codTotal != null) parts.push(String(quote.codTotal));
    return parts.join(' ');
  }

  // ── Pembantu internal ────────────────────────────────────────────────────

  private async lastCustomerText(conversationId: string): Promise<string> {
    const msg = await this.prisma.message.findFirst({
      where: { conversationId, senderType: SenderType.customer },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    return msg?.content ?? '';
  }

  /**
   * Langkah 4 — cocokkan nama yang disebut LLM ke katalog `Product`, lalu ambil
   * harga & berat DARI KATALOG (bukan dari angka yang mungkin disebut LLM).
   * Satu item saja gagal dicocokkan → seluruh kutipan dibatalkan; sistem tidak
   * pernah mengutip ongkir untuk sebagian barang saja.
   */
  private async resolveItems(
    items: ExtractedItem[],
    defaultWeightGrams: number,
  ): Promise<{
    matched: Array<{ name: string; qty: number; grams: number; price: number }>;
    unmatched: string[];
    totalGrams: number;
    totalPrice: number;
  }> {
    const matched: Array<{ name: string; qty: number; grams: number; price: number }> = [];
    const unmatched: string[] = [];
    if (!items.length) return { matched, unmatched, totalGrams: 0, totalPrice: 0 };

    const products = await this.prisma.product.findMany({
      where: { status: 'active' },
      take: 500,
    });

    for (const item of items) {
      const tokens = tokenizeForMatch(item.name);
      const best = products
        .map((p) => ({ p, score: scoreProductMatch(p, tokens) }))
        .sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < MIN_PRODUCT_MATCH_SCORE) {
        unmatched.push(item.name);
        continue;
      }
      const qty = Number.isFinite(item.qty) && item.qty > 0 ? Math.floor(item.qty) : 1;
      const grams = (best.p as { weightGrams?: number | null }).weightGrams ?? defaultWeightGrams;
      matched.push({ name: best.p.name, qty, grams, price: best.p.price ?? 0 });
    }

    const totalGrams = matched.reduce((sum, m) => sum + m.qty * m.grams, 0);
    const totalPrice = matched.reduce((sum, m) => sum + m.qty * m.price, 0);
    return { matched, unmatched, totalGrams, totalPrice };
  }
}

// ── Pembantu murni tingkat modul ────────────────────────────────────────────



export function parseExtract(raw: string): ShippingOrderExtract {
  const empty: ShippingOrderExtract = { city: null, items: [] };
  try {
    const json = JSON.parse(extractFirstJson(raw) ?? '') as {
      kota?: unknown;
      city?: unknown;
      items?: Array<{ nama?: unknown; name?: unknown; qty?: unknown }>;
    };
    const rawCity = json.kota ?? json.city;
    const city =
      typeof rawCity === 'string' && rawCity.trim() && rawCity.trim().toLowerCase() !== 'null'
        ? rawCity.trim()
        : null;
    const items = (Array.isArray(json.items) ? json.items : [])
      .map((i) => {
        const name = String(i?.nama ?? i?.name ?? '').trim();
        const qtyNum = Number(i?.qty);
        const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? Math.floor(qtyNum) : 1;
        return { name, qty };
      })
      .filter((i) => i.name.length > 0);
    return { city, items };
  } catch {
    return empty;
  }
}

/** Bandingkan dua daftar item (nama + qty), tanpa peduli urutan. */
export function sameItems(a: ExtractedItem[], b: ExtractedItem[]): boolean {
  const key = (list: ExtractedItem[]) =>
    list
      .map((i) => `${i.name.toLowerCase().trim()}x${i.qty}`)
      .sort()
      .join('|');
  return key(a ?? []) === key(b ?? []);
}
