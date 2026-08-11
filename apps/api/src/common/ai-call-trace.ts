import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * >>> ANGGA — F6 Bagian 1 butir 1 (2026-08-11, cowork): SIAPA SEBENARNYA YANG
 * MENJAWAB GILIRAN INI?
 *
 * Kenapa berkas ini ada. Biner yang SAMA PERSIS diukur empat sesi memberi
 * `kosong` 25%/0%/0%/0% dan median lama-jawab 38,4 → 13,5 detik. Selama sumber
 * sebaran itu tidak terlihat, gerbang lulus F6 ("3x berulang, sebaran < 5
 * poin") tidak bisa dilewati — dan lebih buruk: setiap perbandingan commit A vs
 * B selama ini sebagian besar mengukur kondisi penyedia hulu OpenRouter, bukan
 * kode kita. Alat ini membuat penyedia yang benar-benar melayani tiap panggilan
 * bisa dibaca.
 *
 * KENAPA AsyncLocalStorage, bukan dititipkan lewat `ReplyChannel` seperti
 * `funnelStep` di LANGKAH 5. Dua alasan, yang kedua menentukan:
 *
 *  1. `ReplyChannel` adalah port "ke mana balasan keluar". Penyedia hulu LLM
 *     bukan itu. Menaruh urusan alat ukur di tanda tangan port bisnis adalah
 *     memperbaiki di lapisan yang salah (pakem 8d butir 4).
 *
 *  2. Lebih menentukan: `send()` dipanggil PALING BANYAK SEKALI per giliran,
 *     sementara satu giliran bisa menembak BANYAK panggilan LLM — loop tool
 *     (`ai.service.ts:444`), percobaan paksa (`:606`), retry gerbang uang
 *     (`:289`), Sentinel (`sentinel.service.ts:276/466/542`), dan resolusi
 *     tujuan (`shipping.service.ts:910`). Jalur port akan under-count SECARA
 *     KONSTRUKSI, dan justru giliran yang paling banyak menembak — yang paling
 *     mungkin berpindah penyedia — yang paling salah terhitung.
 *
 * SIFAT YANG DIJAGA:
 *  - Tanpa penampung terbuka, `catatPanggilanAi` adalah no-op SENYAP. Produksi
 *    memanggilnya tiap giliran tanpa penampung; kalau ia bisa melempar, alat
 *    ukur mematikan bot. Itu persis kelas kesalahan `funnel_gerbang_total`
 *    (tiruan metrics parsial → TypeError → grounding 3527 → 0 byte tanpa satu
 *    baris error).
 *  - Penampung dimiliki PEMANGGIL, bukan dikembalikan sesudah fn selesai.
 *    Jadi jejaknya tetap terbaca walau fn MELEMPAR — dan giliran yang gagal
 *    (timeout!) justru giliran yang paling butuh data penyedia.
 *  - Nol biaya saat tidak dipakai: satu `getStore()` per panggilan LLM.
 * <<<
 */
/**
 * Deklarasi LENGAN pengukuran, dibaca dari env apa adanya.
 *
 * >>> ANGGA — KOREKSI AUDIT K23 (2026-08-11, cacat NB-5). Versi pertama
 * menurunkan identitas lengan dari `temperature` EFEKTIF tiap panggilan, lalu
 * menyatukannya lintas giliran. Itu menghasilkan tanda tangan "himpunan jalur
 * kode yang kebetulan terlewati", bukan tanda tangan lengan — dan cacatnya
 * bergejala DUA ARAH BERLAWANAN dari satu akar yang sama:
 *   · union KOSONG (berkas tanpa instrumentasi) → dianggap sama dengan berkas
 *     lain yang juga kosong → perbandingan lintas-lengan DILOLOSKAN
 *   · union KELEBIHAN satu jalur (mis. `extractOrderTarget` bertemperature 0
 *     kebetulan terpanggil di satu berkas saja) → `[0,0.6]` vs `[0.6]` → dua
 *     berkas SELENGAN DITOLAK
 * Dibaca dari env, ketiganya konstan untuk seluruh proses pengukuran, jadi
 * dua-duanya hilang sekaligus. `temperature` efektif tetap direkam — tapi
 * sebagai DIAGNOSTIK, bukan sebagai identitas.
 */
export interface LenganEval {
  /** `EVAL_TEMPERATURE`; `null` = tidak diset (lengan produksi). */
  temperature: number | null;
  /** `EVAL_SEED`; `null` = tidak dikirim. */
  seed: number | null;
  /** `EVAL_LOCK_PROVIDER`. */
  kunciRute: boolean;
}

export interface JejakPanggilanAi {
  /** Model yang DIMINTA payload. */
  modelDiminta: string;
  /** Model yang benar-benar dilayani menurut badan respons. `null` = tidak dilaporkan. */
  modelDilayani: string | null;
  /**
   * Penyedia hulu menurut badan respons OpenRouter.
   * `null` berarti **TIDAK DILAPORKAN**, bukan "tidak ada". Dibedakan dengan
   * sengaja: aku belum pernah melihat badan respons sungguhan dari repo ini,
   * jadi ketiadaan field itu harus terbaca sebagai batas alat ukur — bukan
   * diam-diam jadi angka nol yang terlihat seperti temuan.
   */
  penyedia: string | null;
  /** `id` generasi — jejak balik ke dashboard OpenRouter. */
  idGenerasi: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  finishReason: string | null;
  /** Percobaan keberapa (RETRIES). Satu entri PER percobaan, termasuk yang gagal. */
  percobaan: number;
  /** Temperature yang BENAR-BENAR dikirim di payload percobaan ini. */
  temperature: number | null;
  /**
   * `seed` yang dikirim di payload; `null` = tidak dikirim.
   * ⚠️ KOREKSI AUDIT (A7): kalimat lama menambahkan "(keluaran tidak
   * direproduksi)", yang membalik jadi implikasi "non-null = direproduksi".
   * Itu overclaim — hulu bisa mengabaikan `seed` tanpa memberi tahu siapa pun.
   * Field ini membuktikan apa yang DIKIRIM, titik.
   */
  seed: number | null;
  /** Deklarasi lengan dari env. Identitas lengan diambil dari SINI. */
  lenganEval: LenganEval;
  ms: number;
  /**
   * Apakah payload percobaan ini MEMINTA kunci rute (`allow_fallbacks:false`).
   *
   * >>> ANGGA — koreksi AUDIT K23 (2026-08-11, ronde penyanggal): dulu bernama
   * `ruteTerkunci`, dan nama itu BERBOHONG. Field ini diisi dari pembacaan
   * `process.env` di sisi KLIEN — ia nol bukti bahwa hulu menghormatinya.
   * Auditor sempat menyimpulkan karena itu ia "identik dengan `echo $ENV`" dan
   * layak dibuang; penyanggal membalikkannya, dan benar: ia satu-satunya
   * penangkap kesalahan "saklar disetel di SHELL replay, bukan di PROSES API"
   * — kesalahan yang dokumentasi kita sendiri sudah antisipasi. Jadi
   * dipertahankan, tapi namanya kini menyebut persis apa yang ia buktikan.
   * Bukti sisi hulu datang dari `penyedia` + `modelDilayani`. <<<
   */
  payloadMintaKunciRute: boolean;
  /** Ringkasan kegagalan percobaan ini; `null` kalau berhasil. */
  galat: string | null;
}

const penampung = new AsyncLocalStorage<JejakPanggilanAi[]>();

/** Buat penampung baru. Dimiliki pemanggil supaya selamat dari `throw`. */
export function bukaJejakAi(): JejakPanggilanAi[] {
  return [];
}

/** Jalankan `fn` dengan `sink` sebagai penampung aktif. Galat diteruskan APA ADANYA. */
export function denganJejakAi<T>(sink: JejakPanggilanAi[], fn: () => Promise<T>): Promise<T> {
  return penampung.run(sink, fn);
}

/** Catat satu panggilan. No-op senyap kalau tidak ada penampung aktif. */
export function catatPanggilanAi(entri: JejakPanggilanAi): void {
  penampung.getStore()?.push(entri);
}

/** Ringkasan yang bisa dibaca manusia: berapa panggilan, dilayani siapa saja. */
export function ringkasJejakAi(jejak: JejakPanggilanAi[]): {
  panggilan: number;
  gagal: number;
  penyedia: string[];
  penyediaTidakDilaporkan: number;
  promptTokens: number;
  payloadMintaKunciRute: boolean;
  /** Model yang benar-benar DILAYANI. Bukti sisi hulu, bukan niat sisi klien. */
  modelDilayani: string[];
  /**
   * Konfigurasi lengan pengukuran. Dipakai `kesahihan.mjs` untuk MENOLAK
   * membandingkan dua berkas hasil yang lahir dari lengan berbeda.
   * Berisi HIMPUNAN, bukan satu nilai: dalam satu giliran wajar ada beberapa
   * temperature (Sentinel & miner mengirim miliknya sendiri) — kecuali saat
   * `EVAL_TEMPERATURE` memaksa semuanya sama, dan itu justru tandanya.
   */
  konfigurasi: {
    modelDiminta: string[];
    /** Identitas lengan. `null` = tidak terekam ATAU tidak konsisten → JANGAN dibandingkan. */
    lengan: LenganEval | null;
    /** Diagnostik saja. TIDAK boleh dipakai sebagai identitas lengan (NB-5). */
    temperatureEfektif: number[];
  };
} {
  const penyedia = [...new Set(jejak.map((e) => e.penyedia).filter((p): p is string => Boolean(p)))];
  return {
    panggilan: jejak.length,
    gagal: jejak.filter((e) => e.galat).length,
    penyedia,
    // Dihitung hanya dari percobaan yang BERHASIL: percobaan gagal memang tidak
    // punya badan respons, jadi memasukkannya akan membuat "tidak dilaporkan"
    // terlihat besar karena alasan yang salah.
    penyediaTidakDilaporkan: jejak.filter((e) => !e.galat && !e.penyedia).length,
    promptTokens: jejak.reduce((n, e) => n + (e.promptTokens ?? 0), 0),
    payloadMintaKunciRute: jejak.length > 0 && jejak.every((e) => e.payloadMintaKunciRute),
    modelDilayani: [...new Set(jejak.map((e) => e.modelDilayani).filter((m): m is string => Boolean(m)))],
    konfigurasi: {
      modelDiminta: [...new Set(jejak.map((e) => e.modelDiminta).filter(Boolean))].sort(),
      lengan: lenganSeragam(jejak),
      temperatureEfektif: [...new Set(jejak.map((e) => e.temperature).filter((t): t is number => t !== null))].sort((a, b) => a - b),
    },
  };
}

/**
 * Lengan yang berlaku untuk seluruh jejak, atau `null` kalau tidak terekam /
 * tidak seragam. `null` WAJIB dibaca sebagai "tidak diketahui" dan menghalangi
 * perbandingan — bukan sebagai "sama dengan yang lain yang juga kosong".
 */
function lenganSeragam(jejak: JejakPanggilanAi[]): LenganEval | null {
  const ada = jejak.map((e) => e.lenganEval).filter(Boolean);
  if (!ada.length || ada.length !== jejak.length) return null;
  const [a] = ada;
  const seragam = ada.every((l) => l.temperature === a.temperature && l.seed === a.seed && l.kunciRute === a.kunciRute);
  return seragam ? { ...a } : null;
}
