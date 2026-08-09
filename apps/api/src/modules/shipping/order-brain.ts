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
