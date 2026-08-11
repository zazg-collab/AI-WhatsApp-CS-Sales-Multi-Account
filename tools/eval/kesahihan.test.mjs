/**
 * >>> ANGGA — F6 Bagian 1, ronde perbaikan audit K23 (2026-08-11, cowork).
 *
 * Tiap test di bawah adalah TEMUAN AUDIT yang dikunci, bukan test yang ditulis
 * untuk menaikkan cakupan. Nama testnya sengaja menyebut nomor temuannya supaya
 * siapa pun yang nanti "menyederhanakan" logika vonis tahu persis apa yang ia
 * hidupkan kembali.
 *
 * Jalankan: node --test tools/eval/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cetakKesahihan, ringkasPenyedia } from './kesahihan.mjs';

const ai = (o = {}) => ({
  panggilan: 1, gagal: 0, penyedia: ['DeepSeek'], penyediaTidakDilaporkan: 0,
  promptTokens: 100, payloadMintaKunciRute: true, modelDilayani: ['deepseek/v4'], ...o,
});
const giliran = (o) => ({ jejak: { ai: o === null ? undefined : ai(o) } });
/** Satu putaran berisi n giliran serupa. */
const putaran = (...g) => [g];

/** Vonis tanpa membanjiri keluaran test. */
function vonis(p) {
  const asli = console.log;
  console.log = () => {};
  try { return cetakKesahihan(p); } finally { console.log = asli; }
}

test('jalan bahagia: satu penyedia, satu model, semua minta kunci → SAH', () => {
  assert.equal(vonis(putaran(giliran({}), giliran({}))).sah, true);
});

test('T5a — penyedia TIDAK DILAPORKAN membatalkan vonis (dulu tetap dapat ✔)', () => {
  // 70 dari 72 giliran tanpa data penyedia dulu tetap dinyatakan layak
  // dibandingkan, karena `takDilaporkan` dicetak tapi tak pernah jadi masalah.
  const p = putaran(giliran({}), giliran({ penyedia: [], penyediaTidakDilaporkan: 1 }));
  assert.equal(vonis(p).sah, false);
});

test('cacat-baru-1 — percobaan GAGAL membatalkan vonis', () => {
  assert.equal(vonis(putaran(giliran({}), giliran({ gagal: 1, panggilan: 2 }))).sah, false);
});

test('T5b — NOL penyedia dilaporkan tidak boleh berakhir tanpa vonis', () => {
  // Dulu: `daftar.length===0` melewati cabang ⚠ DAN cabang ✔ → alat DIAM,
  // dan pembaca yang memindai mencari "⚠" menyimpulkan angkanya lolos.
  const p = putaran(giliran({ penyedia: [], penyediaTidakDilaporkan: 1 }));
  assert.equal(vonis(p).sah, false);
});

test('T5c — penyedia null yang disaring tidak boleh menyamar jadi "satu penyedia"', () => {
  // 1 panggilan lapor DeepSeek + 3 panggilan tanpa laporan (bisa 3 penyedia
  // berbeda) dulu diringkas jadi `penyedia:['DeepSeek']` → bukti "konsisten".
  const p = putaran(giliran({ panggilan: 4, penyedia: ['DeepSeek'], penyediaTidakDilaporkan: 3 }));
  assert.equal(vonis(p).sah, false);
});

test('T6 — giliran TANPA panggilan LLM dikeluarkan dari penyebut, bukan dihitung gagal-kunci', () => {
  // Dulu giliran nol panggilan → payloadMintaKunciRute false → alat menuduh
  // operator lupa menyetel env padahal sudah benar.
  const p = putaran(giliran({}), giliran({ panggilan: 0, penyedia: [], modelDilayani: [], payloadMintaKunciRute: false }));
  const r = ringkasPenyedia(p);
  assert.equal(r.giliranBerLlm, 1);
  assert.equal(r.giliranTanpaLlm, 1);
  assert.equal(r.giliranMintaKunci, 1);
  assert.equal(vonis(p).sah, true);
});

test('cacat-baru-2 — putaran mock (semua giliran nol panggilan) → TIDAK SAH, tanpa menuduh env', () => {
  const p = putaran(giliran({ panggilan: 0, penyedia: [], modelDilayani: [], payloadMintaKunciRute: false }));
  assert.equal(vonis(p).sah, false);
});

test('dua penyedia berbeda → TIDAK SAH', () => {
  assert.equal(vonis(putaran(giliran({}), giliran({ penyedia: ['Novita'] }))).sah, false);
});

test('cacat-baru-3 — dua varian model dilayani → TIDAK SAH', () => {
  assert.equal(vonis(putaran(giliran({}), giliran({ modelDilayani: ['deepseek/v4-fp8'] }))).sah, false);
});

test('payload tidak minta kunci → TIDAK SAH', () => {
  assert.equal(vonis(putaran(giliran({ payloadMintaKunciRute: false }))).sah, false);
});

test('biner lama tanpa `aiRingkas` → TIDAK SAH, dan tidak pura-pura nol panggilan', () => {
  const p = [[{ jejak: {} }, { jejak: {} }]];
  assert.equal(ringkasPenyedia(p).giliranTanpaAlat, 2);
  assert.equal(vonis(p).sah, false);
});

test('putaran KOSONG tidak boleh dinyatakan sah', () => {
  assert.equal(vonis([]).sah, false);
});

// ─── OPSI C: penjaga lintas-lengan + perbandingan berpasangan (2026-08-11) ───

import { konfigurasiLengan, bedaKonfigurasi, pasangkanPerKasus } from './kesahihan.mjs';

const KELAS = ['kosong', 'tanya_dobel'];
/** Satu giliran hasil: n, teks kirim, kelas yang menyala, konfigurasi lengan. */
const L = (temperature = 0, seed = null, kunciRute = true) => ({ temperature, seed, kunciRute });
const g2 = (n, kirim, nyala = [], konf = { modelDiminta: ['m'], lengan: L(), temperatureEfektif: [0] }) => ({
  n, kirim,
  ...Object.fromEntries(KELAS.map((k) => [k, nyala.includes(k)])),
  jejak: { ai: { panggilan: 1, gagal: 0, penyedia: ['DeepSeek'], penyediaTidakDilaporkan: 0,
                 payloadMintaKunciRute: true, modelDilayani: ['m'], konfigurasi: konf } },
});
const berkas = (label, putaran) => ({ label, putaran });

test('konfigurasiLengan menyatukan konfigurasi dari seluruh giliran', () => {
  const d = berkas('A', [[g2(1, 'a', [], { modelDiminta: ['m'], lengan: L(0, 7), temperatureEfektif: [0] }),
                         g2(2, 'b', [], { modelDiminta: ['m'], lengan: L(0, 7), temperatureEfektif: [0] })]]);
  const k = konfigurasiLengan(d.putaran);
  assert.deepEqual(k.modelDiminta, ['m']);
  assert.deepEqual(k.lengan, L(0, 7));
});

test('bedaKonfigurasi: lengan SAMA → kosong (boleh dibandingkan)', () => {
  const A = berkas('A', [[g2(1, 'a')]]);
  const B = berkas('B', [[g2(1, 'a')]]);
  assert.deepEqual(bedaKonfigurasi([A, B]), []);
});

test('bedaKonfigurasi: temperature BEDA → ditolak (lengan 1 vs lengan 2)', () => {
  // Ini kesalahan yang paling mudah terjadi begitu ada dua lengan: menyandingkan
  // angka temperature 0 dengan angka temperature 0.6 lalu menyimpulkan
  // "commit B lebih baik".
  const A = berkas('A', [[g2(1, 'a', [], { modelDiminta: ['m'], lengan: L(0), temperatureEfektif: [0] })]]);
  const B = berkas('B', [[g2(1, 'a', [], { modelDiminta: ['m'], lengan: L(null), temperatureEfektif: [0.6] })]]);
  const beda = bedaKonfigurasi([A, B]);
  assert.equal(beda.length, 1);
  assert.match(beda[0], /^lengan:/);
});

test('bedaKonfigurasi: model diminta BEDA → ditolak', () => {
  const A = berkas('A', [[g2(1, 'a', [], { modelDiminta: ['llama'], lengan: L(), temperatureEfektif: [0] })]]);
  const B = berkas('B', [[g2(1, 'a', [], { modelDiminta: ['deepseek'], lengan: L(), temperatureEfektif: [0] })]]);
  assert.match(bedaKonfigurasi([A, B])[0], /^modelDiminta:/);
});

test('berpasangan: kasus yang TIDAK berubah tidak muncul sama sekali', () => {
  // Inti tuasnya: kasus stabil menyumbang NOL ke selisih, bukan menyumbang
  // kebisingan seperti pada perbandingan dua persentase agregat.
  const A = berkas('A', [[g2(1, 'a', ['kosong']), g2(2, 'b'), g2(3, 'c')]]);
  const B = berkas('B', [[g2(1, 'a', ['kosong']), g2(2, 'b'), g2(3, 'c', ['kosong'])]]);
  const r = pasangkanPerKasus(A, B, KELAS);
  assert.equal(r.sepadan, true);
  assert.equal(r.dibandingkan, 3);
  assert.equal(r.berubah.length, 1);          // hanya giliran 3
  assert.equal(r.berubah[0].n, 3);
  assert.equal(r.berubah[0].delta.kosong.arah, 'memburuk');
});

test('berpasangan: arah "membaik" terbaca', () => {
  const A = berkas('A', [[g2(1, 'a', ['tanya_dobel'])]]);
  const B = berkas('B', [[g2(1, 'a')]]);
  const r = pasangkanPerKasus(A, B, KELAS);
  assert.equal(r.berubah[0].delta.tanya_dobel.arah, 'membaik');
  assert.equal(r.berubah[0].delta.tanya_dobel.a, '1/1');
  assert.equal(r.berubah[0].delta.tanya_dobel.b, '0/1');
});

test('berpasangan: dibandingkan sebagai RASIO, jadi jumlah putaran boleh beda', () => {
  const A = berkas('A', [[g2(1, 'a', ['kosong'])], [g2(1, 'a', ['kosong'])]]);  // 2/2
  const B = berkas('B', [[g2(1, 'a', ['kosong'])]]);                             // 1/1
  assert.equal(pasangkanPerKasus(A, B, KELAS).berubah.length, 0);
});

test('berpasangan: skenario BERBEDA di indeks yang sama → MENOLAK, bukan tabel rapi', () => {
  const A = berkas('A', [[g2(1, 'halo kak')]]);
  const B = berkas('B', [[g2(1, 'ongkir ke mataram brp ya?')]]);
  const r = pasangkanPerKasus(A, B, KELAS);
  assert.equal(r.sepadan, false);
  assert.deepEqual(r.takSepadan, [1]);
  assert.deepEqual(r.berubah, []);
});

// ─── Ronde perbaikan audit K23 putaran ke-2 (2026-08-11) ───

/** Berkas dengan daftar kelas eksplisit di `ringkasan.hit` (dipakai A3). */
const berkasK = (label, putaran, kelas = KELAS) =>
  ({ label, putaran, ringkasan: { hit: Object.fromEntries(kelas.map((k) => [k, 0])), giliranTotal: 0 } });

test('A2 — berkas TANPA data lengan ditolak, BUKAN dianggap "selengan"', () => {
  // Dulu: dua berkas kosong sama-sama menghasilkan himpunan kosong → lolos.
  const kosong = { label: 'X', putaran: [[{ n: 1, kirim: 'a', jejak: {} }]] };
  const beda = bedaKonfigurasi([kosong, kosong]);
  assert.equal(beda.length, 1);
  assert.match(beda[0], /TIDAK DIKETAHUI/);
});

test('NB-5/A11 — temperature EFEKTIF beda tapi LENGAN sama → tetap boleh dibandingkan', () => {
  // `extractOrderTarget` (temperature 0) dipanggil lazy, jadi satu berkas bisa
  // punya [0,0.6] dan yang lain [0.6] MESKI lengannya identik. Dulu ini bikin
  // dua berkas selengan saling ditolak (exit 4).
  const A = berkas('A', [[g2(1, 'a', [], { modelDiminta: ['m'], lengan: L(null), temperatureEfektif: [0, 0.6] })]]);
  const B = berkas('B', [[g2(1, 'a', [], { modelDiminta: ['m'], lengan: L(null), temperatureEfektif: [0.6] })]]);
  assert.deepEqual(bedaKonfigurasi([A, B]), []);
});

test('A3 — kelas yang cuma ada di SATU berkas tidak dilaporkan "membaik"', () => {
  const A = berkasK('A', [[g2(1, 'a', ['kosong', 'tanya_dobel'])]], ['kosong', 'tanya_dobel']);
  const B = berkasK('B', [[g2(1, 'a', ['kosong'])]], ['kosong']);
  const r = pasangkanPerKasus(A, B);
  assert.deepEqual(r.kelasTimpang, ['tanya_dobel']);
  assert.equal(r.berubah.length, 0);          // BUKAN "tanya_dobel membaik"
});

test('A4 — kasus yang cuma ada di satu berkas dilaporkan, bukan dibuang senyap', () => {
  const A = berkasK('A', [[g2(1, 'a'), g2(2, 'b')]]);
  const B = berkasK('B', [[g2(1, 'a')]]);
  const r = pasangkanPerKasus(A, B);
  assert.deepEqual(r.hanyaDi, [{ n: 2, label: 'A' }]);
  assert.equal(r.dibandingkan, 1);
  assert.equal(r.totalKasus, 2);
});

test('NB-2 — aiRingkas cacat (field hilang) TIDAK jatuh ke SAH', () => {
  const cacat = [[{ n: 1, kirim: 'a', jejak: { ai: { panggilan: 1, penyedia: ['DeepSeek'] } } }]];
  const asli = console.log; console.log = () => {};
  try { assert.equal(cetakKesahihan(cacat).sah, false); } finally { console.log = asli; }
});

test('NB-1 — aiRingkas tanpa `penyedia` tidak bikin alat ukur CRASH', () => {
  const cacat = [[{ n: 1, kirim: 'a', jejak: { ai: { panggilan: 1, gagal: 0, penyediaTidakDilaporkan: 0 } } }]];
  const asli = console.log; console.log = () => {};
  try { assert.doesNotThrow(() => cetakKesahihan(cacat)); } finally { console.log = asli; }
});
