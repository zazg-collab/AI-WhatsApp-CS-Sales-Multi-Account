/**
 * >>> ANGGA — F2 gelombang v2 (2026-08-09, cowork): LAPISAN PENJAGA BERSAMA.
 *
 * Berkas ini memuat SEPARUH lapisan penjaga: bagian PENANDA & SENSOR — merender
 * kosakata `{{token}}` yang boleh dipakai model, dan menyensornya sesuai langkah
 * funnel. Semuanya fungsi MURNI atas objek kutipan `ShippingQuote`; tidak ada
 * satu pun yang membaca teks pelanggan.
 *
 * Separuh yang lain — bagian ALUR/LANGKAH (funnel expect, tangga ambiguitas,
 * jembatan ASUMSI) — MASIH di `shipping.service.ts`, lihat daftar di bawah.
 *
 * Kenapa dikeluarkan: di v2, pemicunya berpindah dari `classifyTurn` (regex) ke
 * hasil tool call, dan pemakainya bertambah dari satu (produksi) jadi dua
 * (produksi + test-harness). Isi penjaganya sendiri tidak berubah sebaris pun —
 * itu sebabnya F2 murni refactor: seluruh test lama harus tetap hijau apa adanya.
 *
 * ⚠️ CAKUPAN F2 YANG SEBENARNYA: dari 6 butir yang didaftar blueprint §4, yang
 * benar-benar pindah ada 2. EMPAT butir sengaja ditunda ke F5 — dicatat lengkap
 * di sini supaya tidak ada yang mengira order-brain sudah utuh:
 *
 *   1. `funnelDirective` (238 baris; 7x `this.orderLog`, 5x `this.cache`, plus
 *      `turnMemo`/`settings`/`logger`) — memindahnya = memecah service, bukan
 *      mengekstrak fungsi murni.
 *   2. `setExpectGiliran` (`this.cache`, `this.turnMemo`) — kecil, TAPI dia
 *      penulis KEDUA dari `funnelExpect` selain `funnelDirective`. Memindah satu
 *      tanpa yang lain memecah satu konsep ke dua berkas — lebih buruk daripada
 *      membiarkan keduanya. Pindah berbarengan, atau tidak sama sekali.
 *   3. Tangga ambiguitas (`MAX_DESTINATION_ASKS`, hitungan `ronde`) — belum
 *      berbentuk fungsi sama sekali; masih cabang inline di `getGroundingText`.
 *      Harus DIJADIKAN fungsi dulu, dan itu membongkar badan `getGroundingText`
 *      yang memang jadi pekerjaan F5.
 *   4. Jembatan ASUMSI — bukan satu unit: instruksinya tersebar di beberapa
 *      cabang grounding, penegakannya di `resolvePriceTokens`.
 *
 * Benang merahnya sama: keempatnya menyentuh STATE per-percakapan (cache/memo)
 * atau belum berbentuk fungsi, dan pemanggilnya memang berubah di F5. Dipindah
 * sekali di F5, bukan dua kali.
 */
import type { ShippingQuote } from './shipping-quote.cache';

/** Format rupiah untuk grounding text: "152.500". Sengaja manual, bukan
 *  `toLocaleString('id-ID')`, supaya hasilnya tidak bergantung pada ICU build
 *  Node di server produksi. */
export function formatIdr(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}


export const POLA_TOKEN_TOTAL =
  /\{\{(rincian_tagihan|subtotal_barang|total_transfer|total_cod|blok_total|total_transfer_diskon|total_cod_diskon|total_transfer_nego|total_cod_nego)\}\}/i;

/**
 * >>> ANGGA — koreksi UJI LAPANGAN (2026-08-10, cowork): penanda yang HANYA sah
 * di langkah closing. `{{catatan_sk}}` itu blok syarat & ketentuan penutup
 * pesanan; ia bukan penanda HARGA, jadi seluruh gerbang uang membiarkannya
 * lewat. Di sesi uji nyata model menyodorkan blok S&K enam poin lengkap di
 * langkah PATOKAN — pelanggan baru ditanya alamat, sudah diberi penutupan.
 * Gerbang uang memang menahan giliran itu (karena rekap totalnya), tapi retry
 * hanya membuang tokennya total; blok S&K-nya lolos utuh.
 */
export const POLA_TOKEN_CLOSING = /\{\{(catatan_sk)\}\}/i;

export function sensorBarisTotal(lines: string[]): void {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^• \{\{/.test(lines[i]) && POLA_TOKEN_TOTAL.test(lines[i])) lines.splice(i, 1);
  }
}

export function sensorSemuaTokenHarga(lines: string[]): void {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^• (\{\{(harga_satuan|ongkir|subtotal_barang|diskon_ongkir|diskon_barang|total_|blok_total|rincian_tagihan)|Subtotal|Ongkir|Total|Rp)/i.test(lines[i])) {
      lines.splice(i, 1);
    }
  }
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

/**
 * >>> ANGGA — F4 (2026-08-09, cowork) + koreksi audit (2026-08-09).
 *
 * SATU definisi normalisasi, dipakai gerbang `funnel_dilanggar` di
 * `shipping.service.ts` DAN penyusun balasan di bawah: huruf kecil, semua yang
 * bukan huruf/angka jadi spasi, spasi beruntun dirapatkan, lalu di-trim.
 *
 * KOREKSI AUDIT: dulu ada DUA implementasi — `normFunnel` (lowercase dulu, baru
 * saring) dan `normalisasiBerpeta` (saring dulu, baru lowercase). Untuk karakter
 * yang lowercase-nya mekar jadi huruf + tanda gabung ("Istanbul" dengan I
 * bertitik) keduanya menghasilkan string BERBEDA, padahal yang satu dipakai
 * membuat pola dan yang lain dipakai mencarinya — kalimat yang sudah ada jadi
 * tidak ketemu, lalu ditempel lagi. Sekarang `normFunnel` DITURUNKAN dari
 * fungsi berpeta, jadi keduanya mustahil berbeda menurut konstruksi.
 */
export function normFunnel(s: string): string {
  return normalisasiBerpeta(s).norm;
}

/**
 * Normalisasi SEKALIGUS memetakan tiap UNIT UTF-16 hasil ke indeks aslinya di
 * `s`. Dibutuhkan karena kita mencocokkan di ruang ternormalisasi tapi harus
 * MEMOTONG di teks asli.
 *
 * KOREKSI AUDIT: `peta` dulu didorong satu entri per KODE TITIK sementara
 * `norm` dirangkai per UNIT UTF-16. Untuk huruf/angka di luar BMP (huruf
 * matematis, Adlam, CJK ext-B) satu kode titik = dua unit, jadi sejak karakter
 * itu SELURUH peta meleset — potongan memotong di tengah kata, dan kalau
 * `peta[a]` sampai `undefined`, `slice(0, undefined) + slice(NaN)`
 * MENGGANDAKAN seluruh balasan. Sekarang peta didorong per unit, jadi
 * `peta.length === norm.length` selalu.
 */
function normalisasiBerpeta(s: string): { norm: string; peta: number[] } {
  const keluar: string[] = [];
  const peta: number[] = [];
  let idx = 0;
  for (const cp of Array.from(s ?? '')) {
    const panjang = cp.length;
    // Lowercase DULU, uji per kode titik hasilnya — urutan yang sama dengan
    // regex `[^\p{L}\p{N} ]` yang dulu dipakai `normFunnel`.
    for (const ch of Array.from(cp.toLowerCase())) {
      if (/[\p{L}\p{N}]/u.test(ch)) {
        for (let k = 0; k < ch.length; k++) {
          keluar.push(ch[k]);
          peta.push(idx);
        }
      } else if (keluar.length > 0 && keluar[keluar.length - 1] !== ' ') {
        keluar.push(' ');
        peta.push(idx);
      }
    }
    idx += panjang;
  }
  while (keluar.length > 0 && keluar[keluar.length - 1] === ' ') {
    keluar.pop();
    peta.pop();
  }
  return { norm: keluar.join(''), peta };
}

/** Lebar maksimum satu "lubang" penanda saat pencocokan toleran. Dibatasi
 *  supaya regex berlubang-banyak tidak bisa jadi backtracking berdetik-detik di
 *  event loop — kalimat funnel bisa disunting dari dashboard, jadi bentuknya
 *  bukan sesuatu yang bisa kita jamin. */
const LEBAR_LUBANG_MAKS = 400;

/**
 * Pola untuk bentuk TERSUBSTITUSI kalimat wajib: tiap `{{...}}` jadi LUBANG,
 * potongan literal di antaranya harus cocok berurutan.
 *
 * KOREKSI AUDIT: versi pertama membuang potongan literal KOSONG di ujung. Untuk
 * kalimat yang BERAKHIR dengan penanda — dan template closing COD default
 * memang berakhir `{{catatan_sk}}` — polanya berhenti di literal sebelum
 * penanda terakhir, sehingga (a) cek "sudah menutup" tidak pernah kena dan
 * (b) potongan yang dihapus salah, memotong formulir closing jadi berantakan
 * SETIAP giliran. Sekarang ekor penanda diberi jangkar rakus sampai akhir teks.
 */
function polaKalimat(kalimat: string): RegExp | null {
  const bagian = kalimat.split(/\{\{[a-z_]+\}\}/gi).map(normFunnel);
  const ekorPenanda = bagian.length > 1 && bagian[bagian.length - 1] === '';
  const inti = bagian.filter((b) => b.length > 0);
  if (inti.length === 0) return null;
  const escape = (b: string) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const badan = inti.map(escape).join(`[\\s\\S]{1,${LEBAR_LUBANG_MAKS}}?`);
  return new RegExp(ekorPenanda ? `${badan}[\\s\\S]*$` : badan, 'g');
}

interface Kemunculan {
  /** Rentang [awal, akhir) di teks ASLI. */
  asli: [number, number];
  /** Indeks akhir (eksklusif) di teks TERNORMALISASI — untuk cek "menutup". */
  akhirNorm: number;
  /** false = rentang ini hasil GABUNGAN kemunculan yang tumpang tindih, jadi
   *  bukan "satu kemunculan bersih" dan tidak boleh dihitung sebagai penutup. */
  tunggal: boolean;
}

function cariKemunculan(prosa: string, kalimat: string): { hits: Kemunculan[]; panjangNorm: number } {
  const target = normFunnel(kalimat);
  const { norm, peta } = normalisasiBerpeta(prosa);
  if (!target || !norm) return { hits: [], panjangNorm: norm.length };

  let mentah: Array<[number, number]> = [];

  // 1) LITERAL dulu — jalur normal: prosa model memuat penanda `{{...}}` apa
  //    adanya, sama seperti kalimat wajibnya, jadi cocok persis. Maju satu
  //    karakter (bukan sepanjang target) supaya kemunculan tumpang tindih ikut
  //    terhitung; rentangnya digabung di bawah.
  for (let dari = 0; ; ) {
    const i = norm.indexOf(target, dari);
    if (i < 0) break;
    mentah.push([i, i + target.length]);
    dari = i + 1;
  }

  // 2) Baru pola TOLERAN-PENANDA, HANYA kalau literal tidak menemukan apa pun.
  //    Bentuk tersubstitusi cuma lahir di jalur retry gerbang uang, jadi ini
  //    memang jalur cadangan — bukan jalur utama.
  if (mentah.length === 0 && /\{\{[a-z_]+\}\}/i.test(kalimat)) {
    const pola = polaKalimat(kalimat);
    if (pola) {
      for (const m of norm.matchAll(pola)) {
        if (m.index === undefined || m[0].length === 0) continue;
        mentah.push([m.index, m.index + m[0].length]);
      }
    }
  }
  if (mentah.length === 0) return { hits: [], panjangNorm: norm.length };

  mentah.sort((a, b) => a[0] - b[0]);
  const gabung: Array<[number, number, boolean]> = [[mentah[0][0], mentah[0][1], true]];
  for (const [a, b] of mentah.slice(1)) {
    const akhir = gabung[gabung.length - 1];
    if (a <= akhir[1]) {
      akhir[1] = Math.max(akhir[1], b);
      akhir[2] = false; // digabung → bukan kemunculan bersih
    } else gabung.push([a, b, true]);
  }

  const hits: Kemunculan[] = gabung.map(([a, b, tunggal]) => {
    const awalAsli = peta[a];
    let j = b;
    while (j < norm.length && norm[j] === ' ') j++;
    const akhirAsli = j < peta.length ? peta[j] : prosa.length;
    return { asli: [awalAsli, Math.max(awalAsli, akhirAsli)], akhirNorm: b, tunggal };
  });
  return { hits, panjangNorm: norm.length };
}

/** Hasil penyusunan balasan. `disisipkan` = sistem yang menempelkan kalimatnya. */
export interface HasilSusunBalasan {
  text: string;
  disisipkan: boolean;
  salinanDibuang: number;
}

/**
 * Susun balasan final: prosa model + kalimat funnel wajib, DIJAMIN muncul
 * TEPAT SEKALI di akhir.
 *
 * Tiga jalur, dan urutannya penting:
 *
 *  1. **Prosa sudah menutup dengan kalimatnya, tepat sekali → dikembalikan APA
 *     ADANYA, byte per byte.** Ini jalur normal hari ini, dan sengaja dibuat
 *     no-op total supaya F4 tidak mengubah satu pun keluaran yang selama ini
 *     sudah benar. Kalau jalur ini menulis ulang teks (misal merapikan spasi),
 *     seluruh test lama yang membandingkan string akan goyah tanpa ada yang
 *     jadi lebih benar.
 *  2. **Kalimatnya muncul lebih dari sekali, atau nyempil di tengah** → semua
 *     salinan DIBUANG lalu ditempel sekali di akhir. Ini menggantikan gerbang
 *     `kalimat_dobel` yang dulu MENAHAN draft: perbaikan deterministik lebih
 *     baik daripada penolakan, karena pelanggan tetap dapat jawaban.
 *  3. **Kalimatnya tidak ada** → ditempel. Ini yang membuat kelas
 *     `funnel_dilanggar` "kalimat hilang" mustahil terjadi di jalur produksi:
 *     kalimatnya bukan lagi sesuatu yang DIHARAP muncul dari model, tapi
 *     sesuatu yang DIPASANG sistem.
 *
 * `kalimat` kosong = langkah funnel aktif tapi pertanyaannya sedang dibungkam
 * (cap 2x tanya kena). Tidak ada yang ditempel — gembok totalnya tetap hidup
 * lewat `funnelExpect`, itu urusan gerbang, bukan urusan penyusun ini.
 */
export function susunBalasan(
  prosa: string,
  kalimat: string,
  opts: { tempel?: boolean } = {},
): HasilSusunBalasan {
  // `tempel: false` = BUANG SAJA, jangan pasang. Dipakai segmen burst yang
  // BUKAN segmen terakhir: pertanyaan penutup cuma boleh muncul sekali untuk
  // seluruh balasan, dan tempatnya di ujung — kalau tiap segmen ditempeli,
  // pelanggan menerima pertanyaan yang sama beberapa kali berturut-turut.
  const tempel = opts.tempel !== false;
  const wajib = (kalimat ?? '').trim();
  const teksAwal = prosa ?? '';
  if (!wajib) return { text: teksAwal, disisipkan: false, salinanDibuang: 0 };

  // >>> ANGGA — koreksi UJI LAPANGAN (2026-08-10, cowork): PROSA KOSONG TIDAK
  // BOLEH DITEMPELI. Ditemukan Bossfren di sesi uji nyata, dan log
  // membuktikannya: provider memulangkan `{"content":""}` — model tidak
  // menjawab APA PUN — lalu fungsi ini dengan patuh menempelkan kalimat funnel,
  // dan yang sampai ke pelanggan adalah "mau ambil berapa pcs kak?" sebagai
  // jawaban atas pertanyaan ONGKIR.
  //
  // Itu lebih buruk daripada balasan kosong. Kosong itu jujur — kelihatan
  // gagal, dan ada gerbang yang menanganinya. Yang ini MENYAMARKAN kegagalan
  // total jadi balasan yang terlihat wajar, sehingga tidak ada manusia maupun
  // gerbang yang tahu sistemnya barusan tidak menjawab.
  //
  // Prinsipnya: komposisi ini MEMPERBAIKI balasan, bukan MENJADI balasan.
  // Ditolak di sini, bukan di pemanggil, supaya tidak ada pemanggil baru yang
  // bisa lupa memeriksanya.
  if (!teksAwal.trim()) return { text: teksAwal, disisipkan: false, salinanDibuang: 0 };

  if (!normFunnel(wajib)) return { text: teksAwal, disisipkan: false, salinanDibuang: 0 };

  const { hits, panjangNorm } = cariKemunculan(teksAwal, wajib);
  // "Sudah menutup" = kemunculan tunggal yang berakhir di ujung teks
  // ternormalisasi. Dihitung dari indeks, bukan `endsWith`, supaya bentuk
  // TERSUBSTITUSI (yang tidak sama persis dengan kalimat kanonik) tetap
  // terhitung menutup.
  if (tempel && hits.length === 1 && hits[0].tunggal && hits[0].akhirNorm === panjangNorm) {
    return { text: teksAwal, disisipkan: false, salinanDibuang: 0 };
  }
  if (!tempel && hits.length === 0) {
    return { text: teksAwal, disisipkan: false, salinanDibuang: 0 };
  }

  let badan = teksAwal;
  for (let i = hits.length - 1; i >= 0; i--) {
    badan = badan.slice(0, hits[i].asli[0]) + badan.slice(hits[i].asli[1]);
  }
  badan = badan.replace(/[\s]+$/u, '').replace(/^[\s]+/u, '');
  // Sisa yang tidak memuat satu pun huruf/angka ("!!! ???") bukan badan
  // balasan — itu sampah tanda baca dari model, jangan ikut terkirim.
  if (badan && !normFunnel(badan)) badan = '';
  if (!tempel) {
    return { text: badan, disisipkan: false, salinanDibuang: hits.length };
  }
  return {
    text: badan ? `${badan}\n\n${wajib}` : wajib,
    disisipkan: true,
    salinanDibuang: hits.length,
  };
}
