import { Injectable, Logger, Optional } from '@nestjs/common';
import { MessageStatus, SenderType } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { OrderContextSettings, ShippingSettings } from '../settings/settings.types';
import { NotificationsService } from '../../notifications/notifications.service'; // >>> ANGGA — addendum v2 P2 <<<
import { AiProviderService } from '../ai/ai-provider.service';
import { tokenizeForMatch, scoreProductMatch } from '../products/products.util';
// >>> ANGGA: satu pemindai JSON dipakai bersama seluruh parser keluaran LLM,
// supaya tidak ada dua perilaku yang bisa diam-diam berbeda. <<< ANGGA
import { extractFirstJson } from '../../common/json-extract.util';
import {
  t,
  SHIPPING_EXTRACT_SYSTEM,
  SHIPPING_EXTRACT_USER,
  SHIPPING_MONEY_RULE, // >>> ANGGA — Fase 113 <<<
  SHIPPING_GROUNDING_INTRO,
  SHIPPING_GROUNDING_UNKNOWN,
  SHIPPING_GROUNDING_AMBIGUOUS,
  SHIPPING_GROUNDING_NEED_DETAIL,
  SHIPPING_GROUNDING_ASK_DISTRICT,
  SHIPPING_GROUNDING_ASK_PROVINCE,
  SHIPPING_GROUNDING_DESTINATION_STUCK,
  SHIPPING_GROUNDING_SHIPPING_ONLY,
  SHIPPING_GROUNDING_UNRESOLVED_ITEMS,
  // >>> ANGGA — Order Context Log (blueprint 2026-08-04)
  SHIPPING_EXTRACT_ANCHOR,
  SHIPPING_GROUNDING_ITEM_AMBIGUOUS,
  SHIPPING_GROUNDING_ITEM_AMBIGUOUS_OPEN, // >>> ANGGA — tangga barang terbuka (2026-08-05) <<<
  SHIPPING_GROUNDING_ASSUMED,
  SHIPPING_GROUNDING_STALE_CONTEXT,
  SHIPPING_GROUNDING_CONTEXT_DOWNGRADE,
  SHIPPING_GROUNDING_NEGO_OFFER,
  SHIPPING_GROUNDING_NEGO_STUCK,
  // <<< ANGGA
  // >>> ANGGA — P0+P2 (2026-08-05)
  SHIPPING_GROUNDING_AMBIGUOUS_OPEN,
  SHIPPING_GROUNDING_DATA_READY,
  // <<< ANGGA
  // >>> ANGGA — Q-Chain (2026-08-05)
  SHIPPING_FUNNEL_DIRECTIVE,
  SHIPPING_FUNNEL_TOTAL,
  // <<< ANGGA
  // >>> ANGGA — fix (2026-08-06, langkah closing)
  SHIPPING_FUNNEL_CLOSING,
  // <<< ANGGA
} from '../../i18n/bot-prompts';
// >>> ANGGA — Fase 113: satu definisi "angka uang" dipakai ulang dari
// rules.engine.ts, bukan diduplikasi di sini. rules.engine.ts tidak balik
// bergantung ke modul shipping (arahnya searah, aman dari impor melingkar).
import { angkaUtuh } from '../sentinel/rules.engine';
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
  type DestinationChoice,
  type ItemChoicePending,
  type ShippingOutcome,
  type ShippingQuote,
} from './shipping-quote.cache';
// >>> ANGGA — Order Context Log (blueprint 2026-08-04): memori order
// ter-persist; sumber kebenaran konteks, cache di atas tinggal memo performa.
import {
  OrderContextService,
  mergeSnapshots,
  catalogMatchesInText,
  type OfferEntry,
  type OrderContextEntry,
} from './order-context.service';
// <<< ANGGA

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
  // >>> ANGGA — 2026-08-06 (insiden "mahal ya, ke purwokerto aja deh berapa
  // ongkirnya?" dijawab ongkir MATARAM): + urutan TERBALIK "berapa ongkir(nya)"
  // dan "ke <tempat> aja/dulu/deh" — frasa ganti-tujuan paling umum yang dulu
  // lolos → giliran ketelan cache → angka kota lama nempel ke kota baru. <<<
  /(kirim(kan)?\s+ke|ongkir(nya)?\s+(ke|berapa)|berapa\s+ongkir|ke\s+\w+\s+(aja|saja|dulu|deh)|dikirim\s+ke|alamat|domisili|lokasi\s?(saya|ku|aku)?|kota|kabupaten|kab\.|provinsi|daerah|luar\s+(kota|pulau)|jne|sicepat|j&t|kurir|ekspedisi)/i;

/**
 * Perubahan isi order juga membatalkan cache — di luar teks LAMPIRAN, tapi
 * diperlukan supaya "tambah 1 lagi" tidak dijawab dengan total lama. Rule 8
 * hanya menyebut perubahan KOTA sebagai pemicu reset; kalau hanya itu yang
 * dicek, total transfer/COD yang di-cache jadi salah begitu pelanggan menambah
 * barang. Dicatat eksplisit sebagai penguatan sadar, bukan penyimpangan diam.
 *
 * >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, insiden nyata di produksi):
 * pola lama TIDAK menangkap "kalau beli 2 gmn kak?" sama sekali (bukan
 * "tambah"/"nambah"/"plus"/"lagi", bukan "jadi <angka>" karena "jadi" di situ
 * diikuti "berapa" bukan angka, bukan juga "<angka> pcs/buah/unit"). Cache
 * qty=1 lama dipakai apa adanya, dan model terpaksa mengarang sendiri "2 x
 * Rp139.000 = Rp139.000" (matematika salah) karena sistem tidak menyediakan
 * penanda total untuk qty baru itu. Ditambahkan pola verba-beli + angka
 * ("beli/pesan/ambil/order/mau <angka>") supaya frasa qty-change paling umum
 * di bahasa sehari-hari ikut memicu reset & kutip ulang.
 */
export const ORDER_CHANGE_HINT =
  /(tambah|nambah|sekalian|plus|lagi|jadi\s*\d+|ganti|kurangi|batal(kan)?\s+(satu|yang)|\b\d+\s*(pcs|pc|buah|biji|unit|set|lusin)\b|(beli|pesan|ambil|order|mau)\s*\d+)/i;

/**
 * >>> ANGGA — fix (2026-08-06, ketok Bossfren "kalau udah dijawab alamat
 * lengkap patokan opsional. kecuali tidak ada nomer rumah atau nama jalan
 * wajib tanyakan patokan"): heuristik MURAH mendeteksi apakah suatu teks
 * alamat SUDAH memuat nama jalan ("Jl."/"Jalan"/"Gg."/"Gang"/dll) + nomor
 * rumah (angka menempel padanya, dengan/tanpa kata "No"). Sengaja regex
 * longgar, BUKAN daftar kata yang terus ditambal — tidak ada API ground-
 * truth untuk validasi alamat level jalan/nomor rumah seperti yang ada
 * untuk kota/kecamatan (`searchAddress`), jadi heuristik teks adalah yang
 * terbaik yang tersedia di titik keputusan ini. Dipakai `funnelDirective`
 * menentukan apakah langkah PATOKAN masih wajib ditanya, atau boleh
 * langsung lompat ke CLOSING karena alamatnya sudah cukup buat kurir.
 */
const NAMA_JALAN_HINT = /\b(jl\.?|jalan|gg\.?|gang|blok|komplek|perumahan|perum)\b/i;
export function adaAlamatLengkap(text: string): boolean {
  if (!NAMA_JALAN_HINT.test(text ?? '')) return false;
  return /\b(jl\.?|jalan|gg\.?|gang|blok|komplek|perumahan|perum)\b[^,\n]{0,40}?(no\.?\s*)?\d+/i.test(text ?? '');
}

// >>> GEMINI — Helper Presisi Validasi Alamat (2026-08-06, Mandat Bossfren):
// (1) Cek apakah teks murni pilihan metode pembayaran (COD/Transfer)
// (2) Cek apakah teks memuat penanda jalan/wilayah/patokan (lokasi fisik)
// (3) Sanitasi cache alamat agar tidak tercemar pengulangan teks metode bayar

export function isPaymentMethodChoice(text: string): boolean {
  if (!text || !text.trim()) return false;
  const hasPaymentWord = /\b(cod|bayar\s*di\s*tempat|transfer|tf|trf|trx|rekening)\b/i.test(text);
  const hasStreetOrWilayah = /\b(jalan|jl\.?|jln\.?|rt\.?|rw\.?|no\.?|nomor|kelurahan|kel\.?|kecamatan|kec\.?|kabupaten|kab\.?|provinsi|prov\.?|kode\s*pos)\b/i.test(text);
  return hasPaymentWord && !hasStreetOrWilayah;
}

export function containsAddressOrLandmark(text: string): boolean {
  if (!text || !text.trim()) return false;
  const t = text.toLowerCase();
  const hasStreet = /\b(jalan|jl\.?|jln\.?|rt\.?|rw\.?|no\.?|nomor|gang|gk\.?|blok|kav\.?|kavling|perum\.?|perumahan|residence|gedung|lantai)\b/i.test(t);
  const hasWilayah = /\b(kelurahan|kel\.?|kecamatan|kec\.?|kabupaten|kab\.?|kota|provinsi|prov\.?|kode\s*pos|\d{5})\b/i.test(t);
  const hasLandmark = /\b(dekat|sebelah|depan|belakang|samping|seberang|pertigaan|perempatan|lampu\s*merah|masjid|musholla|gereja|sekolah|sd|smp|sma|smk|kampus|universitas|rs|rumah\s*sakit|puskesmas|pasar|toko|warung|indomaret|alfamart|pos\s*ronda|lapangan|stasiun|terminal|bandara|gapura)\b/i.test(t);
  return hasStreet || hasWilayah || hasLandmark;
}

export function sanitizeAddressText(address: string): string {
  if (!address) return '';
  return address
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isPaymentMethodChoice(line))
    .join('\n');
}
// <<< GEMINI

/**
 * Ambang skor pencocokan nama produk ke katalog. `scoreProductMatch` memberi
 * 2 poin untuk token yang cocok di name/sku dan 1 poin untuk category/
 * description; 2 = minimal satu token nama/SKU benar-benar cocok, bukan sekadar
 * nyerempet deskripsi. Parameter teknis (bukan angka bisnis §6).
 */
export const MIN_PRODUCT_MATCH_SCORE = 2;

/** Berapa pesan terakhir yang dibaca LLM deteksi Langkah 2. Parameter teknis. */
export const EXTRACT_HISTORY_LIMIT = 20;

/**
 * >>> ANGGA — berapa kali bot boleh bertanya soal tujuan sebelum menyerahkannya
 * ke admin. Tangganya: (1) pertanyaan tertutup "Kota atau Kabupaten?",
 * (2) minta kecamatan, (3) serahkan ke manusia.
 *
 * Yang tertutup didahulukan karena paling murah: pelanggan memilih satu dari
 * dua, jawabannya langsung memetakan ke destination_id yang SUDAH di tangan,
 * tanpa pencarian ulang. Kecamatan sengaja di tangga dua — jawabannya bisa
 * ambigu sendiri (dibuktikan live: "Cibinong" ada di Kab. Bogor DAN Kab.
 * Cianjur), jadi menaruhnya duluan malah bisa menambah putaran.
 *
 * Parameter teknis, bukan angka bisnis §6.
 */
export const MAX_DESTINATION_ASKS = 2;

/** >>> ANGGA — Order Context Log: batas entri memo per-giliran (padanan
 *  MAX_QUOTE_ENTRIES di cache). Parameter teknis. <<< */
export const MAX_TURN_MEMO_ENTRIES = 500;

export interface ExtractedItem {
  name: string;
  qty: number;
}

export interface ShippingOrderExtract {
  city: string | null;
  /** >>> ANGGA — P4 (2026-08-05): provinsi DIPISAH dari kota — "mataram nusa
   *  tenggara barat" dulu jadi satu keyword yang nol hasil; kini provinsi jadi
   *  SARINGAN deterministik atas kelompok kandidat. <<< */
  province: string | null;
  items: ExtractedItem[];
  /** >>> ANGGA — audit total (2026-08-05, insiden "purwokerto dijawab data
   *  mataram"): true = ekstraksi GAGAL (LLM error / JSON rusak), BUKAN sekadar
   *  kosong. Beda kelasnya penting: kosong = pelanggan memang tak menyebut
   *  apa-apa (carry-over sah); GAGAL pada giliran ber-hint tempat/order =
   *  fallback kota lama DILARANG (bisa salah-label kota) → jujur api_error. <<< */
  failed?: boolean;
}

export type ShippingResult =
  | { status: 'ok'; quote: ShippingQuote }
  // >>> ANGGA — P0 (2026-08-05): `keyword` = tempat yang pelanggan sebut
  // (untuk pertanyaan terbuka "X-nya mana ya kak?"); `sempit` = kandidat hasil
  // PENYEMPITAN jawaban pelanggan → dibacakan tertutup. <<<
  | { status: 'ambiguous'; candidates: DestinationChoice[]; keyword?: string; sempit?: boolean }
  | { status: 'need_more_detail'; keyword: string }
  | { status: 'no_destination' }
  | { status: 'unresolved_items'; unmatched: string[] }
  // >>> ANGGA — Order Context Log: nama barang cocok >1 produk katalog dengan
  // skor SERI → bot bertanya tertutup, tidak memilih diam-diam (tambal bug
  // laten `sort[0]`). Padanan status 'ambiguous' untuk barang.
  | { status: 'item_ambiguous'; keyword: string; itemCandidates: Array<{ productId: string; name: string }> }
  // <<< ANGGA
  | { status: 'no_courier' }
  | { status: 'api_error' }
  | { status: 'not_configured' };

// ── State Machine — Fase 2 ────────────────────────────────────────────────────
// Setiap giliran diklasifikasikan ke SATU state oleh classifyTurn().
// Handler per-state menerima QuoteTurnContext dan mengembalikan ShippingResult.
// Menambah jalur baru: (1) tambah entry ke QuoteTurnState, (2) buat handler,
// (3) tambah cabang di switch di classifyTurn & quoteForConversation.

export type QuoteTurnState =
  | 'CACHE_HIT'      // cache in-memory valid, aman dijawab langsung
  | 'LOG_HIT'        // tidak ada cache tapi log segar tersedia + pertanyaan uang
  | 'ITEM_CHOICE'    // Q-Chain: pendingItems ada dan pesan adalah jawaban pilihan
  | 'DEIXIS'         // frasa tunjuk (yg itu/tadi) → resolve dari offer registry
  | 'DESTINATION'    // jawabanPolosTujuan → resolusi literal kota/kecamatan
  | 'EXTRACT';       // jalur default: ekstraksi LLM + carry-over + quote()

/** Konteks satu giliran yang sudah diklasifikasikan oleh classifyTurn(). */
export interface QuoteTurnContext {
  conversationId: string;
  lastCustomerText: string;
  state: QuoteTurnState;
  // Sinyal deterministik (dihitung tanpa LLM)
  cached: ShippingQuote | null;
  mayHaveChanged: boolean;
  tanyaUang: boolean;
  afirmasiUtuh: boolean;
  adaTunjukAtauReferensi: boolean;
  adaPendingPilihan: boolean;
  sebutProduk: boolean;
}

// ── (end State Machine types) ─────────────────────────────────────────────────

// ── Pembantu murni (diekspor supaya bisa diuji tanpa Nest/DB) ──────────────

/** Rule 11 — bulatkan ke kelipatan terdekat. inc <= 1 → tanpa pembulatan. */
export function roundTo(value: number, increment: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(increment) || increment <= 1) return Math.round(value);
  return Math.round(value / increment) * increment;
}

/**
 * >>> ANGGA — Fase 113 (2026-08-04): varian `roundTo` yang SELALU membulatkan
 * ke BAWAH. Dipakai KHUSUS untuk diskon ongkir, supaya nominalnya tidak
 * pernah melewati plafon yang dikonfigurasi Bossfren — 20% dari ongkir
 * Rp22.000 = Rp4.400; dibulatkan ke ATAS (atau ke TERDEKAT) jadi Rp4.500,
 * sudah melebihi 20%. `roundTo()` TIDAK bisa dipakai ulang di sini: ia
 * membulatkan ke TERDEKAT dan dipakai di tempat lain untuk Rule 11 (harga
 * akhir) — mengubah perilakunya akan merusak pembulatan itu.
 */
export function floorTo(value: number, increment: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(increment) || increment <= 1) return Math.floor(value);
  return Math.floor(value / increment) * increment;
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

/**
 * >>> ANGGA — Langkah 3, DIPERBAIKI setelah dipakai ke tujuan sungguhan.
 *
 * Cara lama (§3 LAMPIRAN): kelompokkan SEMUA hasil per provinsi+kota lalu hitung
 * kelompoknya — 1 auto, 2-3 tanya, >3 minta provinsi.
 *
 * Terbukti salah di lapangan (diuji live 2026-08-03): pencarian Mengantar
 * mencocokkan sampai level kelurahan, jadi "Surabaya" balik 10 kelompok dan
 * "Bandung" 25 — sembilan puluh persennya cuma desa senama di kabupaten lain.
 * Akibatnya kota-kota TERBESAR justru selalu jatuh ke "minta provinsi" dan
 * modul ini nyaris tidak pernah mengeluarkan angka.
 *
 * Perbaikannya memakai field yang memang sudah disediakan API, bukan heuristik
 * karangan: cocokkan kata kunci ke SATU level yang tepat, dengan urutan
 * CITY_NAME → DISTRICT_NAME → SUBDISTRICT_NAME, lalu hitung kota unik di level
 * itu saja. Sepuluh kelompok "Surabaya" langsung runtuh jadi satu.
 *
 * Kecocokan harus PERSIS, bukan "mengandung": "Solo" mengandung-cocok ke
 * "SOLOK" (Sumatera Barat) dan akan membuat bot menyebut angka yang salah
 * dengan percaya diri.
 */
export type DestinationLevel = 'city' | 'district' | 'subdistrict';

export interface DestinationCandidate {
  city: string;
  province: string;
  /** CITY_NAME_SI dari Mengantar, mis. "Kota Bogor" / "Kab. Bogor". */
  cityLabel: string;
  /** Level kecocokan TERBAIK yang dimiliki kota ini. */
  level: DestinationLevel;
  /** Berapa baris hasil yang menunjuk ke kota ini. */
  rows: number;
  ids: string[];
}

const LEVEL_RANK: Record<DestinationLevel, number> = { city: 0, district: 1, subdistrict: 2 };

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Level kecocokan terbaik satu baris terhadap kata kunci, atau null.
 *
 * Level `district` menerima DUA bentuk: nama kecamatan yang sama persis, ATAU
 * kata kunci sebagai KATA AWAL yang utuh ("Purwokerto" → "PURWOKERTO BARAT").
 * Banyak kota yang orang sebut sehari-hari — Purwokerto, Cikarang, Serpong,
 * Ciputat — di data Mengantar bukan CITY_NAME, melainkan pecahan kecamatan.
 *
 * Wajib KATA UTUH, bukan awalan huruf: "Solo" bukan awal kata dari "SOLOKURO"
 * (itu satu kata sendiri). Tanpa syarat ini, "Solo" terkunci ke Lamongan.
 */
export function levelKecocokan(r: MengantarAddress, keyword: string): DestinationLevel | null {
  const k = norm(keyword);
  if (!k) return null;
  if (norm(r?.CITY_NAME) === k) return 'city';
  const distrik = norm(r?.DISTRICT_NAME);
  if (distrik === k || distrik.startsWith(`${k} `)) return 'district';
  if (norm(r?.SUBDISTRICT_NAME) === k) return 'subdistrict';
  return null;
}

/**
 * >>> ANGGA — Langkah 3, rancangan Bossfren (2026-08-03).
 *
 * Kumpulkan SEMUA kota yang punya kecocokan, urutkan dari yang paling
 * meyakinkan, lalu biarkan pemanggilnya memutuskan: pakai langsung, atau
 * tanyakan dua teratas.
 *
 * MENGGANTIKAN (bukan menumpuk) rancangan saya sebelumnya yang memakai ambang
 * jumlah kelompok — 1 auto / 2-3 tanya / >3 minta provinsi. Ambang itu dibuang
 * seluruhnya: "Purwokerto" punya 6 kandidat dan dulu langsung dilempar ke
 * pertanyaan terbuka, padahal Kab. Banyumas menang telak 27 baris lawan 2.
 *
 * Urutannya: level kecocokan dulu (kota > kecamatan > kelurahan), baru jumlah
 * baris. Jumlah baris SENGAJA bukan penentu utama — ia cuma menghitung berapa
 * desa yang kebetulan senama, bukan mana yang orang maksud. Buktinya
 * "Jatinegara" menang di Kab. Tegal (17 baris) atas Kota Jakarta Timur (9).
 */
export function resolveDestination(
  rows: MengantarAddress[],
  keyword: string,
): DestinationCandidate[] {
  const byCity = new Map<string, DestinationCandidate>();
  for (const r of rows ?? []) {
    const level = levelKecocokan(r, keyword);
    if (!level || !r?._id) continue;
    // CITY_NAME_SI WAJIB ikut kunci: "Kota Bogor" dan "Kab. Bogor" punya
    // PROVINCE_NAME dan CITY_NAME yang sama persis — tanpa ini keduanya
    // menyatu jadi satu kandidat dan bot berhenti bertanya padahal harus.
    const key = `${r.PROVINCE_NAME}|${r.CITY_NAME}|${r.CITY_NAME_SI ?? ''}`.toLowerCase();
    const found = byCity.get(key);
    if (found) {
      found.ids.push(r._id);
      found.rows++;
      if (LEVEL_RANK[level] < LEVEL_RANK[found.level]) found.level = level;
    } else {
      byCity.set(key, {
        city: (r.CITY_NAME ?? '').trim(),
        province: (r.PROVINCE_NAME ?? '').trim(),
        cityLabel: (r.CITY_NAME_SI ?? '').trim() || (r.CITY_NAME ?? '').trim(),
        level,
        rows: 1,
        ids: [r._id],
      });
    }
  }
  return Array.from(byCity.values()).sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.rows - a.rows,
  );
}

/** >>> ANGGA — TIDAK DIPAKAI sejak ketok 2026-08-05 (lihat kandidatDominan).
 *  Disimpan sebagai catatan sejarah parameter rancangan 2026-08-03. <<< */
// >>> ANGGA — AUDIT TUMPANG-TINDIH (2026-08-05): `DOMINANCE_RATIO = 3` DIHAPUS
// — sisa mati rancangan dominansi 2026-08-03 yang sudah DIBATALKAN ketok P0;
// tidak direferensikan satu baris pun di kode/tes (diverifikasi grep). <<<

/**
 * Bolehkah kandidat teratas dipakai langsung tanpa bertanya?
 *
 * >>> ANGGA — KETOK BOSSFREN 2026-08-05, MEMBATALKAN rancangan dominansi
 * 2026-08-03 (level lebih tinggi / 3x lipat baris → auto-pakai): insiden nyata
 * "mataram" — Kota Mataram NTB TENGGELAM total di potongan 50 baris search,
 * "MATARAM BARU" (Lampung Timur, level kecamatan via aturan kata-awalan)
 * menang "sah" → ongkir kota yang SALAH dikutip percaya diri. Satu-satunya
 * jalur yang bisa meloloskan angka salah melewati semua gerbang, karena
 * angkanya "benar" untuk kota yang keliru.
 *
 * Kebijakan baru: auto HANYA kalau (a) kandidatnya TUNGGAL, atau (b) ada
 * TEPAT SATU kecocokan PERSIS level-kota (kata pelanggan memang nama resmi
 * satu kota/kab dan sistem MENEMUKANNYA — bukan tebakan ranking; tanpa
 * pengecualian ini "medan" ikut ditanya gara-gara kecamatan MEDAN SATRIA di
 * Bekasi). Selain itu → SELALU bertanya (terbuka & jujur, format ketok:
 * "X-nya mana ya kak? boleh sebut provinsinya, atau langsung kecamatannya").
 * Harga sadarnya: Purwokerto-class (27 lawan 2, level kecamatan) kini
 * ditanya sekali — akurasi uang > satu balasan ekstra.
 */
export function kandidatDominan(urut: DestinationCandidate[]): boolean {
  if (urut.length <= 1) return urut.length === 1;
  // `urut` terurut level dulu — kecocokan level-kota selalu di depan.
  const kotaPersis = urut.filter((c) => c.level === 'city');
  return kotaPersis.length === 1;
}
// <<< ANGGA

/**
 * Pilih pembeda yang BENAR-BENAR memisahkan kandidat, otomatis. Kalau
 * kandidatnya beda provinsi, provinsi yang dipakai; kalau seprovinsi (kasus
 * paling sering — "Kota Bogor" vs "Kab. Bogor"), pakai nama resmi Mengantar.
 * Diuji live: kandidat "bogor" dan "cibinong" dua-duanya di Jawa Barat, jadi
 * bertanya pakai provinsi di situ tidak menolong sama sekali.
 */
export function labelKandidat(c: DestinationCandidate, semua: DestinationCandidate[]): string {
  const bedaProvinsi = new Set(semua.map((x) => x.province.toLowerCase())).size > 1;
  return bedaProvinsi ? `${c.cityLabel}, ${c.province}` : c.cityLabel;
}

/**
 * Berapa banyak pilihan yang DIBACAKAN ke pelanggan saat bertanya.
 *
 * Rancangan Bossfren: "tinggal konfirm aja 2 lokasi teratas". Dua itu batas
 * pertanyaan yang masih enak dijawab lewat WhatsApp; sisanya tetap disimpan
 * (lihat `setPending`) supaya pelanggan yang menyebut kandidat ketiga tetap
 * langsung ketemu. Parameter teknis, bukan angka bisnis §6.
 */
export const MAX_CHOICES_ASKED = 2;

/** Pisah jadi kata; "Kab." → "kab", "Kabupaten" → "kab" supaya dua ejaan yang
 *  sama-sama umum di WhatsApp tidak dianggap beda. */
function kata(teks: string): string[] {
  return norm(teks)
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === 'kabupaten' ? 'kab' : w));
}

// >>> ANGGA — koreksi 2026-08-06 (audit lanjutan #2, temuan Bossfren): kata
// generik administratif/arah-mata-angin/nama-provinsi SERING nempel di label
// kandidat tujuan (mis. "Kab. Banyumas, JAWA TENGAH") tapi bukan pembeda
// lokasi sama sekali. Kalau kata seumum ini ikut disimpan sebagai kunci
// recall tujuan (`rememberDestinationTerm`), ia bisa nyantol ke obrolan LAIN
// yang kebetulan menyebutnya lalu diam-diam memakai tujuan LAMA yang salah —
// bukan cuma nanya ulang, bisa nyodorin ongkir yang KELIRU tanpa ketahuan,
// lebih parah dari bug "tanya ulang" yang sedang diperbaiki di sini. Dipakai
// HANYA untuk menyaring kunci recall (bukan untuk menyaring kata pencarian
// alamat — pelanggan yang menjawab pakai nama provinsi saja, mis. tangga
// SHIPPING_GROUNDING_ASK_PROVINCE, tetap harus bisa dicari).
const STOPWORDS_LOKASI_GENERIK = new Set([
  'kota', 'kabupaten', 'kab', 'provinsi', 'daerah', 'kecamatan', 'kelurahan', 'desa',
  'istimewa', 'khusus', 'ibukota', 'kepulauan',
  'jawa', 'barat', 'tengah', 'timur', 'utara', 'selatan',
  'nusa', 'tenggara', 'sumatera', 'sumatra', 'kalimantan', 'sulawesi', 'papua', 'maluku', 'bali',
]);

/**
 * >>> ANGGA — tangga 1 balik arah: memetakan JAWABAN pelanggan ke salah satu
 * pilihan yang tadi ditawarkan, tanpa mencari ulang ke Mengantar.
 *
 * Ini yang membuat pertanyaan tertutup benar-benar tertutup. Tanpa ini,
 * jawaban "Kota Bogor" malah membuat keadaan lebih buruk: pencarian Mengantar
 * mencocokkan CITY_NAME PERSIS dan nilainya "BOGOR", jadi "kota bogor" tidak
 * cocok apa pun dan bot bertanya lagi — persis pengalaman yang bikin jengkel.
 *
 * Cara memilihnya sengaja konservatif: hanya kata yang MEMBEDAKAN antar pilihan
 * yang dihitung (kata yang muncul di semua label — biasanya nama kotanya
 * sendiri — diabaikan), dan kalau skornya seri hasilnya null. Seri berarti
 * pelanggan belum benar-benar memilih; menebak di situ persis kesalahan yang
 * mau dihindari.
 */
export function pilihKandidat(
  pilihan: DestinationChoice[],
  teks: string,
): DestinationChoice | null {
  const cocok = kandidatCocok(pilihan, teks);
  return cocok.length === 1 ? cocok[0] : null;
}

/**
 * >>> ANGGA — P0 (2026-08-05): SEMUA kandidat berskor tertinggi (>0) untuk
 * jawaban pelanggan. Dipakai `pilihKandidat` (tunggal → pilih) DAN jalur
 * penyempitan: jawaban "yang lampung kak" mengenai 2 kandidat Lampung →
 * subset itu dibacakan sebagai pertanyaan TERTUTUP, bukan diabaikan.
 */
// >>> ANGGA — fix (2026-08-06, REPLAY LIVE laporan Bossfren "Purwokerto
// Timur itu di kabupaten mana? Kab. Lamongan / Kab. Kediri" — Banyumas yang
// BENAR hilang total dari daftar): akar sebab BUKAN di mekanisme pencarian
// (`resolveDestination`/jendela panjang kata, sudah dibuktikan benar via
// widget debug Bossfren SENDIRI hari ini) — tapi di fungsi INI, yang
// menyempitkan `pendingTujuan` (daftar kandidat TERSIMPAN dari pencarian
// sebelumnya) memakai jawaban pelanggan TANPA pernah mencari ulang ke API.
// Sebelumnya kata jawaban dicocokkan ke `kata(p.label)` UTUH — label
// formatnya "<cityLabel>, <PROVINSI>" saat kandidat berbeda provinsi (mis.
// "Kab. Banyumas, JAWA TENGAH"; lihat `labelKandidat`), jadi kata PROVINSI
// ikut jadi bahan cocok. Jawaban "Purwokerto Timur" (nama KECAMATAN — level
// yang TIDAK PERNAH muncul di city/province mana pun) kebetulan kata
// "timur"-nya nempel ke provinsi "JAWA TIMUR" milik Lamongan/Kediri —
// kandidat yang SAMA SEKALI TIDAK RELEVAN — sedangkan Banyumas (JAWA
// TENGAH, jawaban yang BENAR) skornya 0.
//
// DUA percobaan fix pertama (didokumentasikan lengkap di riwayat commit,
// dibuang di sini biar komentar tidak menumpuk) sama-sama ketahuan
// kebablasan lewat test suite `shipping.service.spec.ts` /
// `shipping.order-context.spec.ts` SEBELUM sampai ke Bossfren:
//   1. Cocokkan HANYA ke `kata(p.city)` (buang label sepenuhnya) — pecah di
//      kasus "Kota Bogor" vs "Kab. Bogor": `city` keduanya PERSIS SAMA
//      ("BOGOR"), satu-satunya kata pembeda ("kota" vs "kab") cuma ada di
//      AWALAN label, bukan di `city`.
//   2. Buang kata yang muncul di `province` milik kandidat itu SENDIRI —
//      pecah di kasus REPLAY "mataram": jawaban EKSPLISIT "yang lampung
//      kak"/"yang lampung timur kak" HARUS mempersempit ke kandidat
//      Lampung Timur/Lampung Tengah — itu penyempitan PROVINSI/nama-kota
//      yang justru DIINGINKAN, beda dari kasus Purwokerto yang kata
//      "timur"-nya nempel ke provinsi kandidat LAIN yang tidak relevan.
//
// Fix final: bukan cocok-kata bebas ke SELURUH label, tapi cocok-kata ke
// `cityLabel`-nya SAJA — yaitu `label` dengan akhiran ", <PROVINSI>" yang
// ditempel `labelKandidat` (hanya muncul kalau kandidat-kandidat beda
// provinsi) DIBUANG dulu secara STRUKTURAL sebelum dipecah jadi kata. Ini
// benar untuk ketiga kasus sekaligus:
//   - "Kota Bogor" / "Kab. Bogor" → tidak ada akhiran provinsi (satu
//     provinsi saja), utuh tak berubah → "kota"/"kab" tetap kata pembeda.
//   - "Kab. Lampung Timur, LAMPUNG" → akhiran ", LAMPUNG" dibuang → sisa
//     "Kab. Lampung Timur", kata "lampung"/"timur" TETAP ada karena
//     keduanya bagian dari NAMA KABUPATEN itu sendiri, bukan cuma provinsi.
//   - "Kab. Banyumas, JAWA TENGAH" / "Kab. Lamongan, JAWA TIMUR" → akhiran
//     ", JAWA TENGAH"/", JAWA TIMUR" dibuang → sisa "Kab. Banyumas"/"Kab.
//     Lamongan", kata "jawa"/"tengah"/"timur" TIDAK LAGI ikut jadi bahan
//     cocok karena bagian itu MURNI nama provinsi yang ditempel di akhir,
//     bukan bagian dari cityLabel aslinya.
//
// Penyempitan lewat PROVINSI yang TIDAK muncul di cityLabel kandidat mana
// pun (mis. "yang NTB kak" ketika semua kandidat justru di provinsi lain)
// tetap didukung sistem lewat jalur LAIN yang lebih aman
// (`normalisasiProvinsi` di `quote()`/jendela panjang kata — pencarian
// ULANG ke API, bukan cocok-kata statis terhadap daftar tersimpan) — kalau
// fungsi ini balik [] (tidak ada kata yang cocok sama sekali), alur
// otomatis jatuh ke mekanisme pencarian literal (`jawabanPolosTujuan`)
// yang sudah terbukti benar untuk skenario Purwokerto Timur. <<<

/** Buang akhiran ", <PROVINSI>" yang ditempel `labelKandidat` (kalau ada),
 *  supaya kata pencocokan kandidat cuma memakai `cityLabel` murni — nama
 *  kota/kabupaten + awalan administratifnya, TANPA nama provinsi. */
function cityLabelSaja(p: DestinationChoice): string {
  const akhiran = `, ${p.province}`;
  return p.label.toLowerCase().endsWith(akhiran.toLowerCase())
    ? p.label.slice(0, p.label.length - akhiran.length)
    : p.label;
}

export function kandidatCocok(
  pilihan: DestinationChoice[],
  teks: string,
): DestinationChoice[] {
  if (!pilihan.length) return [];
  const jawaban = new Set(kata(teks));
  if (!jawaban.size) return [];

  const perKandidat = pilihan.map((p) => new Set(kata(cityLabelSaja(p))));
  const frekuensi = new Map<string, number>();
  for (const set of perKandidat) {
    for (const w of set) frekuensi.set(w, (frekuensi.get(w) ?? 0) + 1);
  }

  const skor = perKandidat.map(
    (set) =>
      [...set].filter((w) => (frekuensi.get(w) ?? 0) < pilihan.length && jawaban.has(w)).length,
  );
  const tertinggi = Math.max(...skor);
  if (tertinggi === 0) return [];
  return pilihan.filter((_, i) => skor[i] === tertinggi);
}
// <<< ANGGA

/**
 * >>> ANGGA — LAPISAN KOSAKATA, dijalankan sebelum Langkah 3.
 *
 * Sengaja BUKAN bagian dari resolusi alamat: ia tidak melihat baris hasil, tidak
 * memilih kandidat, dan tidak punya ambang apa pun. Tugasnya satu — menukar
 * nama panggilan dengan nama yang dikenal Mengantar, lalu menyerahkan sisanya
 * ke `resolveDestination` yang sama persis seperti sebelumnya.
 *
 * Kenapa perlu (semua dibuktikan live 2026-08-03):
 *   solo/jogja/tangsel/sby/smg/bdg/jaksel → NOL baris hasil, bot terpaksa
 *     bertanya kecamatan untuk kota sebesar Solo.
 *   malang → 50 baris habis oleh "SAMALANGA", "GUNUNGMALANG", "MALANG NENGAH";
 *     Kota Malang tidak pernah muncul sama sekali.
 *   makasar (satu 's') → cocok PERSIS ke kecamatan MAKASAR, Jakarta Timur.
 *     Ini yang paling berbahaya: bukan gagal, tapi berhasil ke kota yang SALAH.
 *
 * Pencocokan sengaja SELURUH kata kunci, bukan per kata: "solo" ditukar,
 * "solo baru" tidak. Menukar sebagian kata akan merusak nama majemuk yang sah.
 */
/** >>> ANGGA — P4 (2026-08-05): singkatan provinsi sehari-hari → nama resmi
 *  (huruf kecil), untuk saringan provinsi. Data statis, bukan angka bisnis. */
export const PROVINSI_ALIAS: Record<string, string> = {
  ntb: 'nusa tenggara barat',
  ntt: 'nusa tenggara timur',
  jabar: 'jawa barat',
  jateng: 'jawa tengah',
  jatim: 'jawa timur',
  sumut: 'sumatera utara',
  sumsel: 'sumatera selatan',
  sumbar: 'sumatera barat',
  kalbar: 'kalimantan barat',
  kaltim: 'kalimantan timur',
  kalsel: 'kalimantan selatan',
  kalteng: 'kalimantan tengah',
  kaltara: 'kalimantan utara',
  sulsel: 'sulawesi selatan',
  sulut: 'sulawesi utara',
  sulteng: 'sulawesi tengah',
  sultra: 'sulawesi tenggara',
  babel: 'kepulauan bangka belitung',
  kepri: 'kepulauan riau',
  diy: 'yogyakarta',
  jogja: 'yogyakarta',
};

export function normalisasiProvinsi(v: string): string {
  const k = (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return PROVINSI_ALIAS[k] ?? k;
}
// <<< ANGGA

export function terapkanAlias(keyword: string, aliases: Record<string, string>): string {
  const asli = (keyword ?? '').trim();
  const kunci = asli.toLowerCase().replace(/\s+/g, ' ');
  const ganti = aliases?.[kunci];
  return ganti && ganti.trim() ? ganti.trim() : asli;
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
    // >>> ANGGA — Order Context Log: opsional supaya seluruh spec lama yang
    // membangun service ini dengan 5 argumen tetap jalan tanpa diubah (pola
    // yang sama dengan `shipping` di PromptBuilderService). Tanpa service ini,
    // seluruh perilaku log/carry-over mati dan alur lama berjalan apa adanya.
    @Optional() private readonly orderLog?: OrderContextService,
    // >>> ANGGA — addendum v2 P2: notifikasi instan saat nego mentok plafon
    // (pola notifikasi gerbang uang). Optional supaya spec lama tetap jalan.
    @Optional() private readonly notifications?: NotificationsService,
    // <<< ANGGA
  ) {}

  // >>> ANGGA — Order Context Log, "satu giliran satu kebenaran" (v1.1
  // §12.1-1): grounding terpanggil >1x per giliran (prompt-builder saat
  // menulis draft, lalu Sentinel saat review) dan ekstraksi LLM tidak dijamin
  // identik antar panggilan — tanpa memo ini, kutipan bisa BERUBAH di tengah
  // giliran (katalog penanda yang dilihat model ≠ nilai yang disubstitusi
  // gerbang). Kunci memo = id + isi pesan customer terakhir; percakapan yang
  // sama selalu menimpa entrinya sendiri (satu entri per percakapan).
  private readonly turnMemo = new Map<string, {
    key: string;
    lastText: string;
    result: ShippingResult;
    /** >>> ANGGA — Q-Chain fix (2026-08-05, insiden "banyumas kak"): true =
     *  giliran ini ME-RESOLVE pilihan (tujuan/barang/keranjang) — teksnya
     *  polos tanpa kata uang, tapi ia bagian alur ongkir; penjaga funnel &
     *  anti-kontradiksi WAJIB tetap menyala. <<< */
    viaPilihan?: boolean;
  }>();
  // <<< ANGGA

  /** >>> ANGGA: true selama TIDAK ada produk aktif yang beratnya melebihi berat
   *  default toko. Selama itu benar, "ongkir 1 pcs" berlaku untuk seluruh
   *  katalog dan boleh disebut sebagai angka pasti. Begitu ada satu produk yang
   *  lebih berat, kalimatnya otomatis berubah jadi "mulai dari" — tanpa perlu
   *  diurus manual. */
  private beratSeragam = true;

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
    const empty: ShippingOrderExtract = { city: null, province: null, items: [] };
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        bot: { select: { language: true } },
        messages: {
          // >>> ANGGA — Order Context Log T1 (blueprint 2026-08-04): draft
          // yang TIDAK PERNAH terkirim (pending = belum di-approve, failed =
          // tersalip/ditolak) bukan bagian dari percakapan yang dilihat
          // pelanggan — tapi tersimpan sebagai baris Message biasa. Tanpa
          // saringan ini, draft tertahan gerbang uang yang masih memuat
          // `{{token}}` literal ikut terkirim ulang ke LLM ekstraksi sebagai
          // "ucapan bot" (loop pencemaran diri, temuan audit 2026-08-04).
          // Pesan customer SELALU ikut apa pun statusnya.
          where: {
            OR: [
              { senderType: SenderType.customer },
              { status: { in: [MessageStatus.sent, MessageStatus.delivered, MessageStatus.read] } },
            ],
          },
          // <<< ANGGA
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

    // >>> ANGGA — Order Context Log T3 (blueprint 2026-08-04): anchor "order
    // aktif" dari log ter-persist. Tugas model berubah dari "rekonstruksi dari
    // nol" jadi "apa yang berubah dari INI" — kelas tugas yang jauh lebih
    // mudah untuk LLM kecil. TANPA angka uang (hanya nama barang, qty, kota).
    // Kalimat anti-over-carry ada di prompt-nya (v1.1 §12.2-8).
    const anchorEntry = await this.orderLog?.latestFresh(conversationId);
    const anchorMsg = anchorEntry
      ? [{
          role: 'system' as const,
          content: t(SHIPPING_EXTRACT_ANCHOR, lang)(
            `${anchorEntry.snapshot.items.map((i) => `${i.qty} pcs ${i.name}`).join(', ')}` +
              (anchorEntry.snapshot.city ? ` → ${anchorEntry.snapshot.city}` : ''),
          ),
        }]
      : [];
    // <<< ANGGA

    let raw: string;
    try {
      raw = await this.provider.chat(
        [
          { role: 'system', content: t(SHIPPING_EXTRACT_SYSTEM, lang) },
          ...anchorMsg, // >>> ANGGA — Order Context Log T3 <<<
          ...history,
          { role: 'user', content: t(SHIPPING_EXTRACT_USER, lang) },
        ],
        { temperature: 0, json: true, maxTokens: 300 },
      );
    } catch (err) {
      this.logger.warn(`Deteksi tujuan/item gagal: ${err}`);
      return { ...empty, failed: true }; // >>> ANGGA — audit total: gagal ≠ kosong <<<
    }
    return parseExtract(raw);
  }

  // ── Langkah 1-9 — alur utama ─────────────────────────────────────────────

  /**
   * Fase 2 — Classifier: membaca sinyal deterministik (tanpa LLM) dan
   * mengembalikan satu QuoteTurnState. Tidak ada side-effect: tidak
   * menulis cache, tidak memanggil extractOrderTarget.
   *
   * Urutan prioritas state (descending):
   *  ITEM_CHOICE > DEIXIS > CACHE_HIT > LOG_HIT > DESTINATION > EXTRACT
   *
   * extractOrderTarget dipanggil LAZY (di handler masing-masing) karena
   * CACHE_HIT / LOG_HIT / ITEM_CHOICE / DEIXIS tidak butuh LLM.
   */
  private async classifyTurn(
    conversationId: string,
    lastCustomerText: string,
    cached: ShippingQuote | null,
    oc: OrderContextSettings,
  ): Promise<QuoteTurnContext> {
    const mayHaveChanged =
      PLACE_HINT.test(lastCustomerText) || ORDER_CHANGE_HINT.test(lastCustomerText);
    const tanyaUang =
      adaKataTanyaUang(lastCustomerText, oc.orderMoneyAskKeywords) ||
      hasAggregateKeyword(lastCustomerText, oc.orderAggregateKeywords);
    const afirmasiUtuh = wholeMessageMatch(
      lastCustomerText,
      oc.orderAffirmationKeywords,
      oc.orderFillerWords,
      oc.orderNegationKeywords,
    );
    const adaTunjukAtauReferensi =
      hasAggregateKeyword(lastCustomerText, oc.orderDeixisKeywords) ||
      hasAggregateKeyword(lastCustomerText, oc.orderReferenceKeywords);
    const adaPendingPilihan = !!this.cache.pendingItems(conversationId);

    // sebutProduk hanya relevan kalau ada peluang cache/log-hit
    let sebutProduk = false;
    if (!mayHaveChanged && tanyaUang && (cached || (this.orderLog && !adaPendingPilihan))) {
      const produkAktif = await this.prisma.product.findMany({ where: { status: 'active' }, take: 500 });
      sebutProduk = mentionsCatalogProduct(lastCustomerText, produkAktif);
    }

    // ── Prioritas state ───────────────────────────────────────────────────
    let state: QuoteTurnState;

    if (!mayHaveChanged && adaPendingPilihan) {
      // Pelanggan sedang menjawab pertanyaan pilihan barang
      state = 'ITEM_CHOICE';
    } else if (!mayHaveChanged && !adaPendingPilihan && adaTunjukAtauReferensi && this.orderLog) {
      // Frasa tunjuk tanpa pending → resolve dari offer registry
      state = 'DEIXIS';
    } else if (!mayHaveChanged && cached && !sebutProduk && patchQty(lastCustomerText) == null) {
      // Cache valid, tidak ada perubahan, tidak sebut produk baru, tidak ganti qty
      state = 'CACHE_HIT';
    } else if (
      !mayHaveChanged && this.orderLog && !sebutProduk && !adaTunjukAtauReferensi &&
      !adaPendingPilihan && (tanyaUang || afirmasiUtuh)
    ) {
      // Tidak ada cache tapi ada log segar + pertanyaan uang → log-hit
      state = 'LOG_HIT';
    } else {
      // Semua kondisi deterministik tidak terpenuhi → ekstraksi penuh
      // (jawabanPolosTujuan akan dievaluasi di dalam EXTRACT / handleDestination)
      state = 'EXTRACT';
    }

    return {
      conversationId,
      lastCustomerText,
      state,
      cached,
      mayHaveChanged,
      tanyaUang,
      afirmasiUtuh,
      adaTunjukAtauReferensi,
      adaPendingPilihan,
      sebutProduk,
    };
  }

  /**
   * Alur utama pengutipan ongkir per percakapan. Terbagi 4+1 tema:
   *
   * TEMA A — Cache & Log-hit (tanpa LLM): jawab dari cache in-memory atau
   *   snapshot log ter-persist; early-return jika kondisi aman.
   *
   * TEMA B — Pilihan barang & Frasa Tunjuk: resolve jawaban Q-Chain (pending
   *   item choice) dan frasa tunjuk (offer registry); tanpa ekstraksi ulang.
   *
   * TEMA C — Carry-over barang: saat ekstraksi kosong + ada log segar, barang
   *   diseret dari log (jalur ASUMSI, wajib bridge-validasi).
   *
   * TEMA D — finalize() terpusat: satu-satunya titik menyentuh cache write,
   *   log snapshot, tangga pertanyaan, dan outcome counter.
   *
   * TEMA E — Resolusi tujuan literal (→ resolveDestinationFromText()):
   *   jawabanPolosTujuan + cascade jendela kata + loop kata satu-satu.
   *   Diekstrak Fase 1 (2026-08-07) karena inilah akar 7 insiden produksi.
   */
  async quoteForConversation(conversationId: string): Promise<ShippingResult> {
    const cfg = await this.settings.shipping();
    // >>> ANGGA — addendum v2 M5: kebijakan memori order kini kategori sendiri.
    const oc = await this.settings.orderContext();
    // <<< ANGGA
    if (!cfg.mengantarApiKey || !cfg.mengantarOriginId) {
      this.cache.recordOutcome(conversationId, 'not_configured');
      return { status: 'not_configured' };
    }

    const lastMsg = await this.lastCustomerMessage(conversationId);
    const lastCustomerText = lastMsg.content;

    // >>> ANGGA — Order Context Log, "satu giliran satu kebenaran" (v1.1
    // §12.1-1): panggilan kedua+ untuk PESAN CUSTOMER YANG SAMA (prompt-builder
    // lalu Sentinel di giliran yang sama) memakai hasil yang sudah diputuskan,
    // bukan menghitung ulang — ekstraksi LLM tidak dijamin identik antar
    // panggilan, dan kutipan tidak boleh berubah di tengah giliran. Kunci
    // memo ikut ISI pesan (bukan cuma id) supaya perubahan teks selalu
    // menghitung ulang. TTL menumpang OUTCOME_MEMO_MS: memo ini soal SATU
    // giliran (detik), bukan penyimpanan.
    const memoKey = `${lastMsg.id}:${lastCustomerText}`;
    const memo = this.turnMemo.get(conversationId);
    if (memo && memo.key === memoKey) return memo.result;
    // >>> ANGGA — Q-Chain fix (insiden "banyumas kak"): flag giliran-pilihan.
    let turnViaPilihan = false;
    // <<< ANGGA
    const finish = (result: ShippingResult): ShippingResult => {
      this.turnMemo.set(conversationId, { key: memoKey, lastText: lastCustomerText, result, viaPilihan: turnViaPilihan });
      while (this.turnMemo.size > MAX_TURN_MEMO_ENTRIES) {
        const oldest = this.turnMemo.keys().next().value;
        if (oldest === undefined) break;
        this.turnMemo.delete(oldest);
      }
      return result;
    };
    // <<< ANGGA

    // >>> ANGGA — Order Context Log (v1.1 §12.1-5): pembatalan ORDER UTUH —
    // seluruh pesan hanya kata pembatalan + pengisi ("gak jadi deh kak") →
    // penanda `cancelled` + konteks direset. Pembatalan PARSIAL ("batal yang
    // golok aja") TIDAK cocok whole-message dan jatuh ke alur ekstraksi biasa
    // (menghasilkan snapshot baru berisi item sisa).
    if (this.orderLog && wholeMessageMatch(lastCustomerText, oc.orderCancelKeywords, oc.orderFillerWords)) {
      this.cache.reset(conversationId);
      this.cache.clearPending(conversationId);
      this.cache.clearPendingItems(conversationId);
      this.cache.clearAssumed(conversationId);
      this.cache.resetAsks(conversationId);
      await this.orderLog.recordMarker(conversationId, 'cancelled', 'cancel_keyword');
      this.cache.recordOutcome(conversationId, 'no_destination');
      return finish({ status: 'no_destination' });
    }
    // <<< ANGGA

    // ── TEMA A → Fase 2c: classifyTurn() dispatch ─────────────────────────────
    // Semua sinyal deterministik (cached, mayHaveChanged, tanyaUang, dll)
    // kini dihitung SATU KALI di classifyTurn() tanpa side-effect.
    const cached = this.cache.get(conversationId);
    const ctx = await this.classifyTurn(conversationId, lastCustomerText, cached, oc);
    // Destructure sinyal ke variable lokal supaya TEMA B/C/D tidak berubah
    const { tanyaUang, afirmasiUtuh, mayHaveChanged } = ctx;

    // Fast-path deterministik (tanpa LLM)
    if (ctx.state === 'CACHE_HIT') {
      return finish(this.handleCacheHit(ctx));
    }
    if (ctx.state === 'LOG_HIT') {
      const logResult = await this.handleLogHit(ctx, cfg, oc);
      if (logResult !== null) return finish(logResult);
      // null = tidak ada log segar → fall-through ke EXTRACT
    }
    // <<< ANGGA


    // ── TEMA B → Fase 2c: dispatch ke resolveItemChoice() & handleDeixis() ────
    // Langkah 2 — deteksi tujuan & item (TEMA C/D masih butuh hasil extract).
    // >>> ANGGA — koreksi 2026-08-04: jejak ekstraksi untuk tracing insiden.
    const extract = await this.extractOrderTarget(conversationId);
    this.logger.debug(
      `extractOrderTarget('${conversationId}'): kota=${JSON.stringify(extract.city)} provinsi=${JSON.stringify(extract.province)} items=${JSON.stringify(extract.items)}`,
    );

    // ITEM_CHOICE — Q-Chain: resolve jawaban pilihan produk dari pendingItems.
    // resolveItemChoice() hanya mengambil items+flags; finalize() yg handle destination.
    let itemsFromChoice: ExtractedItem[] | null = null;
    let choiceCity: string | null = null;
    let konklusiKeranjang = false;
    const choiceResolved = await this.resolveItemChoice(conversationId, lastCustomerText, oc);
    if (choiceResolved !== null) {
      itemsFromChoice = choiceResolved.itemsFromChoice;
      choiceCity = choiceResolved.choiceCity;
      if (choiceResolved.turnViaPilihan) turnViaPilihan = true;
      if (choiceResolved.konklusiKeranjang) konklusiKeranjang = true;
    }

    // DEIXIS — frasa tunjuk: handler mengelola offer registry lookup.
    // item_ambiguous → return early (pendingItems sudah di-set handler).
    // ok tunggal → set itemsFromDeixis supaya TEMA C lanjut normal.
    // >>> ANGGA — addendum v2 M1 + amendemen interseksi ("golok yg itu")
    let itemsFromDeixis: ExtractedItem[] | null = null;
    if (!itemsFromChoice && (ctx.state === 'DEIXIS' || ctx.adaTunjukAtauReferensi)) {
      const deixisResult = await this.handleDeixis(ctx, cfg, oc);
      if (deixisResult !== null) {
        if (deixisResult.result.status === 'item_ambiguous') {
          return finish(deixisResult.result);
        }
        // Single-match deixis: tambahkan sebagai itemsFromDeixis agar TEMA C bisa finalize
        if (deixisResult.result.status === 'ok' && deixisResult.result.quote?.items?.length) {
          itemsFromDeixis = deixisResult.result.quote.items.map((i) => ({ name: i.name, qty: i.qty }));
        }
      }
    }
    // <<< ANGGA


    // ── TEMA C: Carry-over barang dari log (T2) & Referensi order lama (M4) ──
    // Ekstraksi tidak membawa barang DAN tidak menyebut produk katalog?
    // Cari dari entri log segar (atau order selesai terakhir untuk referensi).
    // Semua jalur di sini ditandai ASUMSI untuk bridge-validasi.
    //
    // >>> ANGGA — Order Context Log T2 (menyimetrikan fallback baris `city`
    // di bawah — dulu kota jatuh ke konteks lama tapi BARANG tidak, akar
    // insiden "COD deh kak. beli 2 ya"): ekstraksi tidak membawa barang DAN
    // pesan tidak menyebut produk katalog apa pun (deteksi murah tanpa LLM)
    // DAN ada entri log segar → pakai barang dari log. Pola angka pendek
    // ("beli 2") mengubah qty DI KODE, bukan lewat LLM. Kata agregat
    // ("total semuanya") → gabungan SEMUA entri segar per identitas produk
    // (v1.1 §12.1-4, anti hitung-dobel). Dua-duanya ditandai ASUMSI untuk
    // enforcement bridge-validasi di `resolvePriceTokens`.
    let items = itemsFromChoice ?? itemsFromDeixis ?? extract.items;
    let source = itemsFromChoice ? 'confirmation' : itemsFromDeixis ? 'offer' : 'extractor';
    let carriedEntry: OrderContextEntry | null = null;
    let assumedNames: string[] | null = itemsFromDeixis ? itemsFromDeixis.map((i) => i.name) : null;

    let aggregate = false;
    // >>> ANGGA — F1 (lanjutan): carry-over juga jalur ASUMSI — gerbang yang
    // sama. Tanpa ini, "halo" yang lolos gerbang log-hit tetap kena rekap
    // lewat pintu belakang (ekstraksi kosong → barang diseret dari log).
    // Hint tempat/perubahan & frasa referensi ikut membuka gerbang: "COD deh
    // kak. beli 2 ya" (insiden asal T2) dan "sama yg tadi" (M4) tetap jalan.
    const bicaraOrder =
      tanyaUang ||
      afirmasiUtuh ||
      mayHaveChanged ||
      patchQty(lastCustomerText) != null || // >>> ANGGA — Q-Chain: jawaban qty polos ("2 deh") <<<
      hasAggregateKeyword(lastCustomerText, oc.orderReferenceKeywords);
    if (!items.length && this.orderLog && bicaraOrder) {
      // <<< ANGGA
      const products = await this.prisma.product.findMany({ where: { status: 'active' }, take: 500 });
      if (!mentionsCatalogProduct(lastCustomerText, products)) {
        // >>> ANGGA — addendum v2 M4: frasa referensi eksplisit ("sama yg
        // tadi") membuka jangkauan ke SATU order completed terakhir — input
        // dihitung ulang (bukan angkanya), wajib bridge, hasil konfirmasi
        // jadi snapshot baru (revisi order pasca-closing).
        const refAsk = hasAggregateKeyword(lastCustomerText, oc.orderReferenceKeywords);
        const aggAsk = hasAggregateKeyword(lastCustomerText, oc.orderAggregateKeywords);
        const cw = refAsk
          ? await this.orderLog.candidatesWithCompleted(conversationId)
          : { current: await this.orderLog.candidates(conversationId), lastCompleted: [] };
        const entries = cw.current.filter((e) => e.snapshot.items.length > 0);
        const freshEntries = entries.filter((e) => e.fresh);
        const refEntries = refAsk
          ? cw.lastCompleted.filter((e) => e.snapshot.items.length > 0)
          : [];
        if ((freshEntries.length || refEntries.length) && (aggAsk || (refAsk && freshEntries.length && refEntries.length))) {
          // Agregat / agregat+referensi → union per identitas produk.
          const merged = mergeSnapshots([...freshEntries, ...refEntries].map((e) => e.snapshot));
          items = merged.map((m) => ({ name: m.name, qty: m.qty }));
          carriedEntry = freshEntries[0] ?? refEntries[0];
          assumedNames = merged.map((m) => m.name);
          aggregate = true;
          source = 'carryover';
        } else if (freshEntries.length) {
          const latest = freshEntries[0];
          items = latest.snapshot.items.map((i) => ({ name: i.name, qty: i.qty }));
          const q = patchQty(lastCustomerText);
          if (q != null && items.length === 1) items = [{ ...items[0], qty: q }];
          carriedEntry = latest;
          assumedNames = items.map((i) => i.name);
          source = 'carryover';
        } else if (refAsk && refEntries.length) {
          // Referensi ke order completed terakhir tanpa order berjalan.
          const latest = refEntries[0];
          items = latest.snapshot.items.map((i) => ({ name: i.name, qty: i.qty }));
          const q = patchQty(lastCustomerText);
          if (q != null && items.length === 1) items = [{ ...items[0], qty: q }];
          carriedEntry = latest;
          assumedNames = items.map((i) => i.name);
          source = 'carryover';
        } else {
          // >>> ANGGA — addendum v2 M1/M3, fallback PENAWARAN: belum ada
          // kutipan sama sekali, tapi ada penawaran segar (mis. seed form) →
          // barang dari penawaran (satu produk unik), jalur ASUMSI + bridge.
          const offers = (await this.orderLog.recentOffers(conversationId)).filter((o) => o.fresh);
          const unik = new Map<string, { productId: string; name: string }>();
          for (const o of offers) for (const it of o.items) if (!unik.has(it.productId)) unik.set(it.productId, it);
          if (unik.size === 1) {
            const satu = Array.from(unik.values())[0];
            items = [{ name: satu.name, qty: patchQty(lastCustomerText) ?? 1 }];
            assumedNames = [satu.name];
            source = 'offer';
          }
          // <<< ANGGA
        }
      }
    }
    // >>> ANGGA — addendum v2 M4 (lanjutan): referensi eksplisit SAAT barang
    // baru juga disebut ("kalau 2 sama yg tadi") — union nama barang baru +
    // isi order completed terakhir, dedupe per nama. Deterministik.
    if (
      items.length &&
      this.orderLog &&
      hasAggregateKeyword(lastCustomerText, oc.orderReferenceKeywords)
    ) {
      const cw = await this.orderLog.candidatesWithCompleted(conversationId);
      const refLatest = cw.lastCompleted.find((e) => e.snapshot.items.length > 0);
      if (refLatest) {
        const ada = new Set(items.map((i) => i.name.toLowerCase().trim()));
        const tambahan = refLatest.snapshot.items
          .filter((i) => !ada.has(i.name.toLowerCase().trim()))
          .map((i) => ({ name: i.name, qty: i.qty }));
        if (tambahan.length) {
          items = [...items, ...tambahan];
          carriedEntry = carriedEntry ?? refLatest;
          assumedNames = items.map((i) => i.name);
          aggregate = true;
          source = 'carryover';
        }
      }
    }
    // <<< ANGGA
    if (assumedNames) this.cache.setAssumed(conversationId, assumedNames, aggregate);
    else this.cache.clearAssumed(conversationId);
    // <<< ANGGA

    // ── TEMA D: Pasca-proses terpusat (finalize) ─────────────────────────────
    // Satu-satunya tempat yang menyentuh cache, log snapshot, tangga pertanyaan,
    // dan outcome counter — semua jalur (cache-hit, log-hit, resolusi tujuan,
    // ekstraksi biasa) melewati sini agar perilaku after-quote konsisten.
    //
    // >>> ANGGA — pasca-proses terpusat: cache, snapshot log, tangga
    // pertanyaan, outcome — SATU tempat supaya semua jalur (jawaban pilihan
    // kota, jalur carry-over, jalur ekstraksi) diperlakukan identik.
    const finalize = async (result: ShippingResult): Promise<ShippingResult> => {
      // >>> ANGGA — UPGRADE ONGKIR-DOANG (2026-08-06, insiden "sandubaya 1 pcs"
      // — kutipan jatuh ongkir-doang PADAHAL barang dikenal, model lalu
      // mengarang "{{subtotal_barang}} (Harga+Ongkir)" dan tertahan gerbang):
      // apa pun jalur hulunya yang menjatuhkan barang, kutipan ongkir-doang
      // dengan TEPAT SATU produk dikenal (penawaran form/log segar) langsung
      // dihitung ulang jadi kutipan PENUH — alur total Bossfren (berat + COD
      // amount → estimate API → estimatedPrice+Date → harga barang + ongkir)
      // baru bisa jalan kalau barangnya ikut. Ambigu (>1 produk) TIDAK
      // di-upgrade — biar funnel/keranjang yang bertanya, jangan sok tau.
      // Pengecualian T4: pelanggan MENYEBUT barang baru yang tak cocok katalog
      // (unmatchedNames terisi) → JANGAN diam-diam balik ke barang lama —
      // biarkan alur konfirmasi T4/unmatched yang bertanya (anti sok-tau).
      if (result.status === 'ok' && result.quote.shippingOnly && !result.quote.unmatchedNames?.length && this.orderLog) {
        try {
          const unik = new Map<string, { name: string; qty: number }>();
          for (const o of (await this.orderLog.recentOffers(conversationId)).filter((x) => x.fresh)) {
            for (const it of o.items ?? []) if (it.productId) unik.set(it.productId, { name: it.name, qty: 1 });
          }
          for (const e of (await this.orderLog.candidates(conversationId)).filter((x) => x.fresh)) {
            for (const it of e.snapshot.items) unik.set(it.productId, { name: it.name, qty: it.qty });
          }
          if (unik.size === 1) {
            const satu = Array.from(unik.values())[0];
            const qtyU = patchQty(lastCustomerText) ?? satu.qty ?? 1;
            const hasil2 = await this.quoteUntukTujuan(
              { city: result.quote.city, province: result.quote.province, label: '', destinationId: result.quote.destinationId },
              [{ name: satu.name, qty: qtyU }],
            );
            if (hasil2.status === 'ok' && !hasil2.quote.shippingOnly) {
              this.logger.warn(
                `Upgrade ongkir-doang → kutipan penuh di ${conversationId}: barang "${satu.name}" x${qtyU} dikenal dari penawaran/log tapi hilang di jalur hulu (items ekstraksi giliran ini kosong/tak cocok) — periksa extractOrderTarget.`,
              );
              result = hasil2;
            }
          }
        } catch { /* upgrade gagal = pakai hasil apa adanya */ }
      }
      // <<< ANGGA
      if (result.status === 'ok') {
        this.cache.set(conversationId, result.quote, cfg.quoteCacheTtlMs);
        this.cache.resetAsks(conversationId);
        this.cache.clearPending(conversationId);
        // Snapshot = INPUT order tervalidasi katalog; ongkir-saja tidak
        // membawa barang, tidak ada yang layak diingat.
        if (!result.quote.shippingOnly) {
          // >>> ANGGA — Q-Chain (2026-08-05): qtyPasti = pelanggan menyebut
          // angka eksplisit di giliran ini, ATAU sudah pasti di snapshot yang
          // dibawa carry-over (basket sama). konklusi = jawaban pertanyaan
          // keranjang. Dua-duanya slot funnel.
          const qtyEksplisit =
            patchQty(lastCustomerText) != null ||
            /\b\d{1,3}\s*(pcs|pc|buah|biji|unit|set)\b/i.test(lastCustomerText);
          // <<< ANGGA
          await this.orderLog?.recordSnapshot(
            conversationId,
            lastMsg.id,
            {
              city: result.quote.city,
              province: result.quote.province,
              destinationId: result.quote.destinationId,
              // >>> ANGGA — Q-Chain
              qtyPasti: qtyEksplisit || carriedEntry?.snapshot.qtyPasti === true,
              ...(konklusiKeranjang ? { konklusi: true } : {}),
              // <<< ANGGA
              // Item tanpa productId (tidak seharusnya terjadi di jalur ini)
              // dibuang — identitas produk wajib untuk merge log (v1.1 §12.1-4).
              items: result.quote.matchedItems
                .filter((m): m is typeof m & { productId: string } => !!m.productId)
                .map((m) => ({
                  productId: m.productId,
                  sku: m.sku ?? null,
                  name: m.name,
                  qty: m.qty,
                })),
            },
            source,
          );
        }
        this.cache.recordOutcome(conversationId, 'ok');
        return finish(result);
      }
      if (result.status === 'item_ambiguous') {
        // Tangga BARANG: simpan pilihan, biarkan grounding menyuruh bertanya
        // tertutup. Penanda uang TIDAK tersedia untuk giliran ini.
        this.cache.setPendingItems(conversationId, {
          candidates: result.itemCandidates,
          qty: items.find((i) => i.name === result.keyword)?.qty ?? 1,
          city: extract.city?.trim() || choiceCity || carriedEntry?.snapshot.city || cached?.city || null,
        });
        this.cache.recordOutcome(conversationId, 'item_ambiguous');
        return finish(result);
      }
      if (result.status === 'ambiguous' || result.status === 'need_more_detail') {
        const ronde = this.cache.bumpAsk(conversationId, lastMsg.id);
        // SELURUH kandidat disimpan (bukan cuma dua yang dibacakan) supaya
        // "bukan kak, yang Pati" tetap ketemu tanpa panggilan API lagi.
        this.cache.setPending(
          conversationId,
          result.status === 'ambiguous' ? result.candidates : [],
        );
        this.cache.recordOutcome(
          conversationId,
          ronde > MAX_DESTINATION_ASKS ? 'destination_stuck' : result.status,
        );
        return finish(result);
      }
      // Tujuan akhirnya jelas (atau masalahnya bukan soal tujuan) → tangga direset.
      this.cache.resetAsks(conversationId);
      this.cache.clearPending(conversationId);
      this.cache.recordOutcome(conversationId, result.status);
      return finish(result);
    };
    // <<< ANGGA

    // >>> ANGGA — koreksi 2026-08-06 (audit lanjutan #4, permintaan Bossfren
    // "daripada bikin gerbang mending nyari literal, no drama, gak bikin
    // misleading"): gerbang LAMA yang tadinya ada di sini dicabut. Bentuknya
    // dulu: `pilihKandidat`/`kandidatCocok` dicocokkan ke `pendingTujuan` —
    // daftar kandidat TERSIMPAN dari giliran SEBELUMNYA — TANPA PERNAH
    // dicek ulang ke API di giliran BALASAN. Itu sumber akar masalah
    // "Purwokerto Timur" hari ini (lihat riwayat #39): daftar tersimpan bisa
    // memuat kandidat yang sebetulnya tidak relevan (lolos di ronde
    // pencarian sebelumnya gara-gara data 50-baris), dan cocok-kata
    // terhadapnya bisa nyasar.
    //
    // Ganti: giliran balasan SEKARANG SELALU turun ke pencarian API ulang di
    // bawah (`jawabanPolosTujuan`/`quote()`) — sumber kebenaran selalu segar,
    // tidak pernah pasrah ke daftar basi. Begitu hasil pencarian ULANG itu
    // masih ambigu (>1 kandidat), BARU `pilihKandidat`/`kandidatCocok`
    // dipakai lagi — tapi terhadap kandidat yang BARU SAJA dikembalikan API
    // giliran INI (lihat `sempitkanJawaban`, dipanggil di setiap titik
    // `ambiguous` di bawah), bukan terhadap sisa giliran sebelumnya. Fungsi
    // cocok-katanya tetap dipertahankan (perlu — bandingkan komentar
    // `sempitkanJawaban`, dicoba dulu literal search ke `CITY_NAME_SI` tapi
    // API Mengantar TERBUKTI live 2026-08-05 balik NOL baris untuk keyword
    // ber-prefiks "kota"/"kabupaten", jadi tidak bisa jadi PARAMETER
    // pencarian — cuma DIPINDAH supaya selalu memilih di antara data segar,
    // bukan menggantikan pencarian ulang.

    // >>> ANGGA — AUDIT TOTAL (2026-08-05, insiden "ongkir ke purwokerto?"
    // dijawab data MATARAM Rp50.000): kalau ekstraksi GAGAL (LLM error/JSON
    // rusak) pada giliran yang menyebut tempat/perubahan order, fallback
    // `cached?.city` di bawah akan DIAM-DIAM memakai kota LAMA → cache-hit →
    // seluruh penanda uang kota lama tersedia → model melabeli kota BARU
    // dengan angka kota lama, dan gerbang tak bisa menangkap (semua digit
    // hasil sisipan sah). Ekstraksi gagal ≠ pesan tanpa kota — giliran
    // ber-hint WAJIB jujur: status api_error (grounding UNKNOWN, nol angka,
    // "dicek dulu ke admin"), jangan menebak.
    if (extract.failed && mayHaveChanged) {
      this.logger.warn(
        `Ongkir gagal (extract_error) di ${conversationId}: pesan ber-hint tempat/order tapi deteksi tujuan GAGAL — kota lama TIDAK dipakai (anti salah-label).`,
      );
      // Kutipan lama ikut dikosongkan: tanpa ini model masih bisa menyisipkan
      // {{ongkir}} kota LAMA di giliran gagal ini dan lolos gerbang (digit
      // sisipan sah). Log ter-persist — giliran berikutnya recompute normal.
      this.cache.reset(conversationId);
      this.cache.recordOutcome(conversationId, 'api_error');
      return finish({ status: 'api_error' });
    }
    // <<< ANGGA
    // >>> ANGGA — JAWABAN KECAMATAN (2026-08-05, insiden "sandubaya kak" —
    // TERBUKTI DARI LOG): kita bertanya "boleh sebut kecamatannya", pelanggan
    // patuh menjawab "Sandubaya kak" — tapi ekstraktor memetakannya balik ke
    // kota=Mataram → search "mataram" lagi → saringan provinsi menolak semua →
    // need_more_detail SELAMANYA. Kata-kata JAWABAN pelanggan sendiri tidak
    // pernah dijadikan kata kunci pencarian. Fix: pada giliran setelah kita
    // bertanya tujuan (askCount > 0), coba search kata-kata jawaban (tanpa
    // kata pengisi/afirmasi/generik) SEBELUM jatuh ke kota hasil ekstraksi;
    // provinsi hasil ekstraksi tetap dipakai sebagai saringan (P4).
    // >>> ANGGA — koreksi 2026-08-06 (REPLAY LIVE lanjutan, laporan Bossfren
    // "purwokerto timur braderku" -> bot mengarang "Kab. Kebumen" sebagai
    // opsi kedua, PADAHAL widget debug Bossfren sendiri membuktikan search
    // API asli utk "purwokerto timur" cuma balik SATU kandidat, Kab.
    // Banyumas): syarat `askCount(conversationId) > 0` di atas membuat jalur
    // kata-jawaban-literal (+ jendela panjang kata) ini CUMA berlaku di
    // giliran BALASAN — giliran PERTAMA pelanggan menyebut tujuan sendiri
    // (belum pernah kita tanya) selalu jatuh ke `quote({ keyword: city })` di
    // bawah, yang search-nya 100% pasrah ke `extract.city` (hasil ekstraksi
    // LLM Langkah 2). Begitu ekstraktor menjatuhkan kata pembeda ("Timur")
    // atau salah normalisasi gara-gara honorifik asing ("braderku" dst — dan
    // TIDAK ADA daftar honorifik yang akan pernah lengkap, sudah terbukti 4x
    // hari ini: kakak/kakakku/boskuuu/braderku), keyword pencarian jadi lebih
    // lebar dari yang pelanggan maksud → API (BUKAN model) balik >1 kandidat
    // ASLI (mis. "Purwokerto" sendirian menyeret desa/kelurahan tak terkait
    // di kabupaten lain) → kelihatan seperti karangan padahal itu hasil
    // search sungguhan untuk keyword yang salah.
    //
    // Fix: jangan pakai `askCount > 0` sebagai syarat — pakai `extract.city`
    // (LLM SUDAH mendeteksi ada penyebutan tempat giliran ini, terlepas
    // giliran ke berapa) sebagai syaratnya. Begitu ada indikasi tempat sama
    // sekali, DAHULUKAN kata-kata LITERAL pelanggan sendiri (data asli via
    // `resolveDestination`, bukan tebakan kata pengisi) sebelum pasrah ke
    // `extract.city`. Sapaan/basa-basi murni ("halo", "oke kak") yang
    // ekstraktornya balik city=null tetap TIDAK menyentuh jalur ini sama
    // sekali (nol panggilan search tambahan) — persis perilaku lama.
    //
    // >>> ANGGA — koreksi 2026-08-06 (audit lanjutan #5, REPLAY LIVE laporan
    // Bossfren "1 pcs aja kak jadinya ke sandubaya aja deh" -> bot nanya
    // ULANG "Mataramnya itu kecamatan apa ya kak?" padahal SUDAH dijawab di
    // pesan yang sama): `PLACE_HINT`/`ORDER_CHANGE_HINT` dipakai di sini
    // sebagai syarat "apakah giliran ini jawaban tujuan" — padahal dua regex
    // itu dibuat untuk keputusan LAIN (`mayHaveChanged`, "perlu panggil LLM
    // ulang atau tidak"). Pesan yang menggabungkan konfirmasi jumlah + ganti
    // tujuan ("1 pcs" cocok `ORDER_CHANGE_HINT`, "ke sandubaya aja deh" cocok
    // `PLACE_HINT` lewat pola "ke <kata> aja/saja/dulu/deh") kena veto DUA
    // regex sekaligus — padahal justru pesan SEPERTI ITU yang paling perlu
    // masuk jalur pencarian literal (kata "sandubaya"-nya ada di situ).
    //
    // PERCOBAAN PERTAMA (dicabut, ketahuan kebablasan lewat test suite
    // SEBELUM sampai ke Bossfren, pola sama persis dengan `kandidatCocok`
    // #39/#40): buang veto `PLACE_HINT`/`ORDER_CHANGE_HINT` SAMA SEKALI.
    // Pecah di kasus giliran PERTAMA "kirim ke bogor" (`shipping.service.
    // spec.ts`, tangga P0 2026-08-05) — kalimat wajar "kirim ke bogor" ikut
    // masuk jalur jendela-kata-literal (kataJawaban jadi ["kirim","bogor"]),
    // dan karena jalur jendela SELALU menandai `sempit:true`, ambiguitas
    // Kota/Kab Bogor dibacakan sebagai pertanyaan TERTUTUP ("• Kota Bogor •
    // Kab. Bogor") — padahal aturan P0 2026-08-05 tegas: ambiguitas PERTAMA
    // KALI dalam sebuah percakapan wajib pertanyaan TERBUKA (potongan 50
    // baris search bisa menenggelamkan kandidat yang benar; daftar tertutup
    // dari jalur jendela bisa diam-diam salah kalau kandidat sungguhan lebih
    // dari yang kebetulan ditemukan lewat kata-kata di kalimat).
    //
    // Bedanya kalimat "kirim ke bogor" dengan "...jadinya ke sandubaya aja
    // deh": yang pertama adalah PEMBUKA percakapan (belum ada konteks tujuan
    // apa pun tersimpan) — `extract.city` sudah cukup presisi ("Bogor"),
    // tidak ada yang hilang. Yang kedua GANTI tujuan DI TENGAH percakapan
    // yang SUDAH punya tujuan tersimpan (kutipan Banyumas dari giliran
    // sebelumnya) — `extract.city` KEHILANGAN presisi (LLM menjatuhkan
    // "sandubaya" jadi "Mataram" saja), makanya kata literal pelanggan wajib
    // dicoba. Fix: veto `PLACE_HINT`/`ORDER_CHANGE_HINT` HANYA berlaku kalau
    // percakapan ini BELUM punya konteks tujuan apa pun (`sudahAdaKonteks`
    // — belum pernah bertanya, DAN belum ada kutipan aktif tersimpan) —
    // begitu ada konteks (giliran balasan ATAU tujuan sudah pernah
    // di-resolve sebelumnya), veto dilepas, kata literal pelanggan
    // didahulukan seperti niat aslinya. `!adaKataTanyaUang(...)`
    // DIPERTAHANKAN tanpa syarat — pesan pertanyaan uang murni ("totalnya
    // berapa kak?") memang bukan jawaban tujuan, di kedua kondisi. <<<
    //
    // >>> ANGGA -- PERCOBAAN KEDUA (dicabut juga, ketahuan lewat test suite
    // SEBELUM sampai ke Bossfren): syarat `sudahAdaKonteks` di atas
    // (askCount>0 ATAU ada kutipan tersimpan) TERLALU LONGGAR -- ia melepas
    // veto untuk SEMUA giliran lanjutan, termasuk yang `extract.city` hasil
    // ekstraksi LLM-nya SUDAH presisi & bisa dipercaya (kata kotanya
    // beneran ada di kalimat pelanggan giliran ini). Dua regresi ketahuan:
    // (1) "eh kirim ke bogor aja deh" giliran ke-4 (tujuan Medan sudah
    // pernah di-resolve giliran ke-3, cache masih ada) -- harusnya tangga
    // kembali ke NOL & tanya TERBUKA (P0 2026-08-05), malah lolos ke jalur
    // jendela literal yang SELALU `sempit:true` -> pertanyaan TERTUTUP; (2)
    // "eh salah, kirim ke Surabaya aja" -- extract.city="Surabaya" sudah pas
    // & tunggal, tapi ikut jalur jendela literal yang mencoba SETIAP kata
    // kalimat ("eh","salah","kirim","ke","aja") sebagai keyword pencarian
    // sendiri-sendiri -> 11 panggilan API padahal cukup 1.
    //
    // Sinyal yang benar BUKAN "ada konteks tujuan atau tidak" -- tapi
    // "apakah kata inti `extract.city` hasil ekstraksi giliran INI beneran
    // muncul verbatim di kalimat pelanggan". Kalau muncul (mis. "Bogor" ada
    // di "kirim ke bogor aja deh", "Surabaya" ada di "kirim ke Surabaya
    // aja"), ekstraksi LLM giliran ini presisi & bisa dipercaya sepenuhnya
    // -- veto tetap berlaku seperti semula (jalur `quote()` biasa yang
    // sudah benar menangani ambiguitas/tunggal, termasuk tangga OPEN P0).
    // Kalau TIDAK muncul (mis. "Mataram" TIDAK ada di manapun pada "1 pcs
    // aja kak jadinya ke sandubaya aja deh" -- LLM menariknya dari KONTEKS
    // giliran sebelumnya, kehilangan kata "sandubaya" yang sebenarnya
    // diucapkan pelanggan), ekstraksi kehilangan presisi & veto dilepas
    // supaya kata literal pelanggan (`jawabanPolosTujuan`) didahulukan.
    // Kalau `extract.city` kosong sama sekali (giliran balasan murni tanpa
    // penyebutan tempat baru, mis. "sandubaya kak" setelah kita tanya
    // kecamatan), tidak ada yang bisa dibandingkan -- dianggap TIDAK
    // presisi juga (veto dilepas), persis perilaku "JAWABAN KECAMATAN"
    // (#40 dst) yang memang mengandalkan `askCount > 0` sendirian. <<<
    // >>> ANGGA — Fase 1 Refactor (2026-08-07): logika resolusi tujuan literal
    // (jawabanPolosTujuan + cascade jendela + kata-per-kata + sempitkanJawaban)
    // dipindahkan ke resolveDestinationFromText() untuk keterbacaan — ZERO
    // perubahan logika, murni ekstraksi mekanis ke method terpisah.
    // CATATAN: finalize dipanggil di SINI (bukan di dalam method) supaya
    // closure finish() membaca turnViaPilihan yang SUDAH ter-update.
    const destResolve = await this.resolveDestinationFromText({
      lastCustomerText,
      extract,
      cached,
      conversationId,
      items,
      cfg,
      oc,
    });
    if (destResolve !== null) {
      if (destResolve.turnViaPilihan) turnViaPilihan = true;
      return finalize(destResolve.result);
    }
    // <<< ANGGA
    const city =
      extract.city?.trim() || choiceCity || carriedEntry?.snapshot.city || cached?.city || null;
    if (!city) {
      this.cache.recordOutcome(conversationId, 'no_destination');
      return finish({ status: 'no_destination' });
    }

    // Kutipan lama masih sah kalau kota DAN isi order sama persis.
    if (cached && sameCity(cached.city, city) && sameItems(cached.items, items)) {
      this.cache.recordOutcome(conversationId, 'ok');
      return finish({ status: 'ok', quote: cached });
    }
    // Tujuan/isi berubah → reset (Rule 8: direset, bukan ditambah).
    this.cache.reset(conversationId);

    // >>> ANGGA — Order Context Log: kalau barang dibawa dari log dan kotanya
    // tidak berubah, destination_id sudah di tangan — langsung hitung, tanpa
    // mengulang pencarian alamat (yang bisa gagal untuk teks pendek).
    if (
      carriedEntry &&
      carriedEntry.snapshot.destinationId &&
      sameCity(carriedEntry.snapshot.city, city)
    ) {
      const hasil = await this.quoteUntukTujuan(
        {
          city: carriedEntry.snapshot.city,
          province: carriedEntry.snapshot.province,
          label: '',
          destinationId: carriedEntry.snapshot.destinationId,
        },
        items,
      );
      return finalize(hasil);
    }
    // <<< ANGGA

    // >>> ANGGA — koreksi 2026-08-06 (insiden "Purwokertonya mana ya kak?"
    // ditanya ULANG): sebelum mencari alamat dari nol (yang bisa jatuh
    // ambigu lagi persis seperti giliran pertama), cek dulu apakah istilah
    // kota/kecamatan yang disebut SEKARANG pernah berhasil didisambiguasi di
    // percakapan ini (mis. pelanggan sempat pindah ke tujuan lain lalu balik
    // lagi) — kalau ya, pakai LANGSUNG hasilnya, jangan tanya ulang.
    const tujuanDiingat = this.cache.recallDestinationTerm(conversationId, city.trim().toLowerCase());
    if (tujuanDiingat) {
      turnViaPilihan = true;
      return finalize(await this.quoteUntukTujuan(tujuanDiingat, items));
    }
    // <<< ANGGA

    // >>> ANGGA — P4: provinsi hasil ekstraksi ikut sebagai saringan.
    const result = await this.quote({ keyword: city, items, provinsi: extract.province });
    // <<< ANGGA
    const sempitD = await this.sempitkanJawaban(result, lastCustomerText, items, conversationId, cfg);
    if (sempitD !== result) turnViaPilihan = true;
    return finalize(sempitD);
  }

  /**
   * >>> ANGGA — koreksi 2026-08-06 (audit lanjutan #4, pengganti gerbang
   * `pendingTujuan` yang dicabut di `quoteForConversation`): dipanggil di
   * SETIAP titik yang baru saja menghasilkan `status: 'ambiguous'` dari
   * pencarian API yang SEGAR giliran ini (bukan daftar basi giliran lalu).
   * Kalau kandidatnya masih >1, coba cocokkan jawaban pelanggan
   * (`lastCustomerText`) ke `CITY_NAME_SI` (`label`) milik kandidat-kandidat
   * yang BARU SAJA dikembalikan API — bukan literal parameter pencarian
  // ── Fase 2b — Handlers per-state ─────────────────────────────────────────
  //
  // Setiap handler menerima QuoteTurnContext (sinyal sudah diklasifikasikan)
  // dan mengembalikan ShippingResult. Handler TIDAK memanggil finish()/finalize()
  // — itu tanggung jawab orchestrator di quoteForConversation.
  //
  // Prinsip: mechanical extraction dari TEMA A/B/C/E — zero logic change.

  /**
   * CACHE_HIT — cache in-memory masih valid, tidak ada perubahan apapun.
   * Langsung kembalikan dari cache tanpa LLM.
   */
  private handleCacheHit(ctx: QuoteTurnContext): ShippingResult {
    const { conversationId, cached } = ctx;
    // cached pasti non-null saat state ini (classifyTurn sudah memverifikasi)
    this.cache.recordOutcome(conversationId, 'ok');
    return { status: 'ok', quote: cached! };
  }

  /**
   * LOG_HIT — tidak ada cache tapi log segar tersedia + pertanyaan uang.
   * Hitung ulang deterministik dari snapshot log TANPA LLM.
   * Jika tidak ada log segar → kembalikan null (caller lanjut ke EXTRACT).
   */
  private async handleLogHit(
    ctx: QuoteTurnContext,
    cfg: ShippingSettings,
    oc: OrderContextSettings,
  ): Promise<ShippingResult | null> {
    const { conversationId, lastCustomerText } = ctx;
    if (!this.orderLog) return null;
    const entries = (await this.orderLog.candidates(conversationId)).filter(
      (e) => e.fresh && e.snapshot.items.length > 0 && e.snapshot.destinationId,
    );
    if (!entries.length) return null;
    const latest = entries[0];
    const aggregateAsk = hasAggregateKeyword(lastCustomerText, oc.orderAggregateKeywords);
    const logItems = aggregateAsk
      ? mergeSnapshots(entries.map((e) => e.snapshot)).map((m) => ({ name: m.name, qty: m.qty }))
      : latest.snapshot.items.map((i) => ({ name: i.name, qty: i.qty }));
    const hasil = await this.quoteUntukTujuan(
      {
        city: latest.snapshot.city,
        province: latest.snapshot.province,
        label: '',
        destinationId: latest.snapshot.destinationId,
      },
      logItems,
    );
    if (hasil.status === 'ok') {
      this.cache.set(conversationId, hasil.quote, cfg.quoteCacheTtlMs);
      this.cache.setAssumed(conversationId, logItems.map((i) => i.name), aggregateAsk);
    }
    this.cache.recordOutcome(conversationId, hasil.status);
    return hasil;
  }

  // ── (end Fase 2b handlers — ITEM_CHOICE, DEIXIS, DESTINATION, EXTRACT
  //    ITEM_CHOICE, DEIXIS, DESTINATION sudah di bawah) ──────────────────────

  /**
   * ITEM_CHOICE — pelanggan sedang menjawab pertanyaan pilihan barang.
   * Resolve dari pendingItems cache, TANPA ekstraksi LLM ulang.
   * Kembalikan {items, choiceCity, konklusiKeranjang, turnViaPilihan} jika ada pilihan cocok.
   * Kembalikan null jika tidak ada pendingItems atau pilihan tidak cocok.
   * CATATAN: handler TIDAK memanggil quoteUntukTujuan — caller meneruskan ke finalize().
   */
  private async resolveItemChoice(
    conversationId: string,
    lastCustomerText: string,
    oc: OrderContextSettings,
  ): Promise<{
    itemsFromChoice: ExtractedItem[];
    choiceCity: string | null;
    konklusiKeranjang: boolean;
    turnViaPilihan: boolean;
  } | null> {
    const pendingItems = this.cache.pendingItems(conversationId);
    if (!pendingItems) return null;

    let itemsFromChoice: ExtractedItem[] | null = null;
    let choiceCity: string | null = null;
    let konklusiKeranjang = false;
    let turnViaPilihan = false;

    // >>> ANGGA — Q-Chain (2026-08-05): mode 'keranjang' + jawaban AGREGAT
    if (
      pendingItems.mode === 'keranjang' &&
      this.orderLog &&
      hasAggregateKeyword(lastCustomerText, oc.orderAggregateKeywords)
    ) {
      this.cache.clearPendingItems(conversationId);
      const ids = new Set(pendingItems.candidates.map((c) => c.productId));
      const union = mergeSnapshots(
        (await this.orderLog.candidates(conversationId))
          .filter((e) => e.fresh)
          .map((e) => e.snapshot),
      ).filter((m) => ids.has(m.productId));
      itemsFromChoice = union.length
        ? union.map((m) => ({ name: m.name, qty: m.qty }))
        : pendingItems.candidates.map((c) => ({ name: c.name, qty: 1 }));
      choiceCity = pendingItems.city;
      konklusiKeranjang = true;
      turnViaPilihan = true;
    } else {
      const chosen = pilihBarang(pendingItems.candidates, lastCustomerText, oc);
      if (chosen) {
        this.cache.clearPendingItems(conversationId);
        itemsFromChoice = [{ name: chosen.name, qty: patchQty(lastCustomerText) ?? pendingItems.qty }];
        choiceCity = pendingItems.city;
        if (pendingItems.mode === 'keranjang') konklusiKeranjang = true;
        turnViaPilihan = true;
      }
    }
    // <<< ANGGA

    if (!itemsFromChoice) return null;
    return { itemsFromChoice, choiceCity, konklusiKeranjang, turnViaPilihan };
  }

  /**
   * DEIXIS — frasa tunjuk ("yg itu/tadi") di-resolve ke offer registry.
   * Kembalikan null jika tidak ada offer atau frasa tidak cocok.
   * Kembalikan ShippingResult jika ada satu kandidat, atau item_ambiguous
   * jika ada ≥2 kandidat.
   */
  private async handleDeixis(
    ctx: QuoteTurnContext,
    cfg: ShippingSettings,
    oc: OrderContextSettings,
  ): Promise<{ result: ShippingResult; turnViaPilihan: boolean } | null> {
    const { conversationId, lastCustomerText, cached } = ctx;
    if (!this.orderLog || !hasAggregateKeyword(lastCustomerText, oc.orderDeixisKeywords)) return null;

    const offers = (await this.orderLog.recentOffers(conversationId)).filter((o) => o.fresh);
    if (!offers.length) return null;

    // Build offer pool
    const offerPool = new Map<string, { productId: string; name: string }>();
    for (const o of offers) {
      for (const it of o.items) {
        if (!offerPool.has(it.productId)) offerPool.set(it.productId, { productId: it.productId, name: it.name });
      }
    }
    const products = await this.prisma.product.findMany({ where: { status: 'active' }, take: 500 });
    const generik = catalogMatchesInText(lastCustomerText, products as never);
    let pool = Array.from(offerPool.values());
    if (generik.length) {
      const generikIds = new Set(generik.map((g) => g.productId));
      const inter = pool.filter((c) => generikIds.has(c.productId));
      if (inter.length) pool = inter;
    }

    if (pool.length === 0) return null;

    if (pool.length >= 2) {
      // Ambiguous → pertanyaan tertutup
      const candidates = pool;
      this.cache.setPendingItems(conversationId, {
        candidates,
        qty: patchQty(lastCustomerText) ?? 1,
        city: cached?.city ?? null,
      });
      this.cache.recordOutcome(conversationId, 'item_ambiguous');
      return {
        result: {
          status: 'item_ambiguous',
          keyword: lastCustomerText.slice(0, 40),
          itemCandidates: candidates,
        },
        turnViaPilihan: false,
      };
    }

    // pool.length === 1 → langsung quote
    const item: ExtractedItem = { name: pool[0].name, qty: patchQty(lastCustomerText) ?? 1 };
    if (!cached?.destinationId) return null;

    const result = await this.quoteUntukTujuan(
      { city: cached.city, province: cached.province, label: '', destinationId: cached.destinationId },
      [item],
    );
    if (result.status === 'ok') {
      this.cache.set(conversationId, result.quote, cfg.quoteCacheTtlMs);
    }
    this.cache.recordOutcome(conversationId, result.status);
    return { result, turnViaPilihan: false };
  }

  /**
   * DESTINATION — jawabanPolosTujuan: resolve literal kota/kecamatan.
   * Thin wrapper di atas resolveDestinationFromText() yang sudah ada.
   * Kembalikan null jika tidak ada jawabanPolosTujuan.
   */
  private async handleDestination(
    ctx: QuoteTurnContext,
    cfg: ShippingSettings,
    oc: OrderContextSettings,
    items: ExtractedItem[],
    extract: { city: string | null; province: string | null; failed?: boolean },
  ): Promise<{ result: ShippingResult; turnViaPilihan: boolean } | null> {
    const { conversationId, lastCustomerText, cached } = ctx;
    return this.resolveDestinationFromText({
      lastCustomerText,
      extract,
      cached,
      conversationId,
      items,
      cfg,
      oc,
    });
  }

  /**
   * (sudah dibuktikan live 2026-08-05 di `quote()`: keyword ber-prefiks
   * "kota"/"kabupaten" balik NOL baris dari API Mengantar, jadi tidak bisa
   * jadi bahan SEARCH), tapi bahan MEMILIH di antara hasil segar yang sudah
   * ada di tangan. Cocok tunggal → langsung dihitung (setara Q-Chain
   * "jawaban atas pertanyaan tertutup"); cocok >1 tapi menyempit → pertanyaan
   * tertutup dari subset (P0 2026-08-05, "yang lampung kak"); tidak cocok
   * sama sekali → `result` dikembalikan APA ADANYA (referensi sama,
   * dipakai pemanggil untuk tahu tidak ada yang berubah).
   */
  private async sempitkanJawaban(
    result: ShippingResult,
    lastCustomerText: string,
    items: ExtractedItem[],
    conversationId: string,
    cfg: ShippingSettings,
  ): Promise<ShippingResult> {
    if (result.status !== 'ambiguous' || !result.candidates?.length) return result;

    const tunggal = pilihKandidat(result.candidates, lastCustomerText);
    if (tunggal) {
      this.cache.clearPending(conversationId);
      this.cache.resetAsks(conversationId);
      this.cache.reset(conversationId);
      // Ingat istilah jawaban pelanggan sendiri -> hasil ini, sama seperti
      // gerbang lama — supaya topik yang sama nanti (sesudah sempat pindah
      // ke tujuan lain lalu balik lagi) langsung ketemu tanpa cari ulang.
      const kataLabelDipilih = new Set(kata(tunggal.label));
      for (const w of kata(lastCustomerText)) {
        if (w.length < 4) continue; // buang kata pendek generik ("di", "ke", "kab")
        if (STOPWORDS_LOKASI_GENERIK.has(w)) continue;
        if (kataLabelDipilih.has(w)) {
          this.cache.rememberDestinationTerm(conversationId, w, tunggal, cfg.quoteCacheTtlMs);
        }
      }
      return this.quoteUntukTujuan(tunggal, items);
    }

    if (result.candidates.length > 1) {
      const subset = kandidatCocok(result.candidates, lastCustomerText);
      if (subset.length > 1 && subset.length < result.candidates.length) {
        return { ...result, candidates: subset, sempit: true };
      }
    }
    return result;
  }

  /**
   * Inti Langkah 3-9, tanpa percakapan — dipakai juga oleh endpoint uji manual
   * admin di controller (pola "kolom uji pertanyaan" di menu Knowledge).
   */

  /**
   * >>> ANGGA — Fase 1 Refactor Klaster A (2026-08-07): logika resolusi tujuan
   * literal dipindahkan dari quoteForConversation ke method terpisah.
   * Dipanggil setelah gerbang cache/log-hit (Tema A) dan gerbang pilihan-barang
   * (Tema B). Mengurus: jawabanPolosTujuan, cascade jendela kata, loop
   * kata-per-kata, dan sempitkanJawaban. Mengembalikan null jika kondisi
   * jawabanPolosTujuan tidak terpenuhi (caller lanjut ke quote() biasa).
   * ZERO perubahan logika dari versi inline.
   */
  private async resolveDestinationFromText(params: {
    lastCustomerText: string;
    extract: { city: string | null; province: string | null; failed?: boolean };
    cached: ShippingQuote | null;
    conversationId: string;
    items: ExtractedItem[];
    cfg: ShippingSettings;
    oc: OrderContextSettings;
  }): Promise<{ result: ShippingResult; turnViaPilihan: boolean } | null> {
    const { lastCustomerText, extract, cached, conversationId, items, cfg, oc } = params;
    let turnViaPilihan = false;
    const sudahAdaKonteks = this.cache.askCount(conversationId) > 0 || !!cached;
    const cityKataMuncul = (() => {
      const c = (extract.city ?? '').trim();
      if (!c) return false;
      const kataTeks = new Set(kata(lastCustomerText));
      return kata(c).some((w) => kataTeks.has(w));
    })();
    // >>> ANGGA -- PERCOBAAN KETIGA: `cityKataMuncul` sendirian (tanpa syarat
    // `sudahAdaKonteks`) ketahuan JUGA kebablasan lewat test suite -- kasus
    // "ANGGA -- jawaban pelanggan dipetakan..." (`bogorDua`, giliran
    // PERTAMA/fresh, fixture lastCustomerText default "kirim ke Medan ya"
    // sementara extract.city di-mock "Bogor" -- mismatch murni artefak
    // fixture, bukan skenario nyata) balik jadi 7 panggilan API alih-alih 1,
    // karena `cityKataMuncul` bernilai false (kata "bogor" memang tak ada di
    // "kirim ke Medan ya") dan veto ikut lolos padahal ini giliran PERTAMA
    // tanpa konteks apa pun. `cityKataMuncul` HANYA relevan untuk membedakan
    // dua kondisi yang SAMA-SAMA sudah py punya konteks (`sudahAdaKonteks`);
    // untuk giliran benar-benar pertama, veto klasik (PLACE_HINT/
    // ORDER_CHANGE_HINT) tetap satu-satunya penjaga, persis P0 2026-08-05. <<<
    const jawabanPolosTujuan =
      (this.cache.askCount(conversationId) > 0 || !!(extract.city ?? '').trim()) &&
      !adaKataTanyaUang(lastCustomerText, oc.orderMoneyAskKeywords) &&
      ((sudahAdaKonteks && !cityKataMuncul) ||
        (!PLACE_HINT.test(lastCustomerText) && !ORDER_CHANGE_HINT.test(lastCustomerText)));
    if (jawabanPolosTujuan) {
      // Sebutan produk = bukan jawaban tujuan — jangan search nama golok jadi desa.
      const produkKatalogL = await this.prisma.product.findMany({ where: { status: 'active' }, take: 500 });
      if (!mentionsCatalogProduct(lastCustomerText, produkKatalogL)) {
      // >>> ANGGA — fix (2026-08-06, REPLAY live laporan Bossfren "kumat lagi
      // abis 2 perbaikan terakhir"): "kakak" (honorifik >=4 huruf, BUKAN "kak"
      // yang sudah difilter duluan) lolos dari daftar ini -> jadi kata KEDUA
      // di kataJawaban -> memicu cabang frasa-utuh (fix d0b0f0e) yang SIA-SIA
      // (bukan istilah lokasi apa pun) sebelum jatuh ke kata polos -> 1-2
      // panggilan API pencarian tambahan per giliran yang TIDAK PERNAH ada
      // sebelum fix itu. Ditambahkan sejajar "kak"/"mas"/"bang" yang sudah
      // ada — melengkapi daftar honorifik, bukan tambalan khusus satu kata. <<<
      const generik = new Set([
        'kak', 'kk', 'kakak', 'kaka', 'ya', 'yaa', 'iya', 'betul', 'bener', 'benar', 'oke', 'ok', 'sip',
        'dong', 'deh', 'itu', 'yang', 'yg', 'di', 'ke', 'kota', 'kabupaten', 'kab',
        'provinsi', 'daerah', 'kecamatan', 'kelurahan', 'desa', 'aja', 'saja', 'mas', 'bang',
        ...(oc.orderFillerWords ?? []).map((w) => (w ?? '').toLowerCase().trim()),
        ...(oc.orderAffirmationKeywords ?? []).map((w) => (w ?? '').toLowerCase().trim()),
      ]);
      const kataJawaban = (lastCustomerText.toLowerCase().match(/[a-z]+/g) ?? [])
        .filter((w) => w.length >= 4 && !generik.has(w))
        .slice(0, 3);
      // >>> ANGGA — fix (2026-08-06, REPLAY laporan Bossfren "purwokerto
      // timur" -> "Kab. Purwokerto" ngarang, DIBUKTIKAN pakai widget debug
      // search Bossfren sendiri): jawaban pelanggan berupa FRASA ≥2 kata
      // ("purwokerto timur") SEBELUM fix ini dipecah per-KATA di loop bawah,
      // dan payahnya kata pembeda kedua ("timur") cuma numpang di STRING
      // PENCARIAN API (`${w} ${kotaKonteks}`, dan itu pun rusak jadi
      // "purwokerto purwokerto timur" karena `kotaKonteks` giliran ini
      // adalah HASIL EKSTRAKSI dari jawaban yang sama, "purwokerto timur" —
      // guard `kotaKonteks !== w` tidak menangkap kasus w SUBSET dari
      // kotaKonteks) — sedangkan PENILAIAN LOKAL (`resolveDestination`)
      // tetap dicocokkan cuma terhadap kata TUNGGAL `w`="purwokerto". Widget
      // debug Bossfren membuktikan API sendiri SUDAH balik hasil bersih untuk
      // "purwokerto timur" (1 grup: Kab. Banyumas) — baris kelurahan
      // "Purwokerto" tunggal di Lamongan/Kediri/Blitar tidak relevan sama
      // sekali, cuma numpang lolos karena penilaian lokal buang kata "timur".
      // Fix: coba FRASA UTUH (semua kataJawaban digabung, urutan aslinya)
      // dulu — untuk PENCARIAN *dan* PENILAIAN LOKAL sekaligus — sebelum
      // jatuh ke kata satu-satu di bawah. `levelKecocokan` mencocokkan
      // PERSIS/awalan-kata, jadi frasa dua-kata otomatis cuma kena baris
      // kecamatan yang namanya PERSIS SAMA ("PURWOKERTO TIMUR"), menyingkirkan
      // kelurahan bernama tunggal "Purwokerto" di kabupaten lain TANPA
      // daftar pengecualian apa pun — general untuk nama tempat serupa di
      // luar Purwokerto juga (mis. "X Timur"/"X Utara" yang jadi substring
      // nama desa "X" di kabupaten lain). Kalau frasa utuh nol hasil (bukan
      // ambigu — benar-benar tak ketemu), baru fallback ke kata satu-satu. <<<
      if (kataJawaban.length > 1) {
        const kotaKonteksF = (extract.city ?? '').trim().toLowerCase();
        // >>> ANGGA — fix (2026-08-06, REPLAY LIVE lanjutan "purwokerto timur
        // kakakku", laporan Bossfren "ngulang dari awal ni"): fix sebelumnya
        // di sini cuma coba SATU frasa (semua kataJawaban digabung persis).
        // Begitu ada kata KETIGA yang lolos filter stopword (honorifik
        // berimbuhan spt "kakakku" — BUKAN "kakak" polos yang baru saja
        // ditambahkan ke daftar, dan pasti akan selalu ada variasi baru
        // berikutnya), frasa 3-kata itu TIDAK PERNAH cocok PERSIS ke nama
        // kecamatan manapun (yang cuma 2 kata, "PURWOKERTO TIMUR") -> jatuh
        // ke loop kata-per-kata lama -> ULANG bug asli ("purwokerto"
        // sendirian menyeret kelurahan tak terkait). AKAR masalahnya BUKAN
        // kurang lengkapnya daftar kata pengisi (whack-a-mole tanpa ujung —
        // pelanggan selalu bisa menulis honorifik/imbuhan baru) — jadi
        // solusinya JANGAN andalkan daftar kata sama sekali di titik ini:
        // coba SEMUA JENDELA panjang kata (mulai dari frasa paling spesifik/
        // semua-kata, mengecil dengan membuang kata BELAKANG dulu — pola
        // bicara asli "lokasi lalu honorifik" di kedua insiden nyata; plus
        // satu percobaan buang kata DEPAN untuk jaga-jaga honorifik di
        // depan), dan biarkan DATA ALAMAT ASLI (exact-match `levelKecocokan`
        // via `resolveDestination`) yang menentukan potongan mana yang
        // sungguh nama tempat — bukan kita menebak kata mana yang "bukan
        // lokasi". Semua jendela + variannya ditembak SEKALIGUS paralel
        // (bukan berurutan per jendela, menyambung fix latensi sebelumnya)
        // — makin banyak kata yang lolos filter cuma menambah jumlah
        // panggilan PARALEL, BUKAN latensi maupun rantai kegagalan baru. <<<
        const jendelaKata: string[][] = [];
        for (let panjang = kataJawaban.length; panjang >= 2; panjang--) {
          jendelaKata.push(kataJawaban.slice(0, panjang));
        }
        if (kataJawaban.length === 3) jendelaKata.push(kataJawaban.slice(1, 3));

        const rencanaJendela = jendelaKata.map((kataF) => {
          const frasaF = kataF.join(' ');
          const cobaF = [
            ...(kotaKonteksF && kotaKonteksF !== frasaF && !kotaKonteksF.includes(frasaF)
              ? [`${frasaF} ${kotaKonteksF}`]
              : []),
            frasaF,
          ];
          return { kataF, frasaF, cobaF };
        });
        const semuaKeywordJendela = Array.from(new Set(rencanaJendela.flatMap((r) => r.cobaF)));
        const hasilJendela = new Map<string, MengantarAddress[] | null>();
        await Promise.all(
          semuaKeywordJendela.map(async (kw) => {
            hasilJendela.set(kw, await this.mengantar.searchAddress(terapkanAlias(kw, cfg.destinationAliases)));
          }),
        );

        for (const { frasaF, cobaF } of rencanaJendela) {
          const rowsF = cobaF.map((kw) => hasilJendela.get(kw) ?? null).find((r) => r?.length) ?? null;
          let urutF = rowsF?.length ? resolveDestination(rowsF, frasaF) : [];
          if (urutF.length) {
            const provJawabF = normalisasiProvinsi(extract.province ?? '');
            if (provJawabF) {
              const saringF = urutF.filter((c) => normalisasiProvinsi(c.province) === provJawabF);
              if (saringF.length) urutF = saringF;
            }
            if (urutF.length > 1 && extract.city) {
              const kotaKF = extract.city.trim().toLowerCase();
              if (kotaKF) {
                const silangF = urutF.filter((c) => `${c.city} ${c.cityLabel}`.toLowerCase().includes(kotaKF));
                if (silangF.length) urutF = silangF;
              }
            }
            if (kandidatDominan(urutF)) {
              turnViaPilihan = true;
              this.cache.clearPending(conversationId);
              this.cache.resetAsks(conversationId);
              this.cache.reset(conversationId);
              const menangF = urutF[0];
              const pilihanMenangF: DestinationChoice = {
                city: menangF.city,
                province: menangF.province,
                label: '',
                destinationId: menangF.ids[0],
              };
              if (!STOPWORDS_LOKASI_GENERIK.has(frasaF)) {
                this.cache.rememberDestinationTerm(conversationId, frasaF, pilihanMenangF, cfg.quoteCacheTtlMs);
              }
              for (const wF of kataJawaban) {
                if (!STOPWORDS_LOKASI_GENERIK.has(wF)) {
                  this.cache.rememberDestinationTerm(conversationId, wF, pilihanMenangF, cfg.quoteCacheTtlMs);
                }
              }
              return { result: await this.quoteUntukTujuan(pilihanMenangF, items), turnViaPilihan };
            }
            // Jendela ini KETEMU tapi masih >1 kandidat sungguhan — jendela
            // yang lebih panjang selalu SAMA ATAU LEBIH presisi daripada
            // jendela yang lebih pendek (lebih banyak kata = syarat cocok
            // lebih ketat), jadi begitu SATU jendela membuahkan hasil,
            // langsung tanya tertutup dari situ — JANGAN diteruskan ke
            // jendela lebih pendek (yang cuma akan melebarkan ambiguitas
            // lagi, bukan mempersempit).
            turnViaPilihan = true;
            const ambigF: ShippingResult = {
              status: 'ambiguous',
              sempit: true,
              candidates: urutF.map((c) => ({
                city: c.city,
                province: c.province,
                label: labelKandidat(c, urutF),
                destinationId: c.ids[0],
              })),
            };
            return { result: await this.sempitkanJawaban(ambigF, lastCustomerText, items, conversationId, cfg), turnViaPilihan };
          }
          // Jendela ini nol hasil (bukan ambigu, benar-benar tak ketemu) —
          // lanjut coba jendela yang lebih pendek berikutnya.
        }
        // Semua jendela (dan variannya) nol hasil — lanjut ke fallback kata
        // satu-satu di bawah apa adanya.
      }
      // <<< ANGGA
      for (const w of kataJawaban) {
        // >>> ANGGA — KETOK BOSSFREN (2026-08-05 malam, DIBUKTIKAN di API
        // nyata via widget): saat stuck, GABUNGKAN jawaban kedua + konteks
        // pertama jadi SATU keyword search — "sandubaya mataram" → 7 baris
        // presisi Kota Mataram NTB, "purwokerto banyumas" → 27 baris Kab.
        // Banyumas. Penilaian kandidat tetap memakai KATA JAWABAN (baris
        // "SANDUBAYA (SANDUJAYA)" dinilai vs "sandubaya", bukan vs keyword
        // gabungan yang tak akan pernah cocok utuh). Gabungan dicoba dulu,
        // kata polos jadi cadangan. <<<
        const kotaKonteks = (extract.city ?? '').trim().toLowerCase();
        const cobaKeyword = [
          ...(kotaKonteks && kotaKonteks !== w ? [`${w} ${kotaKonteks}`] : []),
          w,
        ];
        // >>> ANGGA — fix latensi (2026-08-06, tindak lanjut laporan Bossfren
        // "kumat lagi"): sama seperti frasa-utuh di atas — 2 kandidat keyword
        // independen ditembak PARALEL, bukan berurutan+break, supaya loop kata
        // per kata (maks 3 kata) tidak menumpuk jadi rantai round-trip
        // berurutan. Prioritas (gabungan+kota didahulukan) tetap terjaga via
        // `.find` pada array hasil ber-indeks sama dengan `cobaKeyword`. <<<
        const hasilKw = await Promise.all(
          cobaKeyword.map((kw) => this.mengantar.searchAddress(terapkanAlias(kw, cfg.destinationAliases))),
        );
        const rows = hasilKw.find((r) => r?.length) ?? null;
        // <<< ANGGA
        if (!rows?.length) continue;
        let urut = resolveDestination(rows, w);
        if (!urut.length) continue;
        const provJawab = normalisasiProvinsi(extract.province ?? '');
        if (provJawab) {
          const saring = urut.filter((c) => normalisasiProvinsi(c.province) === provJawab);
          if (saring.length) urut = saring;
        }
        // >>> ANGGA — IDE BOSSFREN #1 (2026-08-05): SILANG dua lokasi — kota
        // dari konteks/ekstraktor ("Mataram") dipakai menyaring kandidat
        // jawaban kecamatan ("Sandubaya" cocok banyak tempat → yang kotanya
        // memuat "mataram" itulah maksudnya). <<<
        if (urut.length > 1 && extract.city) {
          const kotaK = extract.city.trim().toLowerCase();
          if (kotaK) {
            const silang = urut.filter((c) => `${c.city} ${c.cityLabel}`.toLowerCase().includes(kotaK));
            if (silang.length) urut = silang;
          }
        }
        // <<< ANGGA
        if (kandidatDominan(urut)) {
          turnViaPilihan = true; // jawaban atas pertanyaan kita = giliran uang
          this.cache.clearPending(conversationId);
          this.cache.resetAsks(conversationId);
          this.cache.reset(conversationId);
          const menang = urut[0];
          const pilihanMenang: DestinationChoice = {
            city: menang.city,
            province: menang.province,
            label: '',
            destinationId: menang.ids[0],
          };
          // >>> ANGGA — koreksi 2026-08-06: sama seperti cabang `dipilih` di
          // atas — ingat istilah "kotaKonteks" -> hasil ini untuk sisa sesi.
          if (kotaKonteks) {
            this.cache.rememberDestinationTerm(conversationId, kotaKonteks, pilihanMenang, cfg.quoteCacheTtlMs);
          }
          // >>> ANGGA — koreksi 2026-08-06 (audit lanjutan, REPLAY insiden
          // nyata "sandubaya"/"purwokerto" bolak-balik, laporan Bossfren):
          // INI JALUR PERSIS insiden aslinya (lihat komentar "JAWABAN
          // KECAMATAN" di atas) — `kotaKonteks` di sini SELALU istilah LUAS
          // hasil ekstraksi ("mataram"), sedangkan `w` adalah kata jawaban
          // pelanggan SENDIRI yang justru berhasil mencocokkan baris
          // "SANDUBAYA (SANDUJAYA)" ("sandubaya"). Kalau cuma "mataram" yang
          // diingat, balik ke "sandubaya" nanti cari ulang dari nol dan jatuh
          // ambigu lagi — persis laporan Bossfren. Ingat JUGA di bawah `w`.
          if (!STOPWORDS_LOKASI_GENERIK.has(w)) { // >>> ANGGA — koreksi lanjutan #2 <<<
            this.cache.rememberDestinationTerm(conversationId, w, pilihanMenang, cfg.quoteCacheTtlMs);
          }
          // <<< ANGGA
          return { result: await this.quoteUntukTujuan(pilihanMenang, items), turnViaPilihan };
        }
        turnViaPilihan = true;
        const ambigC: ShippingResult = {
          status: 'ambiguous',
          sempit: true,
          candidates: urut.map((c) => ({
            city: c.city,
            province: c.province,
            label: labelKandidat(c, urut),
            destinationId: c.ids[0],
          })),
        };
        return { result: await this.sempitkanJawaban(ambigC, lastCustomerText, items, conversationId, cfg), turnViaPilihan };
      }
      }
    }

    // Tidak masuk jawabanPolosTujuan — caller lanjut ke quote() biasa.
    return null;
  }

  async quote(input: {
    keyword: string;
    items: ExtractedItem[];
    /** >>> ANGGA — P4: provinsi (kalau pelanggan menyebutnya) = saringan
     *  deterministik atas kelompok kandidat. <<< */
    provinsi?: string | null;
  }): Promise<ShippingResult> {
    const cfg = await this.settings.shipping();
    if (!cfg.mengantarApiKey || !cfg.mengantarOriginId) return { status: 'not_configured' };

    // Langkah 2b — tukar nama panggilan dengan nama resmi SEBELUM mencari.
    // Kalau tidak ada aliasnya, `dicari` sama persis dengan yang diketik.
    const dicari = terapkanAlias(input.keyword, cfg.destinationAliases);

    // Langkah 3 — Search Address + pengelompokan per provinsi+kota.
    const rows = await this.mengantar.searchAddress(dicari);
    // >>> ANGGA — E4 (2026-08-05, pelajaran insiden "ongkir mataram" yang tak
    // terdiagnosa): SETIAP status gagal wajib meninggalkan jejak warn dengan
    // sebabnya — Rule 10 dkk membuat bot menyerah dengan sopan ke pelanggan,
    // tapi tanpa log, admin tidak pernah tahu KENAPA. Satu grep harus cukup.
    if (rows === null) {
      this.logger.warn(`Ongkir gagal [api_error]: search alamat "${dicari}" mengembalikan null (HTTP/bentuk respons — lihat warn MengantarClient di dekat baris ini)`);
      return { status: 'api_error' };
    }
    let urut = resolveDestination(rows, dicari);
    // >>> ANGGA — DICABUT 2026-08-05 malam (uji API NYATA Bossfren via widget):
    // varian "kota <nama>"/"kabupaten <nama>" TIDAK berguna — search "kota
    // mataram" mengembalikan NOL baris di API Mengantar. Solusi yang benar =
    // GABUNG DUA JAWABAN di tangga jawaban ("sandubaya mataram" → 7 baris
    // presisi Kota Mataram NTB), lihat tangga jawaban-polos di
    // quoteForConversation. <<<
    if (!urut.length) {
      this.logger.warn(`Ongkir [need_more_detail]: "${dicari}" — ${rows.length} baris hasil search, nol kandidat kota/kabupaten yang cocok (kemungkinan tenggelam di potongan 50 baris; minta kecamatan)`);
    }
    // <<< ANGGA
    // >>> ANGGA — P4 (2026-08-05): SARINGAN PROVINSI. Pelanggan yang sudah
    // menyebut provinsi ("mataram NTB") tidak boleh diperlakukan seolah tidak
    // menyebutnya. Cocok ≥1 kelompok → sempitkan; cocok NOL ("mataram" +
    // "NTB" tapi semua kandidat Lampung/Sumsel) → sistem TAHU PASTI kota yang
    // dimaksud tenggelam di potongan 50 baris → minta kecamatan, JANGAN
    // pernah jatuh ke kandidat provinsi lain.
    const prov = normalisasiProvinsi(input.provinsi ?? '');
    if (prov && urut.length) {
      const seprovinsi = urut.filter((c) => {
        const p = normalisasiProvinsi(c.province);
        return p.includes(prov) || prov.includes(p);
      });
      if (seprovinsi.length) {
        urut = seprovinsi;
      } else {
        this.logger.warn(
          `Ongkir [need_more_detail]: "${dicari}" provinsi "${prov}" — kandidat search semua di provinsi lain [${[...new Set(urut.map((c) => c.province))].join(', ')}]; kota tenggelam, minta kecamatan`,
        );
        return { status: 'need_more_detail', keyword: input.keyword };
      }
    }
    // <<< ANGGA
    // Tidak ada kecocokan PERSIS di level manapun. Sering terjadi karena
    // pencarian Mengantar dipotong di 50 baris dan kota aslinya tenggelam
    // (diuji live: "Padang" & "Malang" tidak muncul sama sekali di 50 baris
    // itu). Meminta provinsi TIDAK menolong di kasus ini — saringan provinsi
    // atas hasil "padang" menyisakan nol baris. Yang terbukti menolong adalah
    // kecamatan: "Padang Barat"/"Klojen"/"Laweyan" semuanya resolve bersih.
    if (!urut.length) return { status: 'need_more_detail', keyword: input.keyword };
    if (!kandidatDominan(urut)) {
      // Tarif Mengantar seragam per kota/kabupaten (dibuktikan live), jadi _id
      // mana pun dari kelompok ini boleh dipakai sebagai destination_id — dan
      // karena itu destination_id-nya bisa ikut DISIMPAN sekarang, sebelum
      // pelanggan menjawab. Jawabannya nanti tinggal dipetakan, tanpa cari lagi.
      return {
        status: 'ambiguous',
        keyword: input.keyword, // >>> ANGGA — P0: bahan pertanyaan terbuka <<<
        candidates: urut.map((c) => ({
          city: c.city,
          province: c.province,
          label: labelKandidat(c, urut),
          destinationId: c.ids[0],
        })),
      };
    }
    const menang = urut[0];
    return this.quoteUntukTujuan(
      { city: menang.city, province: menang.province, label: '', destinationId: menang.ids[0] },
      input.items,
    );
  }

  /**
   * Langkah 4-9 — tujuan SUDAH pasti (punya destination_id), tinggal menghitung.
   *
   * Dipisah dari `quote()` supaya jawaban pelanggan atas pertanyaan tertutup
   * ("Kota Bogor") bisa masuk lewat sini langsung, tanpa mengulang Langkah 3
   * yang justru tidak akan menemukan apa-apa untuk teks seperti itu.
   */
  private async quoteUntukTujuan(
    target: DestinationChoice,
    items: ExtractedItem[],
  ): Promise<ShippingResult> {
    const cfg = await this.settings.shipping();
    const destinationId = target.destinationId;
    const input = { items };

    // Langkah 4 — berat & harga total order dari katalog (deterministik).
    // >>> ANGGA — dulu: tidak ada produk cocok => TIDAK ADA ANGKA SAMA SEKALI.
    // Itu menyatukan dua hal yang sebenarnya terpisah, dan bikin modul ini
    // nyaris tak berguna: "berapa ongkir ke X?" sebelum memilih produk adalah
    // pola tanya paling umum, dan bot selalu mengelak.
    //
    //   ONGKIR tidak butuh tahu produknya — seluruh katalog Cordova sama rata
    //   1000 g, jadi ongkir 1 pcs itu angka PASTI, bukan tebakan.
    //   TOTAL BELANJA memang butuh produk, dan gerbang itu tetap dipertahankan.
    //
    // Jadi kalau ada satu saja item yang tidak cocok katalog (atau tidak ada
    // item sama sekali), kita turun ke kutipan ONGKIR SAJA: berat default untuk
    // 1 pcs, harga barang 0, dan ditandai `shippingOnly` supaya grounding text
    // menyebutnya apa adanya — bukan diam-diam disodorkan sebagai total.
    const raw = input.items.length
      ? await this.resolveItems(input.items, cfg.defaultWeightGrams)
      : { matched: [], unmatched: [], ambiguous: [], totalGrams: 0, totalPrice: 0 };
    // >>> ANGGA — Order Context Log: sebutan cocok >1 produk berskor SERI →
    // BERTANYA tertutup, jangan memilih diam-diam dan jangan diam-diam turun
    // ke ongkir-saja (gerbang konfirmasi Bossfren, tambal bug laten `sort[0]`).
    if (raw.ambiguous.length > 0) {
      const first = raw.ambiguous[0];
      return { status: 'item_ambiguous', keyword: first.name, itemCandidates: first.candidates };
    }
    // <<< ANGGA
    const semuaCocok = raw.matched.length > 0 && raw.unmatched.length === 0;
    const shippingOnly = !semuaCocok;
    const resolved = semuaCocok
      ? raw
      : { matched: [], unmatched: raw.unmatched, totalGrams: cfg.defaultWeightGrams, totalPrice: 0 };
    const weightKg = gramsToKg(resolved.totalGrams);

    if (shippingOnly) this.beratSeragam = await this.cekBeratSeragam(cfg.defaultWeightGrams);

    // Langkah 5 — cek ongkir TANPA COD dulu, lalu terapkan Rule 1.
    const estimates = await this.mengantar.estimate({ destinationId, weightKg });
    // >>> ANGGA — E4: jejak warn untuk semua jalan keluar gagal di bawah.
    if (estimates === null) {
      this.logger.warn(`Ongkir gagal [api_error]: estimate ${target.city} (dest ${destinationId}, ${weightKg}kg) mengembalikan null`);
      return { status: 'api_error' };
    }
    const passing = Object.entries(estimates).filter(
      ([name, est]) =>
        est && typeof est === 'object' && passesCourierFilter(name, est, cfg.courierExclude),
    );
    // Rule 10 — API hidup tapi 0 kurir lolos: diperlakukan sama seperti API mati.
    if (passing.length === 0) {
      this.logger.warn(
        `Ongkir gagal [no_courier]: ${target.city} — kurir dari API: [${Object.keys(estimates).join(', ')}], semua gugur filter (exclude: [${(cfg.courierExclude ?? []).join(', ')}] / unsupported/tarif tak sah)`,
      );
      return { status: 'no_courier' };
    }

    // Langkah 6 — pilih kurir, COD-aware.
    const perf = await this.mengantar.performance(target.city, estimates);
    if (perf === null) {
      this.logger.warn(`Ongkir gagal [api_error]: performance API utk ${target.city} mengembalikan null/bentuk tak dikenal`);
      return { status: 'api_error' };
    }

    const passingNames = passing.map(([name]) => name);
    const transferCourier = pickCourier(passingNames, perf);
    if (!transferCourier) {
      this.logger.warn(`Ongkir gagal [no_courier]: ${target.city} — pickCourier nihil dari kandidat [${passingNames.join(', ')}]`);
      return { status: 'no_courier' };
    }
    // <<< ANGGA

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
    const transferTotal = roundTo(transferRaw, cfg.priceRoundingIncrement);

    // >>> ANGGA — Fase 113 (2026-08-04): diskon ONGKIR, opsi C ketok palu
    // Bossfren. 20% dihitung dari ONGKIR (bukan dari total transfer/COD), dan
    // dibulatkan ke BAWAH lewat `floorTo` — lihat komentar di sana kenapa
    // `roundTo` tidak bisa dipakai ulang untuk ini. shippingOnly tidak dapat
    // diskon: belum ada total checkout yang bisa dipotong, cuma ongkir 1 pcs.
    const shippingDiscount = shippingOnly
      ? 0
      : floorTo(transferShipping * (cfg.shippingDiscountPercentMax / 100), cfg.priceRoundingIncrement);
    const transferTotalDiscounted = shippingDiscount > 0 ? transferTotal - shippingDiscount : 0;
    // <<< ANGGA

    // Langkah 8 — codFee akurat, SELALU dari API (Rule 6), tidak pernah dihitung
    // sendiri dengan persentase apa pun.
    let codTotal: number | null = null;
    let codCourierFinal: string | null = null;
    let codShippingFee: number | null = null; // >>> ANGGA <<<
    let codDiscount: number | null = null; // >>> ANGGA <<<
    let codTotalDiscounted: number | null = null; // >>> ANGGA <<<
    if (codCourier) {
      const codShipping = Number(estimates[codCourier]?.estimatedPrice ?? 0);
      const codAmount = goodsTotal + codShipping;
      const withCod = await this.mengantar.estimate({ destinationId, weightKg, codAmount });
      if (withCod === null) {
        this.logger.warn(`Ongkir gagal [api_error]: estimate COD ${target.city} (dest ${destinationId}) mengembalikan null`); // >>> ANGGA — E4 <<<
        return { status: 'api_error' };
      }
      const codFee = Number(withCod[codCourier]?.codFee ?? 0);
      if (codFee > 0) {
        codCourierFinal = codCourier;
        codTotal = roundTo(goodsTotal + codShipping + codFee, cfg.priceRoundingIncrement);
        codShippingFee = codShipping; // >>> ANGGA <<<
        // >>> ANGGA — Fase 113: diskon sisi COD dihitung dari ongkir COD-nya
        // SENDIRI, simetris dengan sisi transfer — kurir transfer & COD bisa
        // beda (tarif beda), jadi tidak boleh berbagi satu angka diskon.
        if (!shippingOnly) {
          codDiscount = floorTo(codShipping * (cfg.shippingDiscountPercentMax / 100), cfg.priceRoundingIncrement);
          codTotalDiscounted = codDiscount > 0 ? codTotal - codDiscount : 0;
        }
        // <<< ANGGA
      }
      // codFee tidak masuk akal (<= 0) → jangan tawarkan COD, jangan tebak.
    }

    // >>> ANGGA — addendum v2 P1: diskon BARANG per-pcs (kebijakan
    // `discountMaxPerPcs` yang sebelumnya cuma dokumentasi — transkrip CS
    // membuktikan dipakai nyata: 149→144, 199→194 = 5rb/pcs). Dihitung
    // SISTEM, dibulatkan ke BAWAH (tidak pernah melewati plafon), keluar
    // sebagai token `{{diskon_barang}}`/`{{total_*_nego}}` — model tidak
    // pernah menghitung diskon. shippingOnly tidak dapat (belum ada barang).
    const totalQty = resolved.matched.reduce((sum, m) => sum + m.qty, 0);
    const goodsDiscount = shippingOnly
      ? 0
      : floorTo(cfg.discountMaxPerPcs * totalQty, cfg.priceRoundingIncrement);
    // <<< ANGGA

    // Langkah 9 — dua angka akhir, dibulatkan (Rule 11).
    const quote: ShippingQuote = {
      city: target.city,
      province: target.province,
      destinationId,
      weightKg,
      goodsTotal,
      // >>> ANGGA — Q-Chain v3 (ketok Bossfren): estimasi tiba dari
      // `estimatedDate` kurir transfer (fallback kurir COD) — apa adanya dari
      // API ("x-y hari"), tidak pernah dihitung sendiri.
      eta:
        (estimates[transferCourier]?.estimatedDate ?? '').trim() ||
        (codCourierFinal ? (estimates[codCourierFinal]?.estimatedDate ?? '').trim() : '') ||
        null,
      // <<< ANGGA
      transferCourier,
      transferTotal,
      codCourier: codCourierFinal,
      codTotal,
      codEligible: codCourierFinal !== null,
      codBlockedReason: codCourierFinal
        ? null
        : regionBlocked
          ? 'region'
          : 'no_eligible_courier',
      shippingOnly, // >>> ANGGA <<<
      unmatchedNames: resolved.unmatched, // >>> ANGGA <<<
      // Sengaja item MENTAH hasil ekstraksi (bukan nama katalog): dipakai untuk
      // membandingkan "isi order masih sama?" saat memutuskan cache masih sah.
      items: input.items.map((i) => ({
        name: i.name,
        qty: Number.isFinite(i.qty) && i.qty > 0 ? Math.floor(i.qty) : 1,
      })),
      // >>> ANGGA — Fase 113: sumber katalog penanda `{{token}}`, TIDAK PERNAH
      // dibaca LLM langsung (lihat buildPriceTokens/katalogPenanda di bawah).
      matchedItems: resolved.matched.map((m) => ({
        productId: m.productId, // >>> ANGGA — Order Context Log: identitas utk snapshot log <<<
        sku: m.sku, // >>> ANGGA — Order Context Log <<<
        name: m.name,
        qty: m.qty,
        unitPrice: m.price,
        lineTotal: m.qty * m.price,
      })),
      shippingFee: transferShipping,
      shippingDiscount,
      transferTotalDiscounted,
      codShippingFee,
      codDiscount,
      codTotalDiscounted,
      // >>> ANGGA — addendum v2 P1 <<<
      goodsDiscount,
      transferTotalNego: goodsDiscount > 0 ? Math.max(0, (shippingDiscount > 0 ? transferTotalDiscounted : transferTotal) - goodsDiscount) : 0,
      codTotalNego:
        codTotal != null && goodsDiscount > 0
          ? Math.max(0, ((codDiscount ?? 0) > 0 && codTotalDiscounted != null ? codTotalDiscounted : codTotal) - goodsDiscount)
          : null,
      // <<< ANGGA
    };
    return { status: 'ok', quote };
  }

  // ── Langkah 10 — teks yang disuntik ke prompt ─────────────────────────────

  /**
   * >>> ANGGA — Fase 113 (2026-08-04): kasus 'ok' tidak lagi merangkai angka
   * jadi kalimat. Ia merangkai KATALOG PENANDA `{{token}}` yang tersedia untuk
   * kutipan ini (lihat `katalogPenanda`) — model menaruh penandanya, sistem
   * mengisi nilainya sesudah model selesai (`resolvePriceTokens`, dipanggil
   * dari AiService). Rincian mentah (price/estimatedSpecialPrice/codFee) tetap
   * TIDAK PERNAH ikut, sama seperti sebelumnya — cuma bentuknya yang berubah
   * dari "angka jadi" menjadi "nama penanda".
   */
  /**
   * >>> ANGGA — Q-Chain (2026-08-05, KETOK + MANDAT KERAS Bossfren, blueprint
   * dok 08 v2): pertanyaan funnel BERIKUTNYA untuk giliran JAWABAN UANG.
   * Langkah TIDAK disimpan — diturunkan ulang dari data (memori order +
   * kutipan), jadi belokan pelanggan otomatis "lompat ke slot kosong pertama".
   * Urutan pakem: barang → alamat(ongkir saja) → konklusi keranjang (produk>1)
   * → qty → total+metode. Anti-cerewet: satu langkah maks 2x per segmen
   * (event `funnel_ask`). Return null = tidak ada directive (belokan, nego,
   * pertanyaan wajib lain, funnel mati, atau sudah mentok cap).
   */
  /** >>> ANGGA — refactor (2026-08-06, audit grounding #2+#4): SATU sumber
   *  kebenaran untuk "sinyal umum obrolan order/uang" — irisan kondisi yang
   *  DULU disalin terpisah di `jawabanUang` (funnelDirective) dan
   *  `obrolanOrder` (getGroundingText). Dekomposisi OR murni, TIDAK mengubah
   *  perilaku salah satu pemanggil lama (asosiatif/komutatif) — cuma
   *  menghilangkan salinan gandanya supaya tidak bisa drift lagi. <<< */
  private isBridgeCommonSignal(teks: string, viaPilihan: boolean, oc: OrderContextSettings): boolean {
    return (
      viaPilihan === true ||
      adaKataTanyaUang(teks, oc.orderMoneyAskKeywords) ||
      hasAggregateKeyword(teks, oc.orderAggregateKeywords) ||
      PLACE_HINT.test(teks) ||
      ORDER_CHANGE_HINT.test(teks)
    );
  }

  /** >>> ANGGA — refactor (2026-08-06, audit grounding #2+#4): definisi
   *  "obrolan order" versi F2 (2026-08-05, insiden "halo") — sengaja lebih
   *  sempit dari `jawabanUang` (funnel), makanya PUNYA kondisi tambahan
   *  sendiri (deixis/referensi/afirmasi utuh) di atas sinyal umum. Dipakai
   *  di `getGroundingText` (kapan directive ASUMSI disuntik) DAN di gerbang
   *  bridge-enforcement `resolvePriceTokens` (temuan audit #2: gerbang itu
   *  dulu TIDAK mengecek kondisi ini sama sekali — bisa menahan draft untuk
   *  aturan yang giliran itu tidak pernah diberitahukan ke model). <<< */
  private isObrolanOrder(teks: string, viaPilihan: boolean, oc: OrderContextSettings): boolean {
    return (
      this.isBridgeCommonSignal(teks, viaPilihan, oc) ||
      hasAggregateKeyword(teks, oc.orderDeixisKeywords) ||
      hasAggregateKeyword(teks, oc.orderReferenceKeywords) ||
      wholeMessageMatch(teks, oc.orderAffirmationKeywords, oc.orderFillerWords, oc.orderNegationKeywords)
    );
  }

  private async funnelDirective(
    conversationId: string,
    lastMsgId: string,
    lang: string,
    opts: { quote?: ShippingQuote; hargaTurn?: boolean },
  ): Promise<{ teks: string | null; step: string } | null> {
    if (!this.orderLog) return null;
    const oc = await this.settings.orderContext();
    if (oc.orderFunnelEnabled === false) return null;

    // Directive hanya untuk giliran JAWABAN UANG (harga/ongkir/qty/total) —
    // belokan/basa-basi TIDAK didorong (ketok Bossfren: "ikuti alur customer").
    const memoG = this.turnMemo.get(conversationId);
    const teksG = memoG?.lastText ?? '';
    // >>> ANGGA — Q-Chain fix (2026-08-05, insiden "banyumas kak"): giliran
    // yang ME-RESOLVE pilihan (jawaban atas pertanyaan tujuan/barang/keranjang
    // kita sendiri) dihitung giliran uang WALAU teksnya tanpa kata uang —
    // "banyumas kak" adalah jawaban ongkir, funnel wajib lanjut, bukan diam. <<<
    // >>> ANGGA — refactor (2026-08-06, audit grounding #2+#4): "sinyal
    // umum obrolan order/uang" sekarang SATU definisi bersama
    // (`isBridgeCommonSignal`), dipakai di sini DAN di `getGroundingText`
    // (obrolanOrder) DAN di gerbang bridge-enforcement (`resolvePriceTokens`)
    // — sebelumnya tiga tempat ini punya salinan kondisi masing-masing yang
    // bisa drift diam-diam kapan saja satu diedit tanpa yang lain ikut.
    // `hargaTurn`/`patchQty` TETAP kondisi tambahan KHUSUS funnel (giliran
    // harga/qty yang belum tentu "obrolan order" versi grounding ASUMSI),
    // diOR-kan eksplisit di sini, bukan disembunyikan ke fungsi bersama —
    // supaya bedanya kelihatan jelas dan sengaja, bukan drift lagi.
    const jawabanUang =
      opts.hargaTurn === true ||
      patchQty(teksG) != null ||
      this.isBridgeCommonSignal(teksG, memoG?.viaPilihan === true, oc);
    // <<< ANGGA
    if (!jawabanUang) return null;

    const entries = (await this.orderLog.candidates(conversationId)).filter(
      (e) => e.fresh && e.snapshot.items.length > 0,
    );
    const produk = new Map<string, string>();
    for (const e of entries) for (const it of e.snapshot.items) if (!produk.has(it.productId)) produk.set(it.productId, it.name);
    if (opts.quote && !opts.quote.shippingOnly) {
      for (const m of opts.quote.matchedItems) if (m.productId && !produk.has(m.productId)) produk.set(m.productId, m.name);
    }
    // >>> ANGGA — insiden "GSM Naga Merah" (2026-08-05): PENAWARAN segar
    // (seed form/M1) dihitung "barang sudah jelas". Tanpa ini, percakapan
    // yang lahir dari form (jalur traffic utama) dianggap tanpa barang —
    // funnel menanyakan "produknya mana" padahal form sudah menyebutnya,
    // dan model bisa ngarang nama produk lain dari katalog.
    if (produk.size === 0) {
      try {
        for (const o of (await this.orderLog.recentOffers(conversationId)).filter((x) => x.fresh)) {
          for (const it of o.items ?? []) {
            if (it.productId && !produk.has(it.productId)) produk.set(it.productId, it.name);
          }
        }
      } catch { /* penawaran gagal dibaca = anggap tidak ada */ }
    }
    // <<< ANGGA
    // Giliran HARGA (blok harga produk aktif): barang jelas sedang disebut
    // pelanggan walau belum masuk log — jangan salah tanya "produknya mana".
    const adaBarang = produk.size > 0 || opts.hargaTurn === true;
    const adaAlamat =
      (!!opts.quote?.destinationId && opts.quote.destinationId.length > 0) ||
      entries.some((e) => e.snapshot.destinationId);
    const latest = entries[0];
    const perluKonklusi = produk.size > 1 && latest?.snapshot.konklusi !== true;
    const qtyPasti = latest?.snapshot.qtyPasti === true;

    const asks = await this.orderLog.funnelAsks(conversationId);
    // >>> ANGGA — Q-Chain fix 3 (2026-08-05, insiden "cakranegara kak" dijawab
    // rekap total padahal qty belum ditanya-jawab): LANGKAH dan PERTANYAAN
    // dipisah. Anti-cerewet (maks 2x) dan template-kosong hanya MEMBUNGKAM
    // pertanyaannya — TIDAK PERNAH membuka gembok total. Dulu pilih() balik
    // null saat cap kena → tanpa langkah → sensor PRA-TOTAL & gerbang ikut
    // mati → model bebas menyodorkan {{rincian_tagihan}}. Sekarang langkah
    // SELALU dipulangkan (teks null saat capped) + funnelExpect tetap ditulis
    // (kalimat '' = tanpa kewajiban kalimat verbatim, tapi gembok total aktif).
    // >>> ANGGA — fix (2026-08-06, langkah closing): `pilih` kini menerima
    // varian ketiga `closing` (KONFIRMASI pesanan, bukan pertanyaan) — dibuat
    // parameter TERPISAH dari `total` (bukan menumpangi enum yang sama)
    // supaya call-site lama (`pilih('barang', ...)` dkk, cuma 3 argumen)
    // tetap jalan tanpa diubah sama sekali.
    const pilih = (
      step: string,
      kalimat: string,
      total = false,
      closing = false,
    ): { teks: string | null; step: string } => {
      const bersih = (kalimat ?? '').trim();
      const bolehTanya = bersih.length > 0 && (asks[step] ?? 0) < 2;
      if (!bolehTanya) {
        this.cache.setFunnelExpect(conversationId, { messageId: lastMsgId, step, kalimat: '' });
        return { teks: null, step };
      }
      void this.orderLog?.recordFunnelAsk(conversationId, step, lastMsgId);
      this.cache.setFunnelExpect(conversationId, { messageId: lastMsgId, step, kalimat: bersih });
      const varian = closing ? SHIPPING_FUNNEL_CLOSING : total ? SHIPPING_FUNNEL_TOTAL : SHIPPING_FUNNEL_DIRECTIVE;
      return { teks: t(varian, lang)(bersih), step };
    };
    // <<< ANGGA

    if (!adaBarang) return pilih('barang', oc.orderFunnelAskItem);
    if (!adaAlamat) return pilih('alamat', oc.orderFunnelAskAddress);
    if (perluKonklusi) {
      const daftar = [...produk.values()].slice(0, 3).join(' + ');
      const kalimat =
        produk.size <= 2
          ? (oc.orderFunnelAskBasket ?? '').replace(/\{\{daftar_produk\}\}/gi, daftar)
          : oc.orderFunnelAskBasketOpen;
      // Tangga jawaban: kandidat = produk aktif; jawaban agregat = ambil semua.
      this.cache.setPendingItems(conversationId, {
        candidates: [...produk].map(([productId, name]) => ({ productId, name })),
        qty: 1,
        city: latest?.snapshot.city ?? null,
        mode: 'keranjang',
      });
      return pilih('keranjang', kalimat);
    }
    if (!qtyPasti) return pilih('qty', oc.orderFunnelAskQty);

    // >>> ANGGA — Q-Chain v3 (2026-08-05, temuan audit transkrip Aluna+Defa):
    // langkah PATOKAN RUMAH — dua-dua CS selalu menanyakannya setelah metode
    // terjawab, sebelum closing ("boleh dicantumkan patokan rumahnya…?").
    // Metode dianggap TERJAWAB kalau pelanggan menyebut cod/transfer — baik
    // menjawab pertanyaan metode, MAUPUN menyebutnya duluan ("COD deh kak.
    // beli 2 ya") — supaya bot tidak bebal menanyakan metode yang sudah
    // dijawab. Jejaknya dipersist (`funnel_ask` step `metode_terjawab`).
    // >>> ANGGA — Q-Chain v3.1 (2026-08-06, revisi Bossfren atas v3 —
    // "harusnya gak cuman patokan, minta alamat lengkap sekalian, dan kalau
    // transfer tambahin rekeningnya"): kalimat langkah PATOKAN kini BEDA per
    // metode bayar, jadi metode yang terdeteksi/pernah dijawab disimpan
    // eksplisit (bukan cuma boolean "metode_terjawab" seperti sebelumnya) —
    // supaya giliran BERIKUTNYA (yang teksnya sendiri belum tentu menyebut
    // cod/transfer lagi) tetap tahu kalimat mana yang wajib dipakai.
    const isCodNow = /\bcod\b/i.test(teksG);
    const isTransferNow = /\b(tf|transfer)\b/i.test(teksG);
    const sebutMetode = isCodNow || isTransferNow;
    const metodeTerjawab = (asks['metode_terjawab'] ?? 0) >= 1 || sebutMetode;
    if (sebutMetode && !(asks['metode_terjawab'] ?? 0)) {
      void this.orderLog.recordFunnelAsk(conversationId, 'metode_terjawab', lastMsgId);
      void this.orderLog.recordFunnelAsk(conversationId, isCodNow ? 'metode_cod' : 'metode_transfer', lastMsgId);
    }
    // Giliran INI menang kalau menyebut metode eksplisit; kalau tidak, pakai
    // yang tersimpan dari giliran sebelumnya (COD didahulukan pada kasus
    // ambigu langka di mana dua-duanya sempat tersimpan).
    const metodeCod = isCodNow || (!isTransferNow && (asks['metode_cod'] ?? 0) >= 1);
    const metodeTransfer = !metodeCod && (isTransferNow || (asks['metode_transfer'] ?? 0) >= 1);
    // Kalimat baru (alamat lengkap + patokan, +rekening & konfirmasi bukti
    // untuk transfer) — fallback ke `orderFunnelAskLandmark` lama kalau field
    // barunya belum diisi (mis. belum sempat dikonfigurasi ulang dari
    // dashboard) supaya langkah ini TIDAK PERNAH mati gara-gara field kosong.
    const kalimatPatokan = (
      metodeTransfer
        ? oc.orderFunnelAskLandmarkTransfer || oc.orderFunnelAskLandmark
        : oc.orderFunnelAskLandmarkCod || oc.orderFunnelAskLandmark
    ) ?? '';
    // <<< ANGGA
    const totalSudah = (asks['total'] ?? 0) >= 1;
    if (metodeTerjawab) {
      // Metode sudah jelas → TOTAL (kalau belum tersodor) langsung disambung
      // pertanyaan PATOKAN; kalau total sudah pernah tersodor → cek alamat →
      // patokan opsional/wajib → CLOSING.
      if (!totalSudah) return pilih('total', kalimatPatokan, true);

      // >>> ANGGA — fix (2026-08-06, ketok Bossfren "harusnya ini sesi
      // klosing bukan malah nanya lagi"): titik ini DULU SELALU balik ke
      // `pilih('patokan', kalimatPatokan)` tanpa syarat, di GILIRAN APA PUN
      // sesudah total tersodor — begitu pelanggan sudah menjawab alamat
      // lengkap (persis yang diminta di kalimat gabungan v3.1), giliran
      // BERIKUTNYA bot menanyakan PERSIS pertanyaan yang sama lagi alih-alih
      // lanjut closing. Fix: kalau teks giliran ini (digabung dengan yang
      // sudah tersimpan dari giliran sebelumnya, jaga-jaga alamat dikirim
      // bertahap) sudah memuat nama jalan + nomor rumah, PATOKAN OPSIONAL —
      // langsung CLOSING. Kalau belum, patokan tetap WAJIB ditanya — tapi
      // CUMA SEKALI (bukan 2x seperti langkah lain): begitu sudah pernah
      // ditanya sekali, giliran sesudahnya SELALU lanjut closing apa pun
      // isinya, supaya pelanggan tidak terjebak diminta alamat berulang-
      // ulang kalau memang tidak lengkap-lengkap.
      // >>> GEMINI — Pembersihan & Validasi Presisi Alamat (2026-08-06, Mandat Bossfren):
      // 1. Jika teks murni pilihan metode (COD/Transfer), HARAM masuk cache alamat.
      // 2. Teks hanya disimpan ke cache alamat jika VALID memuat penanda lokasi/patokan.
      // 3. Sanitasi otomatis jika ada cache lama yang sempat tercemar "COD aja braderku".
      const rawAlamat = this.cache.addressTextOf(conversationId) ?? '';
      const sanitizedPrev = sanitizeAddressText(rawAlamat);

      let newAddressPart = '';
      if (!isPaymentMethodChoice(teksG)) {
        newAddressPart = teksG.trim();
      }

      const alamatGabungan = [sanitizedPrev, newAddressPart].filter((s) => s.trim()).join('\n');
      if (alamatGabungan !== rawAlamat) {
        this.cache.setAddressText(conversationId, alamatGabungan);
      }
      // <<< GEMINI
      const alamatSudahLengkap = adaAlamatLengkap(alamatGabungan);
      const patokanSudahDitanya = (asks['patokan'] ?? 0) >= 1;
      if (!alamatSudahLengkap && !patokanSudahDitanya) {
        return pilih('patokan', kalimatPatokan);
      }
      const kalimatClosing = (
        metodeTransfer ? oc.orderFunnelClosingTransfer : oc.orderFunnelClosingCod
      ) ?? '';
      return pilih('closing', kalimatClosing, false, true);
      // <<< ANGGA
    }
    // Invariant Bossfren: metode TIDAK PERNAH ditanya sebelum total tersodor —
    // pertanyaan metode selalu satu paket dengan penyodoran {{rincian_tagihan}}.
    return pilih('total', oc.orderFunnelAskPayment, true);
    // <<< ANGGA
  }
  // <<< ANGGA

  async getGroundingText(conversationId: string, lang = 'id'): Promise<string> {
    // >>> ANGGA — keputusan Bossfren 2026-08-06 (audit grounding #3): toko ini
    // Indonesia-only, dan katalogPenanda()+belasan lines.push('• …') di bawah
    // 100% hardcode Bahasa Indonesia tanpa pernah menerima `lang` — sementara
    // sebagian instruksi lain (SHIPPING_GROUNDING_*) SUDAH id/en. Kalau ada
    // bot di-set 'en' (opsi ini beneran ada di pengaturan bot web), giliran
    // itu dapat grounding campur aduk setengah Inggris setengah Indonesia.
    // Daripada menambal separuh (scope-nya besar: setiap baris katalog +
    // larangan keras perlu versi Inggris), keputusannya: grounding order
    // SELALU Bahasa Indonesia, parameter `lang` di sini sengaja diabaikan.
    // (Bagian LAIN dari sistem — ekstraksi SHIPPING_EXTRACT_*, dst — TIDAK
    // ikut berubah, ini scope-nya cuma teks grounding order/ongkir.)
    lang = 'id';
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
        // >>> ANGGA: kutipan ONGKIR SAJA punya bentuk kalimat sendiri — angka
        // ini ongkir, BUKAN total belanja, dan bot harus menyebutnya begitu.
        if (q.shippingOnly) {
          const lines = [
            t(SHIPPING_MONEY_RULE, lang),
            t(SHIPPING_GROUNDING_DATA_READY, lang), // >>> ANGGA — P2 <<<
            t(SHIPPING_GROUNDING_SHIPPING_ONLY, lang),
            ...katalogPenanda(q),
          ];
          if (!this.beratSeragam) {
            lines.push(
              '• PENTING: {{ongkir}} ini ongkir MULAI DARI (ada produk yang lebih berat dari standar 1 pcs) — sebut sebagai perkiraan, jangan sebagai angka pasti final.',
            );
          }
          if (q.unmatchedNames?.length) {
            lines.push(`• Barang "${q.unmatchedNames.join('", "')}" belum cocok dengan katalog — pastikan dulu produknya.`);
          }
          // >>> ANGGA — Order Context Log T4: kutipan LENGKAP jatuh jadi
          // ongkir-saja PADAHAL log masih punya order segar = pola insiden
          // "sistem kehilangan konteks" (bukan pelanggan batal). Bot disuruh
          // konfirmasi ulang barang lama dengan menyebut namanya, dan admin
          // dapat jejak warn di log server.
          if (this.orderLog) {
            const freshOld = await this.orderLog.latestFresh(conversationId);
            if (freshOld?.snapshot.items.length) {
              const names = freshOld.snapshot.items.map((i) => `${i.qty} pcs ${i.name}`).join(', ');
              lines.push(t(SHIPPING_GROUNDING_CONTEXT_DOWNGRADE, lang)(names));
              this.logger.warn(
                `Downgrade konteks ${conversationId}: kutipan jatuh ke ongkir-saja padahal log masih segar (${names})`,
              );
            }
          }
          // <<< ANGGA
          // >>> ANGGA — Q-Chain: jawaban ongkir-saja juga JAWABAN UANG —
          // wajib menyeret pertanyaan funnel (paling sering: tanya barang).
          {
            const memoQ = this.turnMemo.get(conversationId);
            const msgIdQ = (memoQ?.key ?? '').split(':')[0] || '';
            const arah = await this.funnelDirective(conversationId, msgIdQ, lang, { quote: q });
            if (arah?.teks) lines.push(arah.teks);
          }
          // <<< ANGGA
          return lines.join('\n');
        }
        // >>> GEMINI — Deteksi Pasca-Metode & Langkah Closing Murni (2026-08-06):
        // (1) Evaluasi kondisi closing secara murni (tanpa memanggil funnelDirective lebih awal agar tidak merusak side-effect Postgres/cache).
        // (2) Jika total & metode sudah terjawab, hidePriceUnits = true KHUSUS di langkah tengah (patokan) agar LLM tidak berhitung "+" manual.
        // (3) Pada langkah 'closing', hidePriceUnits WAJIB false agar {{daftar_produk_harga}} terisi utuh "Produk: X 💰 Harga: RpY"
        //     sehingga Money Gate template closing resmi AppSettings LULUS 100%.
        const memoNego = this.turnMemo.get(conversationId);
        const asksGrounding: Record<string, number> = (await this.orderLog?.funnelAsks(conversationId).catch(() => ({}))) ?? {};
        const teksMemoG = memoNego?.lastText ?? '';
        const metodeTerjawabG = /\b(cod|bayar\s*di\s*tempat|tf|trf|trx|transfer|rekening)\b/i.test(teksMemoG) || (asksGrounding['metode_terjawab'] ?? 0) >= 1;
        const totalSudahG = (asksGrounding['total'] ?? 0) >= 1 || metodeTerjawabG;

        const rawAlamatG = this.cache.addressTextOf(conversationId) ?? '';
        const sanitizedAlamatG = sanitizeAddressText(rawAlamatG);
        const alamatSudahLengkapG = adaAlamatLengkap(sanitizedAlamatG);
        const patokanSudahDitanyaG = (asksGrounding['patokan'] ?? 0) >= 1;
        const isClosingStepG = totalSudahG && metodeTerjawabG && (alamatSudahLengkapG || patokanSudahDitanyaG);

        const hidePriceUnits = totalSudahG && metodeTerjawabG && !isClosingStepG;

        const lines = [
          t(SHIPPING_MONEY_RULE, lang),
          t(SHIPPING_GROUNDING_DATA_READY, lang), // >>> ANGGA — P2 <<<
          t(SHIPPING_GROUNDING_INTRO, lang),
          ...katalogPenanda(q, hidePriceUnits),
        ];
        // <<< GEMINI
        if (q.codBlockedReason === 'region') {
          lines.push('• COD TIDAK tersedia untuk wilayah ini (kebijakan toko). Tawarkan transfer saja.');
        } else if (!q.codCourier) {
          lines.push('• COD tidak tersedia untuk tujuan ini. Tawarkan transfer saja.');
        }
        // >>> ANGGA — Order Context Log: kutipan giliran ini dihitung dari
        // ASUMSI order berjalan (carry-over/agregat) → jawaban wajib menyebut
        // barangnya (bridge-validasi; ditegakkan kode di `resolvePriceTokens`,
        // baris ini instruksinya).
        // >>> ANGGA — F2 (2026-08-05, insiden "halo"): directive ini MEMAKSA
        // model merekap order ("WAJIB sebut nama barang + totalnya") — pantas
        // hanya kalau pesan terakhir memang obrolan order/uang. Flag assumed
        // bisa tersisa dari giliran uang sebelumnya (TTL memo) sementara
        // pelanggan sudah pindah ke basa-basi; tanpa gerbang ini, "halo"/
        // "makasih kak" dengan cache hangat ikut dijawab rekap.
        const assumed = this.cache.assumed(conversationId);
        const oc = await this.settings.orderContext();
        const teksTerakhir = memoNego?.lastText ?? '';
        // >>> ANGGA — refactor (2026-08-06, audit grounding #2+#4): pindah
        // ke definisi bersama `isObrolanOrder` (lihat komentarnya) — perilaku
        // IDENTIK dengan sebelumnya (dekomposisi OR murni), cuma sumbernya
        // sekarang satu tempat, dipakai juga oleh gerbang bridge-enforcement
        // di resolvePriceTokens (menutup temuan audit #2: gerbang itu dulu
        // tidak mengecek kondisi ini sama sekali).
        const obrolanOrder = this.isObrolanOrder(teksTerakhir, memoNego?.viaPilihan === true, oc);
        // <<< ANGGA
        if (assumed?.productNames.length && obrolanOrder) {
          lines.push(t(SHIPPING_GROUNDING_ASSUMED, lang)(assumed.productNames.join(', ')));
        }
        // <<< ANGGA
        // >>> ANGGA — addendum v2 P2: tangga NEGO. Deteksi deterministik frasa
        // nego di pesan terakhir; ronde 1 → sodorkan token nego (P1, dihitung
        // sistem dari plafon AppSetting); ronde ≥2 → JANGAN berjanji, katakan
        // dicek ke atasan + notifikasi instan ke admin (pola notifikasi
        // gerbang uang; sekali per pesan lewat pagar bumpNego).
        let adaNego = false; // >>> ANGGA — Q-Chain: nego punya kalimat lanjutan sendiri <<<
        if (memoNego) {
          if (hasAggregateKeyword(memoNego.lastText, oc.orderNegoKeywords)) {
            adaNego = true; // >>> ANGGA — Q-Chain <<<
            const msgId = memoNego.key.split(':')[0] || memoNego.key;
            const ronde = this.cache.bumpNego(conversationId, msgId);
            const adaTokenNego = (q.goodsDiscount ?? 0) > 0 || q.shippingDiscount > 0;
            if (ronde <= 1 && adaTokenNego) {
              lines.push(t(SHIPPING_GROUNDING_NEGO_OFFER, lang));
            } else {
              lines.push(t(SHIPPING_GROUNDING_NEGO_STUCK, lang));
              this.logger.warn(`Nego mentok plafon di ${conversationId} (ronde ${ronde})`);
              this.notifications?.send(
                `🤝 Nego melewati plafon diskon\nPercakapan: ${conversationId}\nPesan: "${memoNego.lastText.slice(0, 120)}"\nBot menahan janji & menyarankan cek admin.`,
              );
            }
          }
        }
        // <<< ANGGA
        // >>> ANGGA — Q-Chain (2026-08-05, MANDAT KERAS Bossfren): JAWABAN
        // UANG wajib menutup dengan pertanyaan langkah funnel berikutnya —
        // kecuali giliran nego (punya kalimat lanjutan sendiri).
        if (!adaNego) {
          const msgIdQ = (memoNego?.key ?? '').split(':')[0] || '';
          const arah = await this.funnelDirective(conversationId, msgIdQ, lang, { quote: q });
          if (arah) {
            // >>> ANGGA — Q-Chain fix 2 (2026-08-05, insiden "mataram dobel"):
            // langkah PRA-TOTAL (barang/alamat/keranjang/qty) = total BELUM
            // BOLEH tersodor (ketok Bossfren: "ditotalin itu jika qty udah
            // jelas dijawab"). Baris katalog kelas total DIBUANG dari giliran
            // ini supaya model tidak tergoda; gerbang di `resolvePriceTokens`
            // menahan kalau model tetap menulis penandanya sendiri.
            if (PRA_TOTAL_STEPS.has(arah.step)) {
              this.buangBarisTotalDariKatalog(lines);
              lines.push(
                arah.teks
                  ? '• LARANGAN KERAS GILIRAN INI: JANGAN menyodorkan subtotal/total/rekap tagihan — jumlah pesanan belum pasti. Jawab yang ditanya (mis. ongkir/harga) SINGKAT satu kalimat, tanpa narasi proses, lalu tutup dengan pertanyaan wajib di bawah.'
                  : `• LARANGAN KERAS GILIRAN INI: JANGAN menyodorkan subtotal/total/rekap tagihan — jumlah pesanan belum pasti (langkah "${arah.step}" belum terjawab). Jawab yang ditanya (mis. ongkir/harga) SINGKAT satu kalimat, lalu tutup dengan menanyakan info langkah itu memakai bahasamu sendiri yang santai (pertanyaan bakunya sudah pernah ditanyakan — jangan diulang persis).`,
              );
            }
            // <<< ANGGA
            // >>> ANGGA — fix (2026-08-06, insiden "cod aja kak" diulang
            // totalan): langkah PATOKAN (metode terjawab + total SUDAH
            // pernah tersodor) juga HARAM mengulang rincian total — beda
            // alasan dari PRA-TOTAL (di situ "belum pasti", di sini "sudah
            // pernah dikasih, jangan direkap lagi"). Baris katalog kelas
            // total ikut dibuang; gerbang di `resolvePriceTokens` menahan
            // draft yang tetap menulis penandanya sendiri.
            if (arah.step === 'patokan') {
              this.buangBarisTotalDariKatalog(lines);
              // >>> GEMINI — Pembersihan Spesifik Patokan (2026-08-06): buang seluruh penanda harga (termasuk harga_satuan & ongkir) khusus langkah patokan agar LLM tidak berhitung "+" manual
              this.buangSemuaTokenHargaDariKatalog(lines);
              lines.push(
                '• LARANGAN KERAS GILIRAN INI: total/rincian tagihan SUDAH pernah disodorkan di giliran sebelumnya — JANGAN mengulang subtotal/total/rekap tagihan lagi. Jawab singkat (mis. konfirmasi metode) lalu tutup dengan pertanyaan patokan di bawah.',
              );
              // <<< GEMINI
            }
            // <<< ANGGA
            if (arah.teks) lines.push(arah.teks);
          } else if (adaKataTanyaUang(teksTerakhir, oc.orderMoneyAskKeywords)) {
            // >>> ANGGA — WATCHDOG PAKEM (2026-08-05): giliran tanya-uang
            // berkutipan TANPA langkah funnel sama sekali = anomali bisu
            // (funnel mati/log kosong/klasifikasi meleset) — bunyikan, jangan
            // diam. Ini kelas insiden yang tidak bisa direvisi model. <<<
            this.logger.warn(
              `Watchdog pakem: giliran tanya-uang di ${conversationId} keluar TANPA langkah funnel (funnel mati / log kosong / klasifikasi giliran meleset?)`,
            );
          }
        }
        // <<< ANGGA
        return lines.join('\n');
      }
      // >>> ANGGA — Order Context Log: tangga BARANG. Penanda uang SENGAJA
      // tidak disediakan untuk giliran ini (enforcement kode, bukan harapan).
      // >>> ANGGA — ketok Bossfren 2026-08-05 (insiden "golok sembelih" →
      // "konfirmasi dulu ke admin"): pola sama dengan tujuan (P0) — cocok
      // TEPAT 2 → pertanyaan TERTUTUP "A atau B?"; cocok >2 → pertanyaan
      // TERBUKA "X-nya yang mana?" TANPA membacakan daftar (jangan sotoy,
      // daftar panjang menenggelamkan jawaban). Semua kandidat tetap
      // tersimpan di pendingItems — jawaban pelanggan dicocokkan ke SEMUA.
      case 'item_ambiguous': {
        if (result.itemCandidates.length > MAX_CHOICES_ASKED) {
          // >>> ANGGA — GERBANG PAKEM (2026-08-05, ketok Bossfren): pertanyaan
          // terbuka barang bukan lagi sekadar prompt — jadi KEWAJIBAN gerbang
          // (pola MANDAT funnel): draft tanpa kalimatnya → feedback → revisi →
          // tahan. <<<
          this.setExpectGiliran(conversationId, 'barang_ambigu', `${(result.keyword ?? '').trim()}-nya yang mana ya kak?`);
          return t(SHIPPING_GROUNDING_ITEM_AMBIGUOUS_OPEN, lang)(result.keyword ?? '');
        }
        return (
          t(SHIPPING_GROUNDING_ITEM_AMBIGUOUS, lang) +
          '\n' +
          result.itemCandidates
            .slice(0, MAX_CHOICES_ASKED)
            .map((c) => `• ${c.name}`)
            .join('\n')
        );
      }
      // <<< ANGGA
      case 'ambiguous': {
        // >>> ANGGA — P0 (KETOK Bossfren 2026-08-05, membatalkan tangga
        // tertutup 2026-08-03 sebagai pertanyaan PERTAMA): >1 kandidat →
        // pertanyaan TERBUKA-JUJUR format ketok ("X-nya mana ya kak? boleh
        // sebut provinsinya, atau langsung kecamatannya") — daftar kandidat
        // TIDAK dibacakan, karena potongan 50 baris bisa menenggelamkan
        // jawaban yang benar (insiden Mataram NTB vs Lampung). Pertanyaan
        // TERTUTUP tetap dipakai untuk SUBSET hasil penyempitan jawaban
        // ("yang lampung kak" → 2 kandidat Lampung dibacakan). Tangga lanjut:
        // ronde 2 minta kecamatan, ronde 3 serahkan admin.
        const ronde = this.cache.askCount(conversationId);
        if (ronde > MAX_DESTINATION_ASKS) return t(SHIPPING_GROUNDING_DESTINATION_STUCK, lang);
        if (result.sempit) {
          // Penyempitan = kemajuan, bukan mentok — bacakan tertutup walau ronde ≥2.
          return (
            t(SHIPPING_GROUNDING_AMBIGUOUS, lang) +
            '\n' +
            result.candidates
              .slice(0, MAX_CHOICES_ASKED)
              .map((c) => `• ${c.label}`)
              .join('\n')
          );
        }
        if (ronde > 1) {
          // >>> ANGGA — GERBANG PAKEM: giliran minta-kecamatan wajib benar-benar
          // memintanya (insiden "sandubaya": draft malah "konfirmasi ke admin").
          // Fix 2026-08-06 (insiden "Kab. Purwokerto ngaco"): kalimatnya kini
          // DIRAKIT DARI result.keyword (fakta sah) dan DIKUNCI verbatim lewat
          // funnelExpect — sebelumnya cuma kata bebas "kecamatan", model bebas
          // mengarang nama kabupaten palsu di sekelilingnya. <<<
          const nmD = (result.keyword ?? '').trim() || 'tujuannya';
          const rapiD = nmD.charAt(0).toUpperCase() + nmD.slice(1);
          const kalimatD = `${rapiD}nya itu kecamatan apa ya kak?`;
          this.setExpectGiliran(conversationId, 'minta_kecamatan', kalimatD);
          return t(SHIPPING_GROUNDING_ASK_DISTRICT, lang)(kalimatD);
        }
        // >>> ANGGA — GERBANG PAKEM (2026-08-05): pertanyaan terbuka tujuan
        // (format ketok) jadi KEWAJIBAN gerbang, bukan sekadar prompt.
        // Kalimatnya WAJIB cermin persis kutipan di SHIPPING_GROUNDING_
        // AMBIGUOUS_OPEN (emoji/tanda baca diabaikan pencocok normF). <<<
        {
          const nm = (result.keyword ?? '').trim() || 'tujuannya';
          const rapi = nm.charAt(0).toUpperCase() + nm.slice(1);
          this.setExpectGiliran(
            conversationId,
            'tujuan_ambigu',
            `${rapi}nya mana ya kak? boleh sebut provinsinya, atau langsung kecamatannya`,
          );
        }
        return t(SHIPPING_GROUNDING_AMBIGUOUS_OPEN, lang)(result.keyword ?? '');
      }
      // <<< ANGGA
      case 'need_more_detail': {
        // Tidak ada pertanyaan tertutup yang bisa diajukan di sini, jadi
        // tangga 1 langsung kecamatan, tangga 2 tawarkan provinsi/kota besar.
        const ronde = this.cache.askCount(conversationId);
        if (ronde > MAX_DESTINATION_ASKS) return t(SHIPPING_GROUNDING_DESTINATION_STUCK, lang);
        const nmP = (result.keyword ?? '').trim() || 'tujuannya';
        const rapiP = nmP.charAt(0).toUpperCase() + nmP.slice(1);
        if (ronde > 1) {
          // >>> ANGGA — GERBANG PAKEM (2026-08-06, insiden "Kab. Purwokerto
          // ngaco"): tangga ini SEBELUMNYA tidak punya funnelExpect SAMA
          // SEKALI (satu-satunya tangga tujuan yang ungated) — model bebas
          // menulis apa pun termasuk mengarang nama kabupaten. Kini dikunci
          // verbatim sama seperti tangga-tangga tujuan lainnya. <<<
          const kalimatP = `${rapiP}nya itu di provinsi apa atau deket kota besar mana ya kak?`;
          this.setExpectGiliran(conversationId, 'minta_provinsi', kalimatP);
          return t(SHIPPING_GROUNDING_ASK_PROVINCE, lang)(kalimatP);
        }
        // >>> ANGGA — GERBANG PAKEM: wajib benar-benar meminta kecamatan,
        // bukan menggantung "konfirmasi ke admin" (insiden "sandubaya").
        // Fix 2026-08-06: kalimat dirakit dari result.keyword dan dikunci
        // verbatim (lihat catatan di atas). <<<
        const kalimatD2 = `${rapiP}nya itu kecamatan apa ya kak?`;
        this.setExpectGiliran(conversationId, 'minta_kecamatan', kalimatD2);
        return t(SHIPPING_GROUNDING_NEED_DETAIL, lang)(kalimatD2);
      }
      case 'unresolved_items':
        return t(SHIPPING_GROUNDING_UNRESOLVED_ITEMS, lang);
      case 'no_destination': {
        // >>> ANGGA — Order Context Log (keputusan Bossfren 2026-08-04):
        // konteks BASI haram dipakai menjawab angka, tapi HALAL dipakai
        // menyusun pertanyaan. Pertanyaan berbau uang ("kemaren lusa total
        // berapa?") saat semua entri sudah basi → suruh bot bertanya smooth
        // dengan MENYEBUT order lama, tanpa angka apa pun.
        if (this.orderLog) {
          const lastText = this.turnMemo.get(conversationId)?.lastText ?? '';
          // >>> ANGGA — F1 (2026-08-05): regex hardcoded lama diganti daftar
          // AppSetting yang sama dengan gerbang log-hit — SATU sumber kebijakan
          // "apa itu pertanyaan uang".
          const ocStale = await this.settings.orderContext();
          if (adaKataTanyaUang(lastText, ocStale.orderMoneyAskKeywords)) {
            // <<< ANGGA
            const entry = await this.orderLog.latestAny(conversationId);
            if (entry && !entry.fresh) {
              const desc =
                entry.snapshot.items.map((i) => `${i.qty} pcs ${i.name}`).join(', ') +
                (entry.snapshot.city ? ` → ${entry.snapshot.city}` : '');
              return t(SHIPPING_GROUNDING_STALE_CONTEXT, lang)(desc);
            }
          }
        }
        // <<< ANGGA
        // >>> ANGGA — Q-Chain (2026-08-05): giliran HARGA — pelanggan bertanya
        // harga (blok harga produk aktif) dan kutipan ongkir belum ada →
        // jawaban harga WAJIB menutup dengan pertanyaan alamat (ongkir saja,
        // revisi Bossfren: JANGAN menjanjikan "total kiriman" di tahap ini).
        {
          const tokensHarga = this.cache.getProductPriceTokens(conversationId);
          if (Object.keys(tokensHarga ?? {}).length) {
            const memoH = this.turnMemo.get(conversationId);
            const teksH = memoH?.lastText ?? '';
            const ocH = await this.settings.orderContext();
            if (adaKataTanyaUang(teksH, ocH.orderMoneyAskKeywords)) {
              const arah = await this.funnelDirective(
                conversationId,
                (memoH?.key ?? '').split(':')[0] || '',
                lang,
                { hargaTurn: true },
              );
              if (arah?.teks) return arah.teks;
            }
          }
        }
        // <<< ANGGA
        // Belum ada tujuan yang disebut sama sekali → tidak ada apa pun yang
        // perlu disuntik soal ongkir untuk giliran balasan ini.
        return '';
      }
      case 'no_courier':
      case 'api_error':
      case 'not_configured':
      default:
        // >>> ANGGA — GERBANG PAKEM (2026-08-05): kejujuran saat GAGAL juga
        // kewajiban gerbang — jawaban ongkir yang sistemnya gagal WAJIB
        // menyebut eskalasi "ke admin" (fallback jujur resmi), bukan
        // menggantung ("sebentar ya kak…") atau melempar ke ekspedisi. <<<
        this.setExpectGiliran(conversationId, 'gagal_jujur', 'ke admin');
        return t(SHIPPING_GROUNDING_UNKNOWN, lang);
    }
  }

  /** >>> ANGGA — GERBANG PAKEM (2026-08-05): tulis kewajiban-kalimat untuk
   *  giliran non-funnel (ambigu kota/barang, gagal jujur) — menumpang
   *  mekanisme funnelExpect + MANDAT yang sudah terbukti. <<< */
  private setExpectGiliran(conversationId: string, step: string, kalimat: string): void {
    const msgId = (this.turnMemo.get(conversationId)?.key ?? '').split(':')[0] || '';
    if (!msgId || !kalimat.trim()) return;
    this.cache.setFunnelExpect(conversationId, { messageId: msgId, step, kalimat: kalimat.trim() });
  }

  /** >>> ANGGA — Klaster B (2026-08-06, konsolidasi GERBANG PAKEM): dua
   *  cabang di `getGroundingText` (PRA_TOTAL_STEPS dan langkah 'patokan')
   *  membuang baris katalog kelas total dengan loop yang PERSIS SAMA —
   *  disatukan di sini, mekanis, tanpa mengubah perilaku (cek `POLA_TOKEN_
   *  TOTAL` dan syarat prefiks `• {{` tetap identik). Enforcement REAKTIF di
   *  `resolvePriceTokens` (backstop kalau model tetap menulis token total
   *  sendiri) SENGAJA tidak digabung ke sini — beda lapis (grounding =
   *  preventif/apa yang BOLEH dilihat model, resolvePriceTokens = reaktif/
   *  apa yang BOLEH lolos ke pelanggan), dua lapis independen itu memang
   *  desain sengaja ("belt and suspenders"), bukan duplikasi yang salah. <<< */
  private buangBarisTotalDariKatalog(lines: string[]): void {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^• \{\{/.test(lines[i]) && POLA_TOKEN_TOTAL.test(lines[i])) lines.splice(i, 1);
    }
  }

  // >>> GEMINI — Pembersihan Spesifik Patokan (2026-08-06): buang seluruh penanda harga (termasuk harga_satuan, ongkir, dan baris rekap rincian_tagihan) khusus saat langkah patokan agar LLM tidak berhitung "+" manual
  private buangSemuaTokenHargaDariKatalog(lines: string[]): void {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^• (\{\{(harga_satuan|ongkir|subtotal_barang|diskon_ongkir|diskon_barang|total_|blok_total|rincian_tagihan)|Subtotal|Ongkir|Total|Rp)/i.test(lines[i])) {
        lines.splice(i, 1);
      }
    }
  }
  // <<< GEMINI

  /**
   * >>> ANGGA — Fase 113 (2026-08-04): MENGGANTIKAN `getGroundingNumbers()`
   * (dihapus — satu-satunya pemakainya, `checkPriceGrounding` di Sentinel,
   * juga dihapus). Gerbang uang sekarang di SINI, bukan lagi di Sentinel:
   *
   *  1. Penjaga kata: token angka (`{{harga_satuan}}`/`{{subtotal_barang}}`)
   *     yang didahului kata "total"/"ongkir"/"ongkos kirim" → ditahan. Angka
   *     yang dihasilkan tetap BENAR, tapi labelnya akan salah kalau dibiarkan
   *     (mis. "totalnya {{harga_satuan}}").
   *  2. Substitusi: setiap `{{token}}` yang DIKENAL diganti nilai sungguhan
   *     dari kutipan aktif percakapan ini.
   *  3. Sesudah substitusi: `{{...}}` yang TERSISA (penanda salah ketik/tidak
   *     tersedia untuk kutipan ini) ATAU angka rupiah yang bukan hasil
   *     substitusi (model menulis digit sendiri, melanggar SHIPPING_MONEY_RULE)
   *     → ditahan.
   *
   * Dipanggil TANPA SYARAT mode AI dari `AiService` (lihat komentar di sana
   * soal kenapa Sentinel — yang post-send untuk AI ON — tidak bisa jadi
   * satu-satunya penjaga untuk aturan mutlak "jangan pernah kirim {{...}}").
   */
  /** Simpan penanda harga produk (`{{harga_produk_N}}`) untuk giliran ini —
   *  dipanggil `PromptBuilderService` saat blok stok produk disuntik TANPA
   *  kutipan ongkir aktif (pelanggan tanya harga/stok sebelum menyebut kota
   *  tujuan). Diisi `resolvePriceTokens` sesudah model menjawab, pola yang
   *  sama seperti kutipan ongkir (`quoteForConversation` -> `getGroundingText`
   *  -> `resolvePriceTokens`) — cuma sumber datanya beda. */
  /** >>> ANGGA — addendum v2 M2: daftar NAMA token global yang tersedia
   *  (kamus AppSetting + catatan_sk bila terisi) — dibacakan prompt-builder di
   *  blok system bersama supaya model tahu penanda apa yang boleh dipakai.
   *  Nilainya TIDAK pernah ikut (diisi resolver sesudah model menjawab). <<< */
  async globalTokenCatalog(): Promise<string[]> {
    const oc = await this.settings.orderContext();
    const names = Object.keys(oc.orderGlobalTokens ?? {}).filter(
      (n) => /^[a-z_]+$/.test(n) && !NAMA_TOKEN_CADANGAN.has(n),
    );
    if ((oc.orderClosingNote ?? '').trim()) names.push('catatan_sk');
    return names;
  }

  cacheProductPriceTokens(conversationId: string, tokens: Record<string, string>): void {
    this.cache.setProductPriceTokens(conversationId, tokens);
  }

  /**
   * >>> ANGGA — S1 (2026-08-05, saran audit money gate): telemetri alasan
   * hold — murni SISI-BACA dari `Message.moneyGateIssues` yang memang sudah
   * dipersist `wa-inbound.storeDraft` sejak Fase 113. Nol jalur tulis baru,
   * nol migrasi. Gunanya: whitelist `penjagaKata` berikutnya lahir dari data,
   * bukan dari insiden. Gagal baca → nol + flag, tidak pernah melempar.
   */
  async moneyGateStats(days = 7): Promise<{
    days: number;
    totalDraftDitahan: number;
    totalAlasan: number;
    perAlasan: Record<string, number>;
    gagalBaca?: boolean;
  }> {
    const d = Math.min(Math.max(Math.floor(Number(days) || 7), 1), 90);
    try {
      const rows = (await this.prisma.message.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - d * 86_400_000) },
          NOT: { moneyGateIssues: { isEmpty: true } },
        },
        select: { moneyGateIssues: true },
        take: 5000, // pagar wajar; jauh di atas volume CS normal
      })) as Array<{ moneyGateIssues: string[] }>;
      const perAlasan: Record<string, number> = {};
      let totalAlasan = 0;
      for (const r of rows) {
        for (const issue of r.moneyGateIssues ?? []) {
          const kelas = klasifikasiAlasanGate(issue);
          perAlasan[kelas] = (perAlasan[kelas] ?? 0) + 1;
          totalAlasan += 1;
        }
      }
      return { days: d, totalDraftDitahan: rows.length, totalAlasan, perAlasan };
    } catch (err) {
      this.logger.warn(`Telemetri gerbang uang gagal dibaca: ${err instanceof Error ? err.message : err}`);
      return { days: d, totalDraftDitahan: 0, totalAlasan: 0, perAlasan: {}, gagalBaca: true };
    }
  }
  // <<< ANGGA

  /**
   * >>> ANGGA — P5 (2026-08-05, ketok Bossfren): alat debug SEARCH KEYWORD
   * untuk widget Settings Ongkir — persis rantai yang dilihat bot (alias →
   * search → pengelompokan ber-level), TANPA estimate (murah, baca-saja).
   */
  async debugSearchAddress(keyword: string): Promise<{
    keyword: string;
    dicari: string;
    total: number;
    gagal?: boolean;
    rows: Array<{ kelurahan: string; kecamatan: string; kota: string; provinsi: string }>;
    groups: Array<{ city: string; cityLabel: string; province: string; level: string; rows: number }>;
  }> {
    const cfg = await this.settings.shipping();
    const dicari = terapkanAlias(keyword, cfg.destinationAliases);
    const rows = await this.mengantar.searchAddress(dicari);
    if (rows === null) return { keyword, dicari, total: 0, gagal: true, rows: [], groups: [] };
    let urut = resolveDestination(rows, dicari);
    // >>> ANGGA — temuan widget Bossfren (2026-08-05): keyword GABUNGAN
    // ("sandubaya mataram") memunculkan baris tapi NOL kelompok kandidat —
    // pencocok level tak pernah cocok dengan frasa utuh. Nilai per kata. <<<
    if (!urut.length && /\s/.test(dicari)) {
      for (const w of dicari.split(/\s+/).filter((x) => x.length >= 4)) {
        urut = resolveDestination(rows, w);
        if (urut.length) break;
      }
    }
    return {
      keyword,
      dicari,
      total: rows.length,
      rows: rows.map((r) => ({
        kelurahan: (r.SUBDISTRICT_NAME ?? '').trim(),
        kecamatan: (r.DISTRICT_NAME ?? '').trim(),
        kota: ((r.CITY_NAME_SI ?? '') || (r.CITY_NAME ?? '')).trim(),
        provinsi: (r.PROVINCE_NAME ?? '').trim(),
      })),
      groups: urut.map((c) => ({
        city: c.city,
        cityLabel: c.cityLabel,
        province: c.province,
        level: c.level,
        rows: c.rows,
      })),
    };
  }
  // <<< ANGGA

  async resolvePriceTokens(
    conversationId: string,
    text: string,
  ): Promise<{ text: string; ok: boolean; issues: string[]; issueCodes: IssueCode[] }> {
    // >>> ANGGA — Klaster C (2026-08-06, refactor `klasifikasiAlasanGate`):
    // SEBELUMNYA satu-satunya cara tahu KATEGORI pelanggaran adalah
    // menebaknya balik dari teks `issues` lewat `klasifikasiAlasanGate()` —
    // stringly-typed, rawan diam-diam salah kalau kata-kata di bawah diubah
    // tanpa memperbarui pencocokannya juga (bug class S1 yang sama). Sekarang
    // kode kategori dilekatkan LANGSUNG di titik lahirnya lewat `pushIssue()`
    // — jalur keputusan LIVE (`AiService.gateMoneyTokens`) baca `issueCodes`
    // ini, bukan menebak dari teks lagi. `klasifikasiAlasanGate()` TETAP ada
    // dan TIDAK diubah cara kerjanya, tapi sekarang cuma dipakai untuk
    // telemetri histori (`moneyGateStats`) yang membaca `Message.
    // moneyGateIssues` LAMA dari database — baris itu cuma teks polos, tidak
    // pernah punya kode terlekat, jadi tetap butuh penebak-balik untuk data
    // dari SEBELUM refactor ini (dan kalau field ini gagal disimpan/dibaca
    // suatu saat). Kalau menambah issue baru: pakai `pushIssue(kode, teks)`,
    // JANGAN `issues.push(teks)` langsung — supaya `issueCodes` selalu
    // sinkron 1:1 dengan `issues` (index yang sama = pasangan yang sama). <<<
    const issues: string[] = [];
    const issueCodes: IssueCode[] = [];
    const pushIssue = (code: IssueCode, pesan: string) => {
      issues.push(pesan);
      issueCodes.push(code);
    };

    const guard = penjagaKata(text);
    if (guard) {
      pushIssue('label_rancu', `Penanda dipakai setelah kata yang bisa membuat labelnya salah: "${guard}"`);
    }

    // >>> ANGGA — GERBANG PAKEM: larangan PENJUMLAHAN MANUAL sebagai "total"
    // (2026-08-06, insiden "kalau cod total berapa kalau transfer total
    // berapa" — draft menjawab "Rp139.000 + Rp11.000" mentah, SAMA PERSIS
    // untuk COD MAUPUN Transfer, padahal {{total_cod}} dan {{total_transfer}}
    // sudah dihitung sistem dan BEDA nilainya karena biaya COD ikut masuk).
    // Dua penanda dijumlahkan pakai "+" TIDAK PERNAH benar — sistem selalu
    // sudah menyediakan penanda total yang sudah dihitung utuh untuk setiap
    // kondisi order (total_transfer/total_cod/blok_total/rincian_tagihan);
    // kalau model menjumlahkan sendiri, itu tandanya ada komponen (mis. biaya
    // COD) yang pasti kelewat. Berlaku untuk KOMBINASI penanda apa pun, bukan
    // cuma harga_satuan/subtotal_barang (retry pertama insiden ini lolos dari
    // larangan `penjagaKata` yang lebih sempit dengan kombinasi token lain).
    const jumlahManual = text.match(/\{\{[a-z_]+\}\}\s*\+\s*\{\{[a-z_]+\}\}/gi);
    if (jumlahManual) {
      pushIssue(
        'jumlah_manual',
        `Balasan menjumlahkan penanda sendiri dengan "+" sebagai total (${jumlahManual.join(', ')}) — total SUDAH dihitung sistem, wajib pakai {{total_transfer}}/{{total_cod}}/{{blok_total}}/{{rincian_tagihan}} langsung, jangan menjumlahkan penanda manual.`,
      );
    }
    // <<< ANGGA

    // >>> ANGGA — Order Context Log: config dibaca untuk (a) token GLOBAL
    // `{{catatan_sk}}` (v1.1 §12.1-3 — WAJIB dikenal resolver TANPA kutipan
    // aktif; tanpa ini draft closing ditahan gerbangnya sendiri saat cache
    // dingin), (b) KAMUS token global addendum v2 M2 (mis. rekening_transfer —
    // nomor rekening tidak pernah diketik model, anti-fraud), dan (c)
    // enforcement bridge-validasi di bawah. Addendum v2 M5: kategori sendiri.
    const cfg = await this.settings.orderContext();
    const globalTokens: Record<string, string> = {};
    // Kamus dulu, catatan_sk sesudahnya (nama cadangan tidak bisa ditimpa).
    for (const [nama, isi] of Object.entries(cfg.orderGlobalTokens ?? {})) {
      if (!/^[a-z_]+$/.test(nama)) continue; // salah bentuk → abaikan
      if (NAMA_TOKEN_CADANGAN.has(nama)) continue; // bentrok token uang/sistem
      if (typeof isi !== 'string' || !isi.trim()) continue;
      globalTokens[nama] = isi;
    }
    if (cfg.orderClosingNote) globalTokens.catatan_sk = cfg.orderClosingNote;
    // >>> ANGGA — fix (2026-08-06, langkah closing): identitas pembeli +
    // alamat verbatim utk template closing. Nama & no HP dari data kontak
    // WhatsApp (Customer — TIDAK PERNAH diketik model, sama filosofinya
    // dengan {{rekening_transfer}}: anti-fraud/anti-typo). Alamat dari teks
    // ASLI pelanggan sendiri yang disimpan `funnelDirective` (lihat
    // `adaAlamatLengkap`) — sengaja TIDAK diparafrase/dirapikan sistem,
    // risiko salah format alamat (kurir nyasar) lebih berbahaya daripada
    // tampil apa adanya.
    try {
      const convUntukClosing = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { customer: { select: { name: true, phoneNumber: true } } },
      });
      if (convUntukClosing?.customer?.name) globalTokens.nama_pembeli = convUntukClosing.customer.name;
      if (convUntukClosing?.customer?.phoneNumber) globalTokens.no_hp = convUntukClosing.customer.phoneNumber;
    } catch {
      /* identitas pembeli gagal dibaca = token itu saja tidak tersedia, bukan macet total */
    }
    const alamatTersimpan = this.cache.addressTextOf(conversationId);
    if (alamatTersimpan) globalTokens.alamat_lengkap = alamatTersimpan;
    // <<< ANGGA

    // Bridge-validasi (v1.1 §12.2-8): kutipan giliran ini dihitung dari ASUMSI
    // order berjalan → balasan yang menyebut harga/total WAJIB menyebut nama
    // barangnya (atau memakai {{rincian_order}}) supaya asumsi yang salah
    // terlihat & terkoreksi pelanggan dalam satu ronde. Pelanggarannya masuk
    // `issues` → ikut mekanisme retry-sekali gerbang uang yang sudah ada.
    if (cfg.orderBridgeEnforcement !== 'prompt_only') {
      const assumed = this.cache.assumed(conversationId);
      // >>> ANGGA — fix (2026-08-06, audit grounding #2): gerbang ini DULU
      // jalan tanpa syarat begitu ada `assumed` + token uang di draft — tidak
      // sinkron dengan instruksi `SHIPPING_GROUNDING_ASSUMED` yang HANYA
      // disuntik ke grounding kalau giliran ini `isObrolanOrder` (dipersempit
      // sengaja di F2 2026-08-05, insiden "halo" — supaya basa-basi dengan
      // cache hangat tidak ikut dipaksa merekap order). Draft bisa tertahan
      // untuk aturan yang giliran itu TIDAK PERNAH diberitahukan ke model.
      // Fix: gerbang sekarang PERSEMPIT mengikuti kondisi yang SAMA seperti
      // instruksinya (bukan melebarkan instruksi balik — supaya insiden
      // "halo" tidak muncul lagi kalau arahnya dibalik).
      const memoBridge = this.turnMemo.get(conversationId);
      const obrolanOrderBridge = this.isObrolanOrder(memoBridge?.lastText ?? '', memoBridge?.viaPilihan === true, cfg);
      // <<< ANGGA
      if (assumed?.productNames.length && obrolanOrderBridge) {
        const adaTokenUang =
          /\{\{(total_transfer|total_cod|subtotal_barang|blok_total|harga_satuan|total_transfer_diskon|total_cod_diskon)\}\}/i.test(text);
        // >>> ANGGA — fix (2026-08-06, audit grounding #1): {{rincian_tagihan}}
        // TIDAK selalu boleh memenuhi bridge — langkah PRA_TOTAL_STEPS/patokan
        // MELARANG total sama sekali (gerbang di bawah), jadi menyarankan
        // model "pakai {{rincian_tagihan}}" untuk memenuhi bridge di langkah
        // itu cuma memindahkan pelanggaran, bukan menyelesaikannya. Restriksi
        // HANYA berlaku kalau funnelExpect memang milik GILIRAN INI (cek
        // messageId — pola sama gerbang PRA_TOTAL di bawah); tanpa funnelExpect
        // yang cocok, perilaku LAMA (tanpa restriksi) dipakai — supaya tidak
        // ada giliran yang mendadak tertahan gara-gara data basi/tak sinkron.
        const expectFBridge = this.cache.funnelExpect(conversationId);
        const msgIdNowBridge = (this.turnMemo.get(conversationId)?.key ?? '').split(':')[0] || '';
        const langkahTotalDilarang =
          !!expectFBridge &&
          !!msgIdNowBridge &&
          expectFBridge.messageId === msgIdNowBridge &&
          (PRA_TOTAL_STEPS.has(expectFBridge.step) || expectFBridge.step === 'patokan');
        // S2: {{rincian_tagihan}} juga memuat nama barang (blok sistem) →
        // memenuhi bridge sama seperti {{rincian_order}} — KECUALI giliran
        // ini total sedang dilarang: saat itu hanya {{rincian_order}} (bukan
        // token uang) yang sah memenuhi bridge.
        const adaRincian = langkahTotalDilarang
          ? /\{\{rincian_order\}\}/i.test(text)
          : /\{\{(rincian_order|rincian_tagihan)\}\}/i.test(text);
        // <<< ANGGA
        if (adaTokenUang && !adaRincian && !namaDisebut(text, assumed.productNames)) {
          pushIssue(
            'bridge_asumsi',
            'Balasan memakai ASUMSI order yang sedang berjalan tapi tidak menyebut nama barangnya — sebutkan nama barangnya atau pakai {{rincian_order}}/{{rincian_tagihan}} supaya pelanggan bisa mengoreksi kalau asumsinya salah.',
          );
        }
      }
    }
    // <<< ANGGA

    const quote = this.cache.get(conversationId);
    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, insiden "{{139000}}"
    // ronde 2): dua sumber token digabung, bukan saling menggantikan — penanda
    // harga produk (`{{harga_produk_N}}`, giliran TANPA kutipan ongkir aktif,
    // lihat `cacheProductPriceTokens`) dan penanda kutipan ongkir (giliran
    // DENGAN kutipan ongkir aktif) bisa dipakai bersamaan pada satu balasan
    // yang menyebut harga produk sekaligus ongkirnya. Namespace-nya tidak
    // pernah tumpang tindih (`harga_produk_*` vs `harga_satuan`/`ongkir`/dst).
    const tokens = { ...globalTokens, ...this.cache.getProductPriceTokens(conversationId), ...(quote ? buildPriceTokens(quote) : {}) };

    const inserted = new Set<string>();
    const substituted = text.replace(/\{\{([a-z_]+)\}\}/gi, (utuh, nama: string) => {
      const nilai = tokens[nama];
      if (nilai === undefined) return utuh; // biar ketahan sebagai "tak dikenal" di bawah
      for (const n of angkaUtuh(nilai)) inserted.add(n);
      return nilai;
    });

    const sisaPenanda = substituted.match(/\{\{[a-z_]+\}\}/gi);
    if (sisaPenanda) {
      pushIssue('token_tak_dikenal', `Penanda tidak dikenal/tidak tersedia untuk kutipan ini: ${sisaPenanda.join(', ')}`);
    }

    const angkaMentah = [...angkaUtuh(substituted, true)].filter((n) => !inserted.has(n));
    if (angkaMentah.length) {
      pushIssue('digit_mentah', `Angka rupiah ditulis langsung oleh model, bukan lewat penanda: ${angkaMentah.join(', ')}`);
    }

    // >>> ANGGA — GERBANG PAKEM: REKENING (2026-08-06, insiden "sandubaya 1 pcs"
    // — draft menulis BCA/BRI/Mandiri lengkap dengan NOMOR ASLINYA padahal
    // metode belum ditanya): (a) deretan digit panjang (rekening/telepon) yang
    // DIKETIK model sendiri di teks mentah = haram — angka begitu wajib lewat
    // penanda kamus global (anti-fraud M2); (b) pakem Bossfren: rekening HANYA
    // boleh keluar setelah pelanggan MEMILIH transfer.
    const digitPanjang = text.match(/\b\d{8,}\b|\b\d[\d\- ]{9,}\d\b/g) ?? [];
    if (digitPanjang.length) {
      pushIssue(
        'rekening_mentah',
        `Angka panjang (nomor rekening/telepon) ditulis langsung oleh model: ${digitPanjang.join(', ')} — angka kelas ini wajib lewat penanda kamus (mis. {{rekening_bca}}), jangan pernah diketik sendiri.`,
      );
    }
    {
      const teksGiliranR = this.turnMemo.get(conversationId)?.lastText ?? '';
      const sebutRekening = /(rekening|\btransfer ke\b|\bno\.?\s*rek\b)/i.test(substituted);
      if (sebutRekening) {
        let metodeSudah = /\b(cod|tf)\b|transfer/i.test(teksGiliranR);
        if (!metodeSudah && this.orderLog) {
          try {
            const asksR = await this.orderLog.funnelAsks(conversationId);
            metodeSudah = (asksR['metode_terjawab'] ?? 0) >= 1;
          } catch { /* log tak terbaca = anggap belum */ }
        }
        if (!metodeSudah) {
          pushIssue(
            'funnel_dilanggar',
            'Balasan melanggar alur penjualan wajib — menyodorkan rekening padahal pelanggan BELUM memilih metode bayar. Urutannya: sodorkan total, tanya "mau diproses COD atau transfer kak?", dan rekening HANYA setelah pelanggan memilih transfer.',
          );
        }
      }
    }
    // <<< ANGGA

    // >>> ANGGA — E3 (2026-08-05, insiden "Mohon dicek kembali di chat ini
    // untuk informasi harga yang akurat" bocor ke draft): PENJAGA META —
    // model kadang MEMPARAFRASE instruksi internal jadi kalimat meta ke
    // pelanggan. Larangan prompt (BASE_RULES #13) menurunkan frekuensinya;
    // ini backstop deterministik untuk frasa yang dikenal (daftar AppSetting,
    // bisa ditambah dari telemetri tanpa deploy). Dicek SESUDAH substitusi =
    // teks final yang benar-benar akan terkirim.
    const frasaInternal = (cfg.orderMetaPhraseBlacklist ?? [])
      .map((f) => (f ?? '').trim())
      .filter((f) => f.length > 0)
      .find((f) => substituted.toLowerCase().includes(f.toLowerCase()));
    if (frasaInternal) {
      pushIssue(
        'istilah_internal',
        `Balasan menyebut istilah internal sistem ("${frasaInternal}") — tulis ulang tanpa menyinggung sistem, penanda, atau proses internal ke pelanggan.`,
      );
    }
    // <<< ANGGA

    // >>> ANGGA — Q-Chain (2026-08-05, MANDAT KERAS Bossfren "alur wajib
    // ditaati, tidak boleh dilanggar"): kalau giliran ini directive funnel
    // disuntik, balasan WAJIB memuat kalimat tanya langkahnya (dinormalisasi:
    // huruf kecil, tanpa emoji/tanda baca — biar 🙏 yang hilang tidak salah
    // tahan). Melanggar → ikut mekanisme retry-sekali lalu hold.
    {
      const expectF = this.cache.funnelExpect(conversationId);
      const msgIdNow = (this.turnMemo.get(conversationId)?.key ?? '').split(':')[0] || '';
      if (expectF && msgIdNow && expectF.messageId === msgIdNow) {
        const normF = (s: string) =>
          (s ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
        // >>> ANGGA — fix (2026-08-06, Q-Chain v3.1: kalimat patokan transfer
        // kini memuat penanda {{rekening_transfer}}): `expectF.kalimat` bisa
        // memuat penanda {{...}} sejak revisi ini (mis. "...transfer ke
        // rekening berikut: {{rekening_transfer}}..."). Tanpa substitusi di
        // sini, perbandingan verbatim akan SELALU gagal — `substituted` sudah
        // berisi nomor rekening ASLI, sedangkan `expectF.kalimat` masih
        // literal teks "{{rekening_transfer}}", jadi tidak akan pernah cocok
        // walau modelnya menulis kalimat yang PERSIS benar. Kalimat wajib
        // ikut disubstitusi pakai `tokens` yang sama sebelum dibandingkan.
        const kalimatWajibTersubstitusi = (expectF.kalimat ?? '').replace(
          /\{\{([a-z_]+)\}\}/gi,
          (utuh, nama: string) => tokens[nama] ?? utuh,
        );
        // <<< ANGGA
        const normSubstituted = normF(substituted);
        const normKalimatWajib = normF(kalimatWajibTersubstitusi);
        if (!normSubstituted.includes(normKalimatWajib)) {
          pushIssue(
            'funnel_dilanggar',
            `Balasan melanggar alur penjualan wajib — tidak menutup dengan pertanyaan langkah "${expectF.step}". Tulis ulang dan akhiri PERSIS dengan: "${kalimatWajibTersubstitusi}"`,
          );
        } else if (normKalimatWajib) {
          // >>> ANGGA — fix (2026-08-06, REPLAY laporan Bossfren "Fatih"/
          // "Sandubaya COD", screenshot "trs knp ini doble2"): cek di atas
          // cuma pernah memverifikasi kalimat wajib ADA (`.includes()`),
          // TIDAK PERNAH ngecek apakah dia cuma muncul SEKALI. Draft nyata
          // yang dilaporkan: model menulis jawaban natural dulu (kebetulan
          // ISI-nya persis sama minus emoji penutup), LALU menempel lagi
          // kalimat wajib PERSIS (dengan emoji) di akhir buat "menuhin
          // syarat" gerbang — lolos cek "ada" di atas, padahal pelanggan
          // menerima kalimat yang sama dua kali berturut-turut. Dihitung
          // lewat `split()` (bukan regex global) karena `normKalimatWajib`
          // bisa memuat karakter regex-sensitif (sudah dinormalisasi ke
          // huruf/angka/spasi saja lewat `normF`, tapi tetap dihindari demi
          // aman) — jumlah kemunculan = jumlah potongan dikurangi 1.
          const kemunculan = normSubstituted.split(normKalimatWajib).length - 1;
          if (kemunculan > 1) {
            pushIssue(
              'kalimat_dobel',
              `Balasan mengulang kalimat wajib langkah "${expectF.step}" sebanyak ${kemunculan}x — kalimatnya cuma boleh muncul SEKALI di akhir balasan (jangan dijawab dengan kalimat sendiri dulu lalu ditempel lagi versi PERSIS-nya). Tulis ulang, sebutkan SEKALI saja: "${kalimatWajibTersubstitusi}"`,
            );
          }
        }
        // >>> ANGGA — Q-Chain fix 2 (2026-08-05, insiden "mataram dobel"):
        // langkah PRA-TOTAL → total HARAM tersodor duluan (ketok Bossfren:
        // "ditotalin itu jika qty udah jelas dijawab"). Dicek di teks MENTAH
        // (sebelum substitusi) — penanda total yang ditulis model sendiri
        // tetap tertangkap walau katalognya sudah disensor grounding.
        if (PRA_TOTAL_STEPS.has(expectF.step)) {
          const tokenTotal = text.match(POLA_TOKEN_TOTAL);
          if (tokenTotal) {
            pushIssue(
              'funnel_dilanggar',
              `Balasan melanggar alur penjualan wajib — belum waktunya menyodorkan total (${tokenTotal[0]}): jumlah pesanan belum pasti. Jawab yang ditanya saja (harga/ongkir) lalu tutup dengan pertanyaan langkah "${expectF.step}".`,
            );
          }
        }
        // >>> ANGGA — fix (2026-08-06, insiden "cod aja kak" diulang
        // totalan): langkah PATOKAN = total sudah pernah tersodor, draft
        // yang masih menulis penanda total sendiri berarti mengulang rekap
        // yang dilarang — ditahan sama seperti pelanggaran PRA-TOTAL.
        if (expectF.step === 'patokan') {
          const tokenTotalUlang = text.match(POLA_TOKEN_TOTAL);
          if (tokenTotalUlang) {
            pushIssue(
              'funnel_dilanggar',
              `Balasan mengulang rincian total (${tokenTotalUlang[0]}) padahal total sudah pernah disodorkan di giliran sebelumnya — jangan direkap ulang, cukup tutup dengan pertanyaan langkah "${expectF.step}".`,
            );
          }
        }
        // <<< ANGGA
      }
    }
    // <<< ANGGA

    // >>> ANGGA — P2 (2026-08-05, insiden draft "belum memiliki informasi
    // ongkir… cek dengan tim logistik" PADAHAL kutipan sudah dihitung):
    // PENJAGA KONTRADIKSI. Model bisa meneruskan narasi "akan cek dulu" dari
    // riwayat giliran gagal sebelumnya walau data giliran ini sudah tersedia.
    // Syarat menahan SENGAJA tiga lapis supaya tidak salah tangkap: (a) ada
    // kutipan aktif, (b) giliran ini memang obrolan uang/tempat (pertanyaan
    // garansi yang dijawab "saya cek ke tim dulu" itu sah), (c) frasa
    // penyangkalan dari daftar AppSetting muncul di teks final.
    if (quote) {
      const memoGiliran = this.turnMemo.get(conversationId);
      const teksGiliran = memoGiliran?.lastText ?? '';
      // >>> ANGGA — Q-Chain fix (2026-08-05, insiden "banyumas kak"): jawaban
      // pilihan tujuan/barang ("banyumas kak") tak punya kata uang, tapi
      // kutipan giliran itu SUDAH dihitung — draft "saya akan cek dulu ya kak…
      // konfirmasi ke admin" wajib ikut kena penjaga kontradiksi ini. <<<
      const giliranUang =
        memoGiliran?.viaPilihan === true ||
        adaKataTanyaUang(teksGiliran, cfg.orderMoneyAskKeywords) ||
        PLACE_HINT.test(teksGiliran) ||
        ORDER_CHANGE_HINT.test(teksGiliran);
      if (giliranUang) {
        const sangkal = (cfg.orderContradictionPhrases ?? [])
          .map((f) => (f ?? '').trim())
          .filter((f) => f.length > 0)
          .find((f) => substituted.toLowerCase().includes(f.toLowerCase()));
        if (sangkal) {
          pushIssue(
            'kontradiksi_data',
            `Balasan menyangkal data yang sudah tersedia ("${sangkal}") — kutipan ongkir/tagihan untuk giliran ini SUDAH dihitung sistem; jawab langsung memakai penanda, jangan bilang akan cek dulu.`,
          );
        }
      }
      // >>> ANGGA — ANTI-TEATER PROSES (2026-08-05, insiden "mataram dobel":
      // "saya cek dulu… mohon tunggu… saya proses dulu 🕒 Setelah saya cek,
      // ongkirnya Rp50.000"): draft yang SUDAH menyisipkan penanda uang tapi
      // masih bernarasi "sedang mengecek" = kontradiksi di dalam SATU pesan —
      // angkanya jelas sudah di tangan. Giliran NEGO dikecualikan (eskalasi
      // "saya cek dulu ke atasan" itu sah dan memang diperintahkan sistem).
      {
        const teksGiliranT = this.turnMemo.get(conversationId)?.lastText ?? '';
        const adaTokenUangDipakai =
          /\{\{(harga_satuan|harga_produk_\d+|ongkir|kota_tujuan)\}\}/i.test(text) ||
          POLA_TOKEN_TOTAL.test(text);
        const giliranNego = hasAggregateKeyword(teksGiliranT, cfg.orderNegoKeywords);
        if (adaTokenUangDipakai && !giliranNego) {
          const teater = (cfg.orderTheaterPhrases ?? [])
            .map((f) => (f ?? '').trim())
            .filter((f) => f.length > 0)
            .find((f) => substituted.toLowerCase().includes(f.toLowerCase()));
          if (teater) {
            pushIssue(
              'kontradiksi_data',
              `Balasan berpura-pura masih mengecek ("${teater}") padahal angkanya sudah tertulis di pesan yang sama — hapus seluruh narasi proses (cek dulu/mohon tunggu/saya proses), jawab langsung satu kalimat memakai penanda.`,
            );
          }
        }
      }
      // <<< ANGGA
      // >>> ANGGA — GERBANG PAKEM #1: ANTI-NGARANG PRODUK (2026-08-05, ketok
      // Bossfren; pelajaran "GSM Naga Merah"): angka kutipan HARAM ditempel ke
      // produk lain. Draft memakai penanda uang kutipan TAPI satu-satunya nama
      // produk katalog yang disebut ada di LUAR order/kandidat/penawaran aktif
      // → angka benar, label produk salah → ditahan. Giliran campuran tetap
      // sah selama nama produk order ikut disebut.
      {
        const pakaiTokenKutipan =
          POLA_TOKEN_TOTAL.test(text) || /\{\{(harga_satuan|ongkir|rincian_order)\}\}/i.test(text);
        if (pakaiTokenKutipan) {
          const whitelist = new Set<string>();
          for (const m of quote.matchedItems ?? []) whitelist.add(m.name.toLowerCase().trim());
          for (const c of this.cache.pendingItems(conversationId)?.candidates ?? []) whitelist.add(c.name.toLowerCase().trim());
          for (const n of this.cache.assumed(conversationId)?.productNames ?? []) whitelist.add(n.toLowerCase().trim());
          try {
            for (const o of ((await this.orderLog?.recentOffers(conversationId)) ?? []).filter((x) => x.fresh)) {
              for (const it of o.items ?? []) whitelist.add(String(it.name ?? '').toLowerCase().trim());
            }
          } catch { /* penawaran tak terbaca = abaikan sumber ini */ }
          whitelist.delete('');
          const teksL = substituted.toLowerCase();
          const adaNamaOrder = [...whitelist].some((n) => teksL.includes(n));
          if (whitelist.size && !adaNamaOrder) {
            try {
              const katalog = await this.prisma.product.findMany({
                where: { status: 'active' },
                take: 500,
                select: { name: true },
              });
              const salah = katalog
                .map((p: { name?: string | null }) => String(p.name ?? '').trim())
                .find((n: string) => n.length >= 4 && !whitelist.has(n.toLowerCase()) && teksL.includes(n.toLowerCase()));
              if (salah) {
                pushIssue(
                  'salah_produk',
                  `Balasan menempelkan angka kutipan ke produk yang salah — menyebut "${salah}" padahal angka penanda giliran ini milik order: ${[...whitelist].join(', ')}. Tulis ulang dengan nama produk order yang benar.`,
                );
              }
            } catch { /* katalog tak terbaca = lewati penjaga ini */ }
          }
        }
      }
      // <<< ANGGA
    }
    // <<< ANGGA

    return { text: substituted, ok: issues.length === 0, issues, issueCodes };
  }

  // ── Pembantu internal ────────────────────────────────────────────────────

  /** Adakah produk aktif yang lebih berat dari berat default toko? */
  private async cekBeratSeragam(defaultWeightGrams: number): Promise<boolean> {
    try {
      const lebihBerat = await this.prisma.product.count({
        where: { status: 'active', weightGrams: { gt: defaultWeightGrams } },
      });
      return lebihBerat === 0;
    } catch {
      // Gagal menghitung → anggap TIDAK seragam (pakai "mulai dari"), pilihan
      // yang tidak pernah membuat toko nombok.
      return false;
    }
  }

  private async lastCustomerMessage(
    conversationId: string,
  ): Promise<{ id: string; content: string }> {
    const msg = await this.prisma.message.findFirst({
      where: { conversationId, senderType: SenderType.customer },
      orderBy: { createdAt: 'desc' },
      select: { id: true, content: true },
    });
    return { id: msg?.id ?? '', content: msg?.content ?? '' };
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
    matched: Array<{ productId: string; sku: string | null; name: string; qty: number; grams: number; price: number }>;
    unmatched: string[];
    // >>> ANGGA — Order Context Log: sebutan yang cocok >1 produk dengan skor
    // SERI. Dulu `sort[0]` memilih diam-diam (arbitrer); sekarang dilaporkan
    // sebagai ambiguitas supaya bot BERTANYA (gerbang konfirmasi Bossfren). <<<
    ambiguous: Array<{ name: string; qty: number; candidates: Array<{ productId: string; name: string }> }>;
    totalGrams: number;
    totalPrice: number;
  }> {
    const matched: Array<{ productId: string; sku: string | null; name: string; qty: number; grams: number; price: number }> = [];
    const unmatched: string[] = [];
    const ambiguous: Array<{ name: string; qty: number; candidates: Array<{ productId: string; name: string }> }> = [];
    if (!items.length) return { matched, unmatched, ambiguous, totalGrams: 0, totalPrice: 0 };

    const products = await this.prisma.product.findMany({
      where: { status: 'active' },
      take: 500,
    });

    for (const item of items) {
      const tokens = tokenizeForMatch(item.name);
      const scored = products
        .map((p) => ({ p, score: scoreProductMatch(p, tokens) }))
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (!best || best.score < MIN_PRODUCT_MATCH_SCORE) {
        unmatched.push(item.name);
        continue;
      }
      const qty = Number.isFinite(item.qty) && item.qty > 0 ? Math.floor(item.qty) : 1;
      // >>> ANGGA — Order Context Log: skor puncak SERI antar produk BERBEDA
      // ("bedog" cocok sama kuat ke beberapa Bedog) → jangan memilih diam-diam.
      const ties = scored.filter((s) => s.score === best.score);
      if (ties.length > 1) {
        ambiguous.push({
          name: item.name,
          qty,
          candidates: ties.map((s) => ({ productId: (s.p as { id: string }).id, name: s.p.name })),
        });
        continue;
      }
      // <<< ANGGA
      const grams = (best.p as { weightGrams?: number | null }).weightGrams ?? defaultWeightGrams;
      matched.push({
        productId: (best.p as { id: string }).id,
        sku: (best.p as { sku?: string | null }).sku ?? null,
        name: best.p.name,
        qty,
        grams,
        price: best.p.price ?? 0,
      });
    }

    const totalGrams = matched.reduce((sum, m) => sum + m.qty * m.grams, 0);
    const totalPrice = matched.reduce((sum, m) => sum + m.qty * m.price, 0);
    return { matched, unmatched, ambiguous, totalGrams, totalPrice };
  }
}

// ── Pembantu murni tingkat modul ────────────────────────────────────────────



export function parseExtract(raw: string): ShippingOrderExtract {
  const empty: ShippingOrderExtract = { city: null, province: null, items: [] };
  try {
    const json = JSON.parse(extractFirstJson(raw) ?? '') as {
      kota?: unknown;
      city?: unknown;
      provinsi?: unknown; // >>> ANGGA — P4 <<<
      province?: unknown;
      items?: Array<{ nama?: unknown; name?: unknown; qty?: unknown }>;
    };
    const rawCity = json.kota ?? json.city;
    const city =
      typeof rawCity === 'string' && rawCity.trim() && rawCity.trim().toLowerCase() !== 'null'
        ? rawCity.trim()
        : null;
    // >>> ANGGA — P4
    const rawProv = json.provinsi ?? json.province;
    const province =
      typeof rawProv === 'string' && rawProv.trim() && rawProv.trim().toLowerCase() !== 'null'
        ? rawProv.trim()
        : null;
    // <<< ANGGA
    const items = (Array.isArray(json.items) ? json.items : [])
      .map((i) => {
        const name = String(i?.nama ?? i?.name ?? '').trim();
        const qtyNum = Number(i?.qty);
        const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? Math.floor(qtyNum) : 1;
        return { name, qty };
      })
      .filter((i) => i.name.length > 0);
    return { city, province, items };
  } catch {
    // >>> ANGGA — audit total (2026-08-05): JSON rusak = ekstraksi GAGAL,
    // bukan "pelanggan tidak menyebut apa-apa" — penanda beda kelas. <<<
    return { ...empty, failed: true };
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

// ── Order Context Log — pembantu murni deterministik ───────────────────────
// >>> ANGGA — blueprint 2026-08-04 + amendemen v1.1. Semua diekspor supaya
// bisa diuji tanpa Nest/DB; daftar katanya SELALU datang dari AppSetting
// (parameter fungsi), tidak ada salinan di sini.

/** Pisah pesan jadi kata: huruf kecil, tanpa tanda baca. */
function kataPesan(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Batas panjang pesan yang masih dianggap "jawaban pendek" oleh pencocok
 *  whole-message. Parameter teknis: afirmasi/pembatalan sungguhan di WhatsApp
 *  nyaris selalu jauh lebih pendek dari ini. */
export const WHOLE_MESSAGE_MAX_WORDS = 8;

/**
 * Pencocok WHOLE-MESSAGE (v1.1 §12.2-6): true hanya kalau SELURUH pesan
 * terdiri dari kata-kata `keywords` + `fillers`, minimal satu kata keyword,
 * dan (kalau `negations` diberikan) tanpa satu pun kata negasi. Ini yang
 * membedakan "iya yg itu kak" (afirmasi) dari "jadi berapa totalnya?" (bukan) —
 * pencocokan substring terbukti bocor untuk kata seperti "jadi".
 * Frasa multi-kata di `keywords` ("gak jadi") dipecah jadi kata-katanya.
 */
export function wholeMessageMatch(
  text: string,
  keywords: string[],
  fillers: string[],
  negations?: string[],
): boolean {
  const words = kataPesan(text);
  if (!words.length || words.length > WHOLE_MESSAGE_MAX_WORDS) return false;
  const neg = new Set((negations ?? []).map((n) => n.toLowerCase()));
  if (neg.size && words.some((w) => neg.has(w))) return false;
  const kw = new Set((keywords ?? []).flatMap((k) => k.toLowerCase().split(/\s+/)).filter(Boolean));
  const fill = new Set((fillers ?? []).map((f) => f.toLowerCase()));
  let adaKeyword = false;
  for (const w of words) {
    if (kw.has(w)) {
      adaKeyword = true;
      continue;
    }
    if (fill.has(w)) continue;
    return false;
  }
  return adaKeyword;
}

/** Adakah kata/frasa agregat ("total semuanya") di pesan? Frasa dicocokkan
 *  utuh dengan batas kata. HANYA dipanggil di dalam konteks resolusi
 *  pertanyaan uang (v1.1 §12.2-7) — bukan saringan global. */
export function hasAggregateKeyword(text: string, keywords: string[]): boolean {
  const norm = ` ${kataPesan(text).join(' ')} `;
  return (keywords ?? []).some((k) => {
    const frasa = kataPesan(k).join(' ');
    return frasa.length > 0 && norm.includes(` ${frasa} `);
  });
}

/**
 * >>> ANGGA — F1 (2026-08-05): "apakah pesan ini bicara uang?" — pencocokan
 * SUBSTRING (sengaja beda dari `hasAggregateKeyword` yang batas-kata), karena
 * imbuhan bahasa sehari-hari ("totalnya", "harganya", "ongkirnya", "dibayar")
 * wajib tertangkap oleh kata dasar di daftar `orderMoneyAskKeywords`.
 * Kelonggaran substring aman di sini: salah-positif cuma berarti jalur asumsi
 * terbuka (perilaku lama), bukan angka salah.
 */
export function adaKataTanyaUang(text: string, keywords: string[]): boolean {
  const norm = (text ?? '').toLowerCase();
  return (keywords ?? []).some((k) => {
    const kata = (k ?? '').trim().toLowerCase();
    return kata.length > 0 && norm.includes(kata);
  });
}

/**
 * Qty baru dari pesan pendek ("beli 2", "jadi 3 aja", "2 pcs") — jalur patch
 * qty deterministik untuk carry-over. Null kalau tidak ada pola qty yang
 * meyakinkan. Batas 1..999 (di luar itu hampir pasti bukan qty).
 */
export function patchQty(text: string): number | null {
  const t = (text ?? '').toLowerCase();
  const m =
    /(?:\b(?:beli|pesan|ambil|order|mau|jadi)\s*)(\d{1,3})\b/.exec(t) ??
    /\b(\d{1,3})\s*(?:pcs|pc|buah|biji|unit|set|aja)\b/.exec(t) ??
    // >>> ANGGA — Q-Chain (2026-08-05): jawaban ANGKA POLOS untuk pertanyaan
    // qty funnel ("2", "2 deh", "3 ya kak") — seluruh pesan cuma angka + kata
    // ringan. Tanpa ini, jawaban paling wajar atas "mau ambil berapa pcs kak?"
    // justru tidak tertangkap.
    /^\s*(\d{1,3})\s*(?:pcs|pc|buah|biji|unit|set)?\s*(?:aja|deh|dulu|ya|yaa|kak|dong)?\s*(?:aja|deh|dulu|ya|yaa|kak|dong)?\s*$/i.exec(t);
    // <<< ANGGA
  if (!m) return null;
  const qty = Number(m[1]);
  return Number.isInteger(qty) && qty >= 1 && qty <= 999 ? qty : null;
}

/**
 * Adakah produk katalog yang DISEBUT di pesan ini? Deteksi murah tanpa LLM
 * (pakai pencocok yang sudah ada) — dipakai sebagai penjaga carry-over: kalau
 * pelanggan menyebut barang baru, konteks lama TIDAK boleh dipaksakan.
 */
export function mentionsCatalogProduct(
  text: string,
  products: Array<Record<string, unknown>>,
): boolean {
  const tokens = tokenizeForMatch(text ?? '');
  if (!tokens.size) return false;
  return (products ?? []).some((p) => scoreProductMatch(p as never, tokens) >= MIN_PRODUCT_MATCH_SCORE);
}

/**
 * Apakah `text` menyebut salah satu nama produk di `names`? Cukup SATU kata
 * bermakna (≥3 huruf) dari nama produk yang muncul — "Untuk Golok Sembelih ya
 * kak" menyebut "Golok Sembelih Multifungsi" lewat kata "golok"/"sembelih".
 * Dipakai bridge-validasi; konservatif ke arah LOLOS (satu kata cukup) supaya
 * gerbang tidak menahan kalimat yang sebenarnya sudah menyebut barang.
 */
export function namaDisebut(text: string, names: string[]): boolean {
  const kata = new Set(kataPesan(text));
  return (names ?? []).some((n) =>
    kataPesan(n).some((w) => w.length >= 3 && kata.has(w)),
  );
}

/**
 * Petakan jawaban pelanggan ke salah satu pilihan BARANG yang tadi ditawarkan —
 * padanan `pilihKandidat` untuk produk. Dua jalan masuk:
 *  1. Kata pembeda nama produk ("yg betekok") — skor kata yang MEMBEDAKAN
 *     antar kandidat, seri = null (jangan menebak).
 *  2. Afirmasi whole-message ("iya yg itu") — HANYA kalau kandidat yang
 *     ditawarkan tepat satu (kalau dua, "iya" tidak memilih apa-apa).
 */
export function pilihBarang(
  candidates: Array<{ productId: string; name: string }>,
  teks: string,
  cfg: { orderAffirmationKeywords: string[]; orderNegationKeywords: string[]; orderFillerWords: string[] },
): { productId: string; name: string } | null {
  if (!candidates?.length) return null;
  const jawaban = new Set(kataPesan(teks));
  if (!jawaban.size) return null;

  const perNama = candidates.map((c) => new Set(kataPesan(c.name)));
  const frekuensi = new Map<string, number>();
  for (const set of perNama) {
    for (const w of set) frekuensi.set(w, (frekuensi.get(w) ?? 0) + 1);
  }
  const skor = perNama.map(
    (set) => [...set].filter((w) => (frekuensi.get(w) ?? 0) < candidates.length && jawaban.has(w)).length,
  );
  const tertinggi = Math.max(...skor);
  if (tertinggi > 0 && skor.filter((s) => s === tertinggi).length === 1) {
    return candidates[skor.indexOf(tertinggi)];
  }

  if (
    candidates.length === 1 &&
    wholeMessageMatch(teks, cfg.orderAffirmationKeywords, cfg.orderFillerWords, cfg.orderNegationKeywords)
  ) {
    return candidates[0];
  }
  return null;
}
// <<< ANGGA (Order Context Log)

// ── Fase 113 — model menulis KALIMAT, sistem menulis ANGKA UANG ────────────

/**
 * >>> ANGGA — Fase 113 (2026-08-04): penjaga kata deterministik. Risiko sisa
 * yang diakui di rancangan: angka BENAR tapi LABEL salah, mis. model menulis
 * "totalnya {{harga_satuan}}" — nilainya sah (harga satuan sungguhan), tapi
 * dibacakan seolah itu total. Hanya diperiksa untuk dua penanda yang paling
 * mudah ketuker dengan "total": `{{harga_satuan}}` dan `{{subtotal_barang}}`.
 * `{{total_transfer}}`/`{{total_cod}}` sendiri TIDAK perlu penjaga ini — nama
 * penandanya sudah menyebut "total", jadi tidak ada label lain yang bisa
 * ketuker dengannya.
 *
 * Jendela 20 karakter (bukan seluruh teks) supaya kata "total" yang jauh
 * sebelumnya, dari klausa lain, tidak ikut menuduh penanda yang tidak
 * berkaitan dengannya.
 *
 * >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): pola awal cuma satu
 * arah — "total ... {{token}}" (kata lebih dulu). Model juga bisa menulis
 * urutan sebaliknya, "{{token}} ... total" (mis. "{{harga_satuan}} itu
 * totalnya kak"), dan itu lolos tanpa terdeteksi. DUA arah sekarang
 * diperiksa; sisi mana pun yang lebih dulu tetap kena jendela 20 karakter
 * yang sama.
 */
/** >>> ANGGA — addendum v2 M2: nama yang TIDAK boleh dipakai kamus token
 *  global — token uang/kutipan & token sistem. Salah pakai → diabaikan
 *  resolver (dan ditolak validasi DTO di sisi simpan). <<< */
export const NAMA_TOKEN_CADANGAN = new Set([
  'catatan_sk', 'kota_tujuan', 'rincian_order', 'harga_satuan', 'subtotal_barang',
  'ongkir', 'kurir_transfer', 'kurir_cod', 'total_transfer', 'total_cod',
  'blok_total', 'diskon_ongkir', 'total_transfer_diskon', 'total_cod_diskon',
  'diskon_barang', 'total_transfer_nego', 'total_cod_nego',
  'rincian_tagihan', // >>> ANGGA — S2 (2026-08-05) <<<
  'estimasi_tiba', // >>> ANGGA — Q-Chain v3 (2026-08-05) <<<
  // >>> ANGGA — fix (2026-08-06, langkah closing) <<<
  'daftar_produk_harga', 'nama_pembeli', 'no_hp', 'alamat_lengkap',
]);

/**
 * >>> ANGGA — S1 (2026-08-05): klasifikasi alasan hold gerbang uang untuk
 * telemetri. Mencocokkan FRASA STABIL dari string issue yang dibuat
 * `resolvePriceTokens` (file yang sama — ada penanda silang di sana). String
 * yang tidak dikenal jatuh ke 'lainnya', bukan salah hitung diam-diam.
 */
/** >>> ANGGA — Q-Chain fix 2 (2026-08-05, insiden "mataram dobel + total
 *  prematur"): langkah funnel PRA-TOTAL. Selama langkah aktif giliran ini
 *  masih di sini, penanda kelas total (rincian_tagihan/subtotal/total_*)
 *  DIHAPUS dari katalog grounding DAN drafnya DITAHAN gerbang kalau tetap
 *  memakainya — ketok Bossfren: "ditotalin itu jika qty udah jelas dijawab". <<< */
export const PRA_TOTAL_STEPS = new Set(['barang', 'alamat', 'keranjang', 'qty']);
export const POLA_TOKEN_TOTAL =
  /\{\{(rincian_tagihan|subtotal_barang|total_transfer|total_cod|blok_total|total_transfer_diskon|total_cod_diskon|total_transfer_nego|total_cod_nego)\}\}/i;

// >>> ANGGA — koreksi 2026-08-06 (audit menyeluruh, temuan #2 & #5):
// (a) issue "mengulang rincian total" (fix "cod aja kak", commit f5eb0a6)
// belum dikenali di sini — jatuh ke 'lainnya', padahal ini juga pelanggaran
// alur penjualan (funnel_dilanggar). (b) `digitPanjang` (rekening/telepon,
// anti-fraud M2) dan `angkaMentah` (harga rupiah mentah) dua-duanya memuat
// substring "ditulis langsung oleh model" — kelas gate SEPERTINYA sama
// ('digit_mentah') padahal beda jenis pelanggaran. Dipisah jadi kategori
// sendiri ('rekening_mentah'), dicek LEBIH DULU pakai prefiks unik
// "Angka panjang (nomor rekening" supaya tidak ketiban aturan generik di
// bawahnya (urutan if-else di sini penting).
// >>> ANGGA — Klaster C (2026-08-06): union kelas dipindah ke tipe bernama
// `IssueCode`, dipakai bersama oleh `resolvePriceTokens` (lewat `pushIssue`,
// dilekatkan LANGSUNG saat issue lahir) dan fungsi ini (masih menebak balik
// dari teks — sekarang HANYA untuk telemetri histori, lihat komentar di
// `resolvePriceTokens`). Uniannya sendiri TIDAK berubah, cuma diberi nama. <<<
export type IssueCode =
  | 'label_rancu'
  | 'token_tak_dikenal'
  | 'digit_mentah'
  | 'rekening_mentah'
  | 'bridge_asumsi'
  | 'istilah_internal'
  | 'kontradiksi_data'
  | 'funnel_dilanggar'
  | 'salah_produk'
  | 'jumlah_manual'
  | 'kalimat_dobel'
  | 'lainnya';

// >>> ANGGA — Klaster C (2026-08-06): fungsi ini HANYA untuk telemetri histori
// (membaca moneyGateIssues lama di DB). Jalur live pakai pushIssue() langsung.
// Tabel lookup: urutan PENTING — 'kalimat_dobel' wajib lebih dulu dari
// 'funnel_dilanggar' (keduanya pelanggaran funnel tapi butuh hint berbeda).
// Menambah kategori baru: tambah 1 baris ke ISSUE_MAP + 1 entry ke IssueCode.
const ISSUE_MAP: Array<[string, IssueCode]> = [
  ['membuat labelnya salah',                    'label_rancu'],
  ['tidak dikenal/tidak tersedia',              'token_tak_dikenal'],
  ['Angka panjang (nomor rekening',             'rekening_mentah'],    // anti-fraud M2
  ['ditulis langsung oleh model',               'digit_mentah'],
  ['ASUMSI order yang sedang berjalan',         'bridge_asumsi'],
  ['istilah internal',                          'istilah_internal'],   // E3
  ['menyangkal data yang sudah tersedia',       'kontradiksi_data'],   // P2
  ['berpura-pura masih mengecek',               'kontradiksi_data'],   // anti-teater (2026-08-05)
  ['mengulang kalimat wajib',                   'kalimat_dobel'],      // ← WAJIB sebelum funnel_dilanggar
  ['melanggar alur penjualan wajib',            'funnel_dilanggar'],   // Q-Chain
  ['mengulang rincian total',                   'funnel_dilanggar'],   // insiden "cod aja kak" (2026-08-06)
  ['menempelkan angka kutipan ke produk',       'salah_produk'],       // Gerbang Pakem #1
  ['menjumlahkan penanda sendiri',              'jumlah_manual'],      // Gerbang Pakem (2026-08-06)
];

export function klasifikasiAlasanGate(issue: string): IssueCode {
  const s = issue ?? '';
  return ISSUE_MAP.find(([needle]) => s.includes(needle))?.[1] ?? 'lainnya';
}
// <<< ANGGA


export function penjagaKata(text: string): string | null {
  // >>> ANGGA — F3 (2026-08-05, insiden draft "total harga 2 x
  // {{harga_satuan}}" tertahan): PERKALIAN eksplisit "angka x {{harga_satuan}}"
  // itu pemakaian label satuan yang SAH — angkanya memang harga satuan, dan
  // pengalinya membuat maknanya tak mungkin tertukar dengan total. Pola itu
  // dinetralkan dulu sebelum pemeriksaan, KHUSUS harga_satuan (subtotal_barang
  // dikali angka tetap janggal → tetap dijaga).
  const bersih = (text ?? '').replace(/\d+\s*[x×*]\s*\{\{harga_satuan\}\}/gi, '[perkalian-satuan]');
  // <<< ANGGA
  const kata = '(total(nya)?|ongkir(nya)?|ongkos\\s*kirim)';
  const token = '\\{\\{(harga_satuan|subtotal_barang)\\}\\}';
  const larangan = new RegExp(`\\b${kata}\\b[^{}\\n]{0,20}${token}|${token}[^{}\\n]{0,20}\\b${kata}\\b`, 'i');
  const m = bersih.match(larangan);
  return m ? m[0] : null;
}

/**
 * >>> ANGGA — Fase 113: token → NILAI sungguhan, dipakai `resolvePriceTokens`
 * untuk substitusi sesudah model menjawab. `{{harga_satuan}}` HANYA disertakan
 * kalau SELURUH barang di order ini satu harga — order dengan >1 harga satuan
 * tidak punya "satuan" tunggal yang aman untuk ditawarkan (keputusan Bossfren
 * 2026-08-04: sembunyikan, bukan menebak barang mana yang dimaksud).
 * `{{blok_total}}` HANYA ada kalau Transfer & COD dua-duanya tersedia — dua
 * baris LENGKAP dengan labelnya, supaya risiko label Transfer↔COD tertukar
 * benar-benar nol (keputusan Bossfren 2026-08-04: model tidak pernah mengetik
 * kata "Transfer"/"COD" sendiri untuk kasus ini).
 */
export function buildPriceTokens(q: ShippingQuote): Record<string, string> {
  const tokens: Record<string, string> = {
    kota_tujuan: `${q.city}, ${q.province}`,
  };

  if (q.shippingOnly) {
    tokens.ongkir = `Rp${formatIdr(q.transferTotal)}`;
    tokens.kurir_transfer = q.transferCourier;
    if (q.eta) tokens.estimasi_tiba = q.eta; // >>> ANGGA — Q-Chain v3 <<<
    return tokens;
  }

  const satuanUnik = new Set(q.matchedItems.map((m) => m.unitPrice));
  if (satuanUnik.size === 1 && q.matchedItems.length > 0) {
    tokens.harga_satuan = `Rp${formatIdr(q.matchedItems[0].unitPrice)}`;
  }
  if (q.matchedItems.length) {
    tokens.rincian_order = q.matchedItems.map((m) => `${m.qty} pcs ${m.name}`).join(', ');
    // >>> ANGGA — fix (2026-08-06, langkah closing): "Produk: X 💰 Harga: RpY"
    // per barang, dipakai template `orderFunnelClosingCod/Transfer` —
    // BUKAN {{rincian_tagihan}} (itu blok rekap perkalian+total, closing
    // cuma perlu daftar produk+harga satuan, pola CS asli Bossfren).
    tokens.daftar_produk_harga = q.matchedItems
      .map((m) => `Produk: ${m.name} 💰 Harga: Rp${formatIdr(m.unitPrice)}`)
      .join('\n');
    // <<< ANGGA
  }
  tokens.subtotal_barang = `Rp${formatIdr(q.goodsTotal)}`;
  tokens.ongkir = `Rp${formatIdr(q.shippingFee)}`;
  tokens.kurir_transfer = q.transferCourier;
  tokens.total_transfer = `Rp${formatIdr(q.transferTotal)}`;
  if (q.shippingDiscount > 0) {
    tokens.diskon_ongkir = `Rp${formatIdr(q.shippingDiscount)}`;
    tokens.total_transfer_diskon = `Rp${formatIdr(q.transferTotalDiscounted)}`;
  }
  // >>> ANGGA — addendum v2 P1: token nego (diskon barang per-pcs + diskon
  // ongkir, "harga mentok"). HANYA ada bila diskon barangnya > 0.
  if ((q.goodsDiscount ?? 0) > 0) {
    tokens.diskon_barang = `Rp${formatIdr(q.goodsDiscount as number)}`;
    if ((q.transferTotalNego ?? 0) > 0) tokens.total_transfer_nego = `Rp${formatIdr(q.transferTotalNego as number)}`;
  }
  // <<< ANGGA

  if (q.codTotal != null && q.codCourier) {
    tokens.kurir_cod = q.codCourier;
    tokens.total_cod = `Rp${formatIdr(q.codTotal)}`;
    if (q.codDiscount != null && q.codDiscount > 0 && q.codTotalDiscounted != null) {
      tokens.total_cod_diskon = `Rp${formatIdr(q.codTotalDiscounted)}`;
    }
    if ((q.goodsDiscount ?? 0) > 0 && q.codTotalNego != null && q.codTotalNego > 0) {
      tokens.total_cod_nego = `Rp${formatIdr(q.codTotalNego)}`; // >>> ANGGA — addendum v2 P1 <<<
    }
    tokens.blok_total =
      `• Transfer : Rp${formatIdr(q.transferTotal)}
` +
      `• COD      : Rp${formatIdr(q.codTotal)}  (kurir ${q.codCourier})`;
  }

  // >>> ANGGA — S2 (2026-08-05, saran audit money gate): BLOK rekap tagihan
  // utuh disusun SISTEM — barang + perkaliannya, subtotal, ongkir, total.
  // Satu penanda untuk seluruh rekap = permukaan salah-label model menyempit
  // (lanjutan filosofi {{blok_total}}). Angka semua dari kutipan; perkalian
  // per baris konsisten dengan goodsTotal karena goodsTotal memang Σ qty×harga
  // (tanpa pembulatan; pembulatan hanya di total transfer/COD).
  if (!q.shippingOnly && q.matchedItems.length) {
    const baris = q.matchedItems.map(
      (m) =>
        `• ${m.qty} pcs ${m.name} — ${m.qty} x Rp${formatIdr(m.unitPrice)} = Rp${formatIdr(m.qty * m.unitPrice)}`,
    );
    baris.push(
      `• Subtotal barang : Rp${formatIdr(q.goodsTotal)}`,
      `• Ongkir (${q.transferCourier}) : Rp${formatIdr(q.shippingFee)}`,
      `• Total TRANSFER : Rp${formatIdr(q.transferTotal)}`,
    );
    if (q.codTotal != null && q.codCourier) {
      baris.push(`• Total COD (${q.codCourier}) : Rp${formatIdr(q.codTotal)} — sudah termasuk biaya COD`);
    }
    // >>> ANGGA — Q-Chain v3: estimasi tiba dari API (pola RINCIAN BIAYA CS).
    if (q.eta) {
      baris.push(`• Estimasi tiba : ${q.eta}`);
      tokens.estimasi_tiba = q.eta;
    }
    // <<< ANGGA
    tokens.rincian_tagihan = baris.join('\n');
  }
  // <<< ANGGA

  return tokens;
}

/**
 * >>> ANGGA — Fase 113: katalog penanda yang ditampilkan ke MODEL (nama +
 * deskripsi, TIDAK PERNAH nilainya — itu baru diisi `resolvePriceTokens`
 * sesudah model menjawab). Kondisinya SAMA PERSIS dengan `buildPriceTokens`
 * supaya model tidak pernah ditawari penanda yang ternyata tidak bisa diisi.
 */
export function katalogPenanda(q: ShippingQuote, hidePriceUnits = false): string[] {
  if (q.shippingOnly) {
    const dasar = [
      '• {{kota_tujuan}} = kota/kabupaten tujuan',
      '• {{ongkir}} = ongkir untuk 1 pcs (produk belum dipastikan)',
      '• {{kurir_transfer}} = nama kurirnya',
    ];
    if (q.eta) dasar.push('• {{estimasi_tiba}} = estimasi lama pengiriman dari ekspedisi'); // >>> ANGGA — Q-Chain v3 <<<
    return dasar;
  }

  const lines = [
    '• {{kota_tujuan}} = kota/kabupaten tujuan',
    '• {{rincian_order}} = daftar barang & jumlahnya (opsional, pakai kalau perlu — bukan wajib)',
  ];
  // >>> ANGGA — koreksi 2026-08-06 (insiden "GSM Naga Merah" nyasar ke order
  // "bedog betekok, bedog sicepot"): angka kutipan (harga/ongkir/total) sudah
  // dijaga gerbang uang, tapi NAMA barang yang menyertainya tidak — kalau ada
  // produk LAIN yang harganya kebetulan sama/mirip disebut di blok stok
  // (lihat PRODUCT_STOCK_PRICE_DEFER_TO_MONEY_GATE, sengaja tetap
  // menampilkan harga barang di luar order), model bisa salah pasang nama.
  // Sebut nama barang order ini SECARA EKSPLISIT & WAJIB di sini — bukan
  // opsional seperti {{rincian_order}} — supaya model punya jangkar pasti,
  // bukan menebak dari nama produk lain yang kebetulan ada di konteks.
  if (q.matchedItems.length) {
    const namaOrderPasti = q.matchedItems.map((m) => m.name).join(', ');
    lines.push(
      `• Barang di order berongkir ini SECARA PASTI: ${namaOrderPasti} — WAJIB pakai nama ini persis kalau menyebut barang order ini. JANGAN pakai nama produk lain (termasuk dari daftar stok toko di blok lain) untuk order ini, walau harganya kebetulan sama/mirip.`,
    );
  }
  // <<< ANGGA
  // >>> ANGGA — S2 (2026-08-05): kondisi SAMA PERSIS dengan buildPriceTokens.
  if (q.matchedItems.length && !hidePriceUnits) {
    lines.push(
      '• {{rincian_tagihan}} = BLOK rekap tagihan LENGKAP siap pakai (tiap barang + perkaliannya, subtotal, ongkir, total Transfer/COD). Saat MEREKAP order, tulis penanda ini LANGSUNG sebagai isi jawabanmu di baris sendiri — JANGAN menyusun rekap angka manual dari penanda satuan, JANGAN menjelaskan/menarasikan bahwa kamu "akan menggunakan" blok ini, dan JANGAN menaruhnya di tengah kalimat',
    );
  }
  // <<< ANGGA
  const satuanUnik = new Set(q.matchedItems.map((m) => m.unitPrice));
  if (!hidePriceUnits) {
    if (satuanUnik.size === 1 && q.matchedItems.length > 0) {
      lines.push('• {{harga_satuan}} = harga satu barang');
    }
    lines.push(
      '• {{subtotal_barang}} = total harga barang saja (belum termasuk ongkir)',
      '• {{ongkir}} = ongkir saja',
    );
  }
  lines.push(
    '• {{kurir_transfer}} = kurir untuk TRANSFER',
    '• {{total_transfer}} = total akhir TRANSFER (sudah termasuk ongkir)',
  );
  if (q.eta) lines.push('• {{estimasi_tiba}} = estimasi lama pengiriman dari ekspedisi'); // >>> ANGGA — Q-Chain v3 <<<
  if (q.shippingDiscount > 0) {
    lines.push(
      '• {{diskon_ongkir}} = potongan ongkir — pakai HANYA sesuai aturan diskon di instruksi persona, jangan tawarkan sendiri tanpa alasan',
      '• {{total_transfer_diskon}} = total TRANSFER sudah dipotong diskon ongkir',
    );
  }
  // >>> ANGGA — addendum v2 P1
  if ((q.goodsDiscount ?? 0) > 0) {
    lines.push(
      '• {{diskon_barang}} = potongan harga barang — HANYA saat pelanggan keberatan harga, sekali per percakapan',
      '• {{total_transfer_nego}} = total TRANSFER harga mentok (sudah semua diskon) — HANYA untuk nego',
    );
    if (q.codTotalNego != null && q.codTotalNego > 0) {
      lines.push('• {{total_cod_nego}} = total COD harga mentok (sudah semua diskon) — HANYA untuk nego');
    }
  }
  // <<< ANGGA
  if (q.codTotal != null && q.codCourier) {
    lines.push(
      '• {{kurir_cod}} = kurir untuk COD',
      '• {{total_cod}} = total akhir COD (sudah termasuk ongkir + biaya COD)',
    );
    if (q.codDiscount != null && q.codDiscount > 0) {
      lines.push('• {{total_cod_diskon}} = total COD sudah dipotong diskon ongkir');
    }
    lines.push(
      '• {{blok_total}} = DUA BARIS "Transfer : ... / COD : ..." SIAP PAKAI, sudah lengkap dengan labelnya — WAJIB dipakai kalau menyebut Transfer dan COD sekaligus di kalimat yang sama, JANGAN mengetik kata "Transfer"/"COD" sendiri untuk kasus itu',
    );
  }
  return lines;
}
