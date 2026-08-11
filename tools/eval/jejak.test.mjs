import test from 'node:test';
import assert from 'node:assert/strict';
import { bangunJejak } from './jejak.mjs';

/**
 * >>> BARU-1 langkah 1 (2026-08-11, cowork): test MERAH untuk INSTRUMENTASI.
 *
 * Kenapa test ini ada sebelum satu angka pun diukur: seluruh keputusan BARU-1
 * bergantung pada isi `jejak`. Kalau pemetaannya salah nama field — dan
 * `DebugSnapshot` PUNYA jebakan nama (`funnelMode` vs `funnelStep`, `ongkir`
 * vs `items`, `aiRingkas` vs `aiCalls`, `toolCalls` vs `aiCalls`) — berkas
 * hasilnya akan berisi `null` yang terlihat sah, satu putaran ukur terbuang
 * (butuh laptop + kuota LLM + risiko 429), dan yang membacanya akan
 * menyimpulkan "tokens memang kosong" padahal yang kosong pemetaannya.
 *
 * Yang dipatok di sini bukan cuma "ada fieldnya", tapi SEMANTIK NILAI-HILANG
 * yang dijanjikan komentar `jejak.mjs` — dan yang sebelum ini tidak dijaga apa
 * pun:
 *   `tokens: null` = giliran tanpa `debugInfo` sama sekali
 *   `tokens: {}`   = ada snapshot, tidak ada kutipan hidup
 *   `ai: undefined` = biner yang diukur belum punya pencatat penyedia
 *                     (BEDA dari `{panggilan:0}` = giliran ini tidak menembak LLM)
 */

/**
 * Snapshot bergaya `DebugInfoCollector` untuk provider nyata.
 *
 * ⚠️ `items[].price` di sini SENGAJA 398000, bukan 199000: collector menghitung
 * `Math.round(goodsTotal / items.length)` — rata-rata per BARIS item yang
 * mengabaikan `qty` — jadi untuk satu baris qty 2 @199.000 angka yang benar-benar
 * keluar dari collector adalah 398000. (Bahwa field bernama `price` padahal
 * isinya rata-rata adalah cacat PRA-ADA yang tercatat sebagai utang; fixture
 * di sini meniru kenyataan, bukan namanya.)
 */
const snapshotPenuh = {
  status: 'funnel:total',
  funnelMode: 'total',
  funnelStep: 'total',
  kotaTujuan: 'Mataram, Nusa Tenggara Barat',
  ongkir: { amount: 50000, courier: 'JNE', service: 'transfer+cod' },
  items: [{ name: 'Golok Sembelih Multifungsi', qty: 2, price: 398000 }],
  tokens: {
    kota_tujuan: 'Mataram, Nusa Tenggara Barat',
    subtotal_barang: 'Rp398.000',
    ongkir: 'Rp50.000',
    total_transfer: 'Rp448.000',
    total_cod: 'Rp457.500',
    blok_total: '• Transfer : Rp448.000\n• COD      : Rp457.500  (kurir JNE)',
  },
  gateWarnings: ['angka_tak_bersumber'],
  toolCalls: [{ name: 'hitung_ongkir', args: { kota: 'Cakranegara' }, result: { ok: true } }],
  aiRingkas: { panggilan: 4, gagal: 0, penyedia: ['DeepInfra'] },
};

test('tokens disimpan UTUH beserta nilainya, bukan cuma keberadaannya', () => {
  const j = bangunJejak(snapshotPenuh);
  // Inti BARU-1: yang dicari NILAInya. `adaOngkir` sudah lama jadi proksi
  // sempurna untuk "tokens tidak kosong" (rantainya diverifikasi sampai
  // `debugState()`), jadi menyimpan boolean lagi di sini sama dengan tidak
  // mengukur apa-apa.
  assert.deepEqual(j.tokens, snapshotPenuh.tokens);
  assert.equal(j.tokens.total_transfer, 'Rp448.000');
  assert.equal(j.tokens.blok_total.includes('Rp457.500'), true);
});

test('funnelStep MENTAH disimpan terpisah dari funnelMode yang sudah diruntuhkan', () => {
  const j = bangunJejak({ ...snapshotPenuh, funnelMode: 'normal', funnelStep: 'keranjang' });
  assert.equal(j.funnelMode, 'normal');
  assert.equal(j.funnelStep, 'keranjang');
});

test('toolDipakai = NAMA tool yang jalan di giliran ini, argumen & hasil dibuang', () => {
  const j = bangunJejak(snapshotPenuh);
  assert.deepEqual(j.toolDipakai, ['hitung_ongkir']);
  // Ini yang memisahkan "kutipan LAHIR di giliran ini" dari "kutipan sudah ada
  // sejak sebelumnya" — satu-satunya pemilah yang tersedia, karena seluruh
  // snapshot adalah keadaan PASCA-giliran.
  assert.deepEqual(bangunJejak({ ...snapshotPenuh, toolCalls: undefined }).toolDipakai, []);
  // Argumen/hasil TIDAK boleh ikut: berkas hasil akan membengkak tanpa
  // menjawab apa pun.
  assert.equal(JSON.stringify(j.toolDipakai).includes('Cakranegara'), false);
});

test('toolDipakai tahan bentuk cacat — nol lemparan, nama hilang jadi "?"', () => {
  const j = bangunJejak({ ...snapshotPenuh, toolCalls: [{ args: {} }, null, { name: 'cek_stok' }] });
  assert.deepEqual(j.toolDipakai, ['?', '?', 'cek_stok']);
});

test('snapshot ADA tapi kutipan tidak hidup → tokens {} , BUKAN null', () => {
  const j = bangunJejak({ status: 'normal', funnelMode: 'normal', tokens: {}, gateWarnings: [], items: [] });
  assert.deepEqual(j.tokens, {});
  assert.equal(j.funnelStep, null);
  assert.equal(j.adaOngkir, false);
  assert.equal(j.jumlahItem, 0);
  assert.deepEqual(j.toolDipakai, []);
});

test('snapshot yang KEHILANGAN kunci tokens juga → {} (bukan null, bukan undefined)', () => {
  // Kasus ini yang bikin komentar `jejak.mjs` harus jujur: `{}` bukan bukti
  // "kutipan belum lahir". Tanpa test ini, pemetaan bisa dibalik ke `?? null`
  // atau `?? undefined` tanpa satu pun alarm.
  const { tokens, ...tanpaTokens } = snapshotPenuh;
  const j = bangunJejak(tanpaTokens);
  assert.deepEqual(j.tokens, {});
  assert.equal(j.tokens === null, false);
  assert.equal(j.tokens === undefined, false);
});

test('giliran TANPA debugInfo → tokens null (dibedakan dari {} di atas)', () => {
  for (const kosong of [null, undefined]) {
    const j = bangunJejak(kosong);
    assert.equal(j.tokens, null, `gagal untuk ${String(kosong)}`);
    assert.equal(j.funnelMode, null);
    assert.equal(j.funnelStep, null);
    assert.equal(j.adaOngkir, false);
    assert.equal(j.jumlahItem, 0);
    assert.deepEqual(j.gateWarnings, []);
    assert.deepEqual(j.toolDipakai, []);
  }
});

test('`ai` absen TIDAK boleh diruntuhkan jadi null-yang-terlihat-terukur', () => {
  // Catatan jujur (ronde 2 audit K23): `ringkasPenyedia` memakai `if (!r)`,
  // jadi `undefined` dan `null` SAMA-SAMA jatuh ke `giliranTanpaAlat` — beda
  // yang benar-benar ia baca adalah "absen/cacat" vs "`panggilan:0`". Test ini
  // tetap ada karena ia mematok KONTRAK pemetaan (jangan mengarang nilai untuk
  // data yang tidak ada), bukan karena ia mengubah vonis.
  const { aiRingkas, ...tanpaAi } = snapshotPenuh;
  assert.equal(bangunJejak(tanpaAi).ai, undefined);
  assert.deepEqual(bangunJejak(snapshotPenuh).ai, snapshotPenuh.aiRingkas);
});

test('field lama tidak berubah maknanya — pagar anti-regresi', () => {
  const j = bangunJejak(snapshotPenuh);
  assert.equal(j.adaOngkir, true);
  assert.equal(j.jumlahItem, 1);
  assert.deepEqual(j.gateWarnings, ['angka_tak_bersumber']);
});

test('tokens TIDAK dibagi-pakai dengan snapshot (salinan, bukan rujukan)', () => {
  const snap = { ...snapshotPenuh, tokens: { total_transfer: 'Rp1' } };
  const j = bangunJejak(snap);
  snap.tokens.total_transfer = 'DIUBAH';
  assert.equal(j.tokens.total_transfer, 'Rp1');
});

test('invarian yang seluruh irisan ini bersandar padanya: tokens≠{} ⟺ adaOngkir', () => {
  // Diverifikasi sampai hulu di ronde 2 (`debugState()` → `quote ?
  // buildPriceTokens(quote) : {}`; `snap.ongkir` diisi iff `quote`). Dipatok di
  // sini supaya kalau biner berubah dan invariannya pecah, yang pecah ketahuan
  // di test — bukan sesudah satu putaran ukur dipakai mengambil keputusan.
  // `replay.mjs` mencetak kawat sandung yang sama untuk data sungguhan.
  const isi = bangunJejak(snapshotPenuh);
  assert.equal(Object.keys(isi.tokens).length > 0, isi.adaOngkir);
  const kosong = bangunJejak({ funnelMode: 'normal', tokens: {}, gateWarnings: [], items: [] });
  assert.equal(Object.keys(kosong.tokens).length > 0, kosong.adaOngkir);
});
