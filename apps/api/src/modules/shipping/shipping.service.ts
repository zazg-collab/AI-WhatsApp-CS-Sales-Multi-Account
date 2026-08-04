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
  | { status: 'ambiguous'; candidates: DestinationChoice[] }
  | { status: 'need_more_detail'; keyword: string }
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

/** Kandidat teratas harus seunggul ini (dalam jumlah baris) sebelum dipakai
 *  tanpa bertanya, kalau levelnya sama. Parameter teknis. */
export const DOMINANCE_RATIO = 3;

/**
 * Bolehkah kandidat teratas dipakai langsung tanpa bertanya?
 *
 * Ya kalau ia satu-satunya, ATAU levelnya lebih tinggi dari pesaing terdekat,
 * ATAU barisnya minimal 3x lipat. Kalau setara — Cibinong 14 lawan 13,
 * Jatinegara 17 lawan 9, Bogor 30 lawan 20 — JANGAN memilih diam-diam, tanya.
 */
export function kandidatDominan(urut: DestinationCandidate[]): boolean {
  if (urut.length === 0) return false;
  if (urut.length === 1) return true;
  const [satu, dua] = urut;
  if (LEVEL_RANK[satu.level] < LEVEL_RANK[dua.level]) return true;
  return satu.rows >= dua.rows * DOMINANCE_RATIO;
}

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
  if (!pilihan.length) return null;
  const jawaban = new Set(kata(teks));
  if (!jawaban.size) return null;

  const perLabel = pilihan.map((p) => new Set(kata(p.label)));
  const frekuensi = new Map<string, number>();
  for (const set of perLabel) {
    for (const w of set) frekuensi.set(w, (frekuensi.get(w) ?? 0) + 1);
  }

  const skor = perLabel.map(
    (set) =>
      [...set].filter((w) => (frekuensi.get(w) ?? 0) < pilihan.length && jawaban.has(w)).length,
  );
  const tertinggi = Math.max(...skor);
  if (tertinggi === 0) return null;
  if (skor.filter((s) => s === tertinggi).length > 1) return null;
  return pilihan[skor.indexOf(tertinggi)];
}

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
  ) {}

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
    const lastMsg = await this.lastCustomerMessage(conversationId);
    const lastCustomerText = lastMsg.content;
    const cached = this.cache.get(conversationId);
    const mayHaveChanged =
      PLACE_HINT.test(lastCustomerText) || ORDER_CHANGE_HINT.test(lastCustomerText);
    if (cached && !mayHaveChanged) {
      this.cache.recordOutcome(conversationId, 'ok');
      return { status: 'ok', quote: cached };
    }

    // Langkah 2 — deteksi tujuan & item.
    const extract = await this.extractOrderTarget(conversationId);

    // >>> ANGGA — tangga 1 (jawaban): kalau giliran sebelumnya bot menawarkan
    // pilihan tertutup dan pesan ini memilih salah satunya, langsung pakai
    // destination_id yang sudah disimpan. Ini dijalankan SEBELUM pencarian
    // ulang justru karena pencarian ulang-lah yang gagal untuk teks jawaban
    // ("Kota Bogor" tidak pernah cocok dengan CITY_NAME "BOGOR").
    const dipilih = pilihKandidat(this.cache.pending(conversationId), lastCustomerText);
    if (dipilih) {
      this.cache.clearPending(conversationId);
      this.cache.resetAsks(conversationId);
      this.cache.reset(conversationId);
      const hasil = await this.quoteUntukTujuan(dipilih, extract.items);
      if (hasil.status === 'ok') this.cache.set(conversationId, hasil.quote, cfg.quoteCacheTtlMs);
      this.cache.recordOutcome(conversationId, hasil.status);
      return hasil;
    }

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

    // >>> ANGGA — tangga pertanyaan tujuan. Hanya dua status ini yang berarti
    // "bot harus bertanya lagi"; sisanya (ok / API mati / dsb) tidak menghitung.
    // Penghitungnya naik SEKALI per pesan pelanggan (lihat `bumpAsk`), karena
    // satu giliran balasan memanggil grounding lebih dari sekali.
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
      return result;
    }
    // Tujuan akhirnya jelas (atau masalahnya bukan soal tujuan) → tangga direset.
    this.cache.resetAsks(conversationId);
    this.cache.clearPending(conversationId);
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
  }): Promise<ShippingResult> {
    const cfg = await this.settings.shipping();
    if (!cfg.mengantarApiKey || !cfg.mengantarOriginId) return { status: 'not_configured' };

    // Langkah 2b — tukar nama panggilan dengan nama resmi SEBELUM mencari.
    // Kalau tidak ada aliasnya, `dicari` sama persis dengan yang diketik.
    const dicari = terapkanAlias(input.keyword, cfg.destinationAliases);

    // Langkah 3 — Search Address + pengelompokan per provinsi+kota.
    const rows = await this.mengantar.searchAddress(dicari);
    if (rows === null) return { status: 'api_error' };
    const urut = resolveDestination(rows, dicari);
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
      : { matched: [], unmatched: [], totalGrams: 0, totalPrice: 0 };
    const semuaCocok = raw.matched.length > 0 && raw.unmatched.length === 0;
    const shippingOnly = !semuaCocok;
    const resolved = semuaCocok
      ? raw
      : { matched: [], unmatched: raw.unmatched, totalGrams: cfg.defaultWeightGrams, totalPrice: 0 };
    const weightKg = gramsToKg(resolved.totalGrams);

    if (shippingOnly) this.beratSeragam = await this.cekBeratSeragam(cfg.defaultWeightGrams);

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
      if (withCod === null) return { status: 'api_error' };
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

    // Langkah 9 — dua angka akhir, dibulatkan (Rule 11).
    const quote: ShippingQuote = {
      city: target.city,
      province: target.province,
      destinationId,
      weightKg,
      goodsTotal,
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
        // >>> ANGGA: kutipan ONGKIR SAJA punya bentuk kalimat sendiri — angka
        // ini ongkir, BUKAN total belanja, dan bot harus menyebutnya begitu.
        if (q.shippingOnly) {
          const lines = [
            t(SHIPPING_MONEY_RULE, lang),
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
          return lines.join('\n');
        }
        const lines = [t(SHIPPING_MONEY_RULE, lang), t(SHIPPING_GROUNDING_INTRO, lang), ...katalogPenanda(q)];
        if (q.codBlockedReason === 'region') {
          lines.push('• COD TIDAK tersedia untuk wilayah ini (kebijakan toko). Tawarkan transfer saja.');
        } else if (!q.codCourier) {
          lines.push('• COD tidak tersedia untuk tujuan ini. Tawarkan transfer saja.');
        }
        return lines.join('\n');
      }
      case 'ambiguous': {
        // >>> ANGGA — tangga 1: pertanyaan tertutup. Label sudah dipilihkan
        // `labelKandidat` (provinsi kalau beda provinsi, "Kota/Kab." kalau
        // seprovinsi). Tangga 2: minta kecamatan. Tangga 3: serahkan ke admin.
        const ronde = this.cache.askCount(conversationId);
        if (ronde > MAX_DESTINATION_ASKS) return t(SHIPPING_GROUNDING_DESTINATION_STUCK, lang);
        if (ronde > 1) return t(SHIPPING_GROUNDING_ASK_DISTRICT, lang);
        // Dibacakan HANYA dua teratas (rancangan Bossfren). Sisanya tetap
        // tersimpan di `pending` — pelanggan boleh menyebut yang tidak
        // disebutkan bot, dan tetap langsung ketemu.
        return (
          t(SHIPPING_GROUNDING_AMBIGUOUS, lang) +
          '\n' +
          result.candidates
            .slice(0, MAX_CHOICES_ASKED)
            .map((c) => `• ${c.label}`)
            .join('\n')
        );
      }
      case 'need_more_detail': {
        // Tidak ada pertanyaan tertutup yang bisa diajukan di sini, jadi
        // tangga 1 langsung kecamatan, tangga 2 tawarkan provinsi/kota besar.
        const ronde = this.cache.askCount(conversationId);
        if (ronde > MAX_DESTINATION_ASKS) return t(SHIPPING_GROUNDING_DESTINATION_STUCK, lang);
        if (ronde > 1) return t(SHIPPING_GROUNDING_ASK_PROVINCE, lang);
        return t(SHIPPING_GROUNDING_NEED_DETAIL, lang);
      }
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
  cacheProductPriceTokens(conversationId: string, tokens: Record<string, string>): void {
    this.cache.setProductPriceTokens(conversationId, tokens);
  }

  async resolvePriceTokens(
    conversationId: string,
    text: string,
  ): Promise<{ text: string; ok: boolean; issues: string[] }> {
    const issues: string[] = [];

    const guard = penjagaKata(text);
    if (guard) {
      issues.push(`Penanda dipakai setelah kata yang bisa membuat labelnya salah: "${guard}"`);
    }

    const quote = this.cache.get(conversationId);
    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, insiden "{{139000}}"
    // ronde 2): dua sumber token digabung, bukan saling menggantikan — penanda
    // harga produk (`{{harga_produk_N}}`, giliran TANPA kutipan ongkir aktif,
    // lihat `cacheProductPriceTokens`) dan penanda kutipan ongkir (giliran
    // DENGAN kutipan ongkir aktif) bisa dipakai bersamaan pada satu balasan
    // yang menyebut harga produk sekaligus ongkirnya. Namespace-nya tidak
    // pernah tumpang tindih (`harga_produk_*` vs `harga_satuan`/`ongkir`/dst).
    const tokens = { ...this.cache.getProductPriceTokens(conversationId), ...(quote ? buildPriceTokens(quote) : {}) };

    const inserted = new Set<string>();
    const substituted = text.replace(/\{\{([a-z_]+)\}\}/gi, (utuh, nama: string) => {
      const nilai = tokens[nama];
      if (nilai === undefined) return utuh; // biar ketahan sebagai "tak dikenal" di bawah
      for (const n of angkaUtuh(nilai)) inserted.add(n);
      return nilai;
    });

    const sisaPenanda = substituted.match(/\{\{[a-z_]+\}\}/gi);
    if (sisaPenanda) {
      issues.push(`Penanda tidak dikenal/tidak tersedia untuk kutipan ini: ${sisaPenanda.join(', ')}`);
    }

    const angkaMentah = [...angkaUtuh(substituted, true)].filter((n) => !inserted.has(n));
    if (angkaMentah.length) {
      issues.push(`Angka rupiah ditulis langsung oleh model, bukan lewat penanda: ${angkaMentah.join(', ')}`);
    }

    return { text: substituted, ok: issues.length === 0, issues };
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
export function penjagaKata(text: string): string | null {
  const kata = '(total(nya)?|ongkir(nya)?|ongkos\\s*kirim)';
  const token = '\\{\\{(harga_satuan|subtotal_barang)\\}\\}';
  const larangan = new RegExp(`\\b${kata}\\b[^{}\\n]{0,20}${token}|${token}[^{}\\n]{0,20}\\b${kata}\\b`, 'i');
  const m = (text ?? '').match(larangan);
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
    return tokens;
  }

  const satuanUnik = new Set(q.matchedItems.map((m) => m.unitPrice));
  if (satuanUnik.size === 1 && q.matchedItems.length > 0) {
    tokens.harga_satuan = `Rp${formatIdr(q.matchedItems[0].unitPrice)}`;
  }
  if (q.matchedItems.length) {
    tokens.rincian_order = q.matchedItems.map((m) => `${m.qty} pcs ${m.name}`).join(', ');
  }
  tokens.subtotal_barang = `Rp${formatIdr(q.goodsTotal)}`;
  tokens.ongkir = `Rp${formatIdr(q.shippingFee)}`;
  tokens.kurir_transfer = q.transferCourier;
  tokens.total_transfer = `Rp${formatIdr(q.transferTotal)}`;
  if (q.shippingDiscount > 0) {
    tokens.diskon_ongkir = `Rp${formatIdr(q.shippingDiscount)}`;
    tokens.total_transfer_diskon = `Rp${formatIdr(q.transferTotalDiscounted)}`;
  }

  if (q.codTotal != null && q.codCourier) {
    tokens.kurir_cod = q.codCourier;
    tokens.total_cod = `Rp${formatIdr(q.codTotal)}`;
    if (q.codDiscount != null && q.codDiscount > 0 && q.codTotalDiscounted != null) {
      tokens.total_cod_diskon = `Rp${formatIdr(q.codTotalDiscounted)}`;
    }
    tokens.blok_total =
      `• Transfer : Rp${formatIdr(q.transferTotal)}
` +
      `• COD      : Rp${formatIdr(q.codTotal)}  (kurir ${q.codCourier})`;
  }

  return tokens;
}

/**
 * >>> ANGGA — Fase 113: katalog penanda yang ditampilkan ke MODEL (nama +
 * deskripsi, TIDAK PERNAH nilainya — itu baru diisi `resolvePriceTokens`
 * sesudah model menjawab). Kondisinya SAMA PERSIS dengan `buildPriceTokens`
 * supaya model tidak pernah ditawari penanda yang ternyata tidak bisa diisi.
 */
export function katalogPenanda(q: ShippingQuote): string[] {
  if (q.shippingOnly) {
    return [
      '• {{kota_tujuan}} = kota/kabupaten tujuan',
      '• {{ongkir}} = ongkir untuk 1 pcs (produk belum dipastikan)',
      '• {{kurir_transfer}} = nama kurirnya',
    ];
  }

  const lines = [
    '• {{kota_tujuan}} = kota/kabupaten tujuan',
    '• {{rincian_order}} = daftar barang & jumlahnya (opsional, pakai kalau perlu — bukan wajib)',
  ];
  const satuanUnik = new Set(q.matchedItems.map((m) => m.unitPrice));
  if (satuanUnik.size === 1 && q.matchedItems.length > 0) {
    lines.push('• {{harga_satuan}} = harga satu barang');
  }
  lines.push(
    '• {{subtotal_barang}} = total harga barang saja (belum termasuk ongkir)',
    '• {{ongkir}} = ongkir saja',
    '• {{kurir_transfer}} = kurir untuk TRANSFER',
    '• {{total_transfer}} = total akhir TRANSFER (sudah termasuk ongkir)',
  );
  if (q.shippingDiscount > 0) {
    lines.push(
      '• {{diskon_ongkir}} = potongan ongkir — pakai HANYA sesuai aturan diskon di instruksi persona, jangan tawarkan sendiri tanpa alasan',
      '• {{total_transfer_diskon}} = total TRANSFER sudah dipotong diskon ongkir',
    );
  }
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
