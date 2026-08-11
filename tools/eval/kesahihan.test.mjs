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

// ⚠️ `konfigurasi` DITAMBAHKAN ke fixture ini (2026-08-11, ronde perbaikan K23).
// Bukan pelemahan assertion: sesudah penyanggal, giliran yang TIDAK merekam
// lengan memang membatalkan vonis ("ketiadaan data tidak pernah jatuh ke ✔").
// Fixture lama tidak punya `konfigurasi` sama sekali, jadi setiap test di blok
// ini — yang menguji hal LAIN — ikut merah karena alasan yang tidak ia uji.
// Test yang memang menguji ketiadaan lengan membuatnya eksplisit.
const LENGAN_SAH = { temperature: 0, seed: null, kunciRute: true, pinPenyedia: ['deepinfra'] };
const ai = (o = {}) => ({
  panggilan: 1, gagal: 0, penyedia: ['DeepSeek'], penyediaTidakDilaporkan: 0,
  promptTokens: 100, payloadMintaKunciRute: true, modelDilayani: ['deepseek/v4'],
  konfigurasi: { modelDiminta: ['deepseek/v4'], lengan: LENGAN_SAH, temperatureEfektif: [0] },
  ...o,
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
// ⚠️ BAWAAN `pinPenyedia` DIUBAH dari null → ['deepinfra'] (2026-08-11).
// Bukan pelemahan: sesudah ronde penyanggal, "kunci rute TANPA pin" memang
// TIDAK SAH — `allow_fallbacks:false` sendirian terbukti tidak mengunci rute.
// Jadi lengan bawaan yang dipakai test-test lain harus mewakili lengan yang
// SAH, kalau tidak setiap test tentang hal LAIN ikut merah karena alasan yang
// tidak ia uji. Test yang memang menguji "tanpa pin" mengoper null eksplisit.
const L = (temperature = 0, seed = null, kunciRute = true, pinPenyedia = ['deepinfra']) => ({ temperature, seed, kunciRute, pinPenyedia });
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

// ─── PIN PENYEDIA — sesudah ronde penyanggal audit K23 (2026-08-11) ───
//
// ⚠️ BLOK INI DITULIS ULANG. Versi pertamanya mengunci "pin dibandingkan dengan
// penyedia yang melayani". Penyanggal membuktikan perbandingan itu ANTI-KORELASI
// DENGAN KEBENARAN: pin memakai SLUG OpenRouter, badan respons memakai NAMA
// TAMPILAN, dan keduanya ruang nama berbeda — `GET /api/v1/providers` (101
// penyedia) menunjukkan kelima nama yang kami ukur ada sebagai `name` dan NOL
// sebagai `slug`; `Google` slug-nya `google-vertex`. Jadi pemeriksaan itu lulus
// saat pin SALAH dan gagal saat pin BENAR. Dicabut.
// Yang dikunci sekarang adalah besaran yang memang bisa dibuktikan dari data.

const gPin = (n, kirim, pin, dilayani, over = {}) => ({
  n, kirim, kosong: false, tanya_dobel: false,
  jejak: { ai: { panggilan: 1, gagal: 0, penyedia: dilayani, penyediaTidakDilaporkan: 0,
                 payloadMintaKunciRute: true, modelDilayani: ['m'],
                 konfigurasi: { modelDiminta: ['m'], lengan: L(0, null, true, pin), temperatureEfektif: [0] },
                 ...over } },
});

test('pin diminta + tepat SATU penyedia melayani → SAH', () => {
  assert.equal(vonis([[gPin(1, 'a', ['deepinfra'], ['DeepInfra'])]]).sah, true);
});

test('nama-dilayani BEDA dari pin TIDAK lagi membatalkan vonis — itu ruang nama lain', () => {
  // Justru kasus paling umum: operator mengisi slug yang BENAR (`deepinfra`),
  // respons melaporkan nama tampilan (`DeepInfra`). Versi lama memvonis
  // "PIN TIDAK DIHORMATI" di sini → gerbang F6 permanen merah untuk konfigurasi
  // yang benar. Yang menentukan sah tetap: satu penyedia untuk seluruh putaran.
  assert.equal(vonis([[gPin(1, 'a', ['deepinfra'], ['DeepInfra'])]]).sah, true);
});

test('DUA penyedia melayani → TIDAK SAH, apa pun pin-nya', () => {
  // Ini yang benar-benar kita pedulikan, dan ia bisa dibuktikan dari data.
  assert.equal(vonis([[gPin(1, 'a', ['deepinfra'], ['DeepInfra']), gPin(2, 'b', ['deepinfra'], ['Crusoe'])]]).sah, false);
});

test('kunci rute TANPA pin → TIDAK SAH (allow_fallbacks sendirian tidak mengunci)', () => {
  assert.equal(vonis([[gPin(1, 'a', null, ['DeepInfra'])]]).sah, false);
});

test('B2 — LENGAN BERUBAH di tengah pengukuran → TIDAK SAH', () => {
  // Dulu `r.lengan[0]` dipakai mewakili seluruh putaran, jadi giliran ke-2 yang
  // diukur dengan lengan berbeda lolos tanpa jejak.
  const a = gPin(1, 'a', ['deepinfra'], ['DeepInfra']);
  const b = gPin(2, 'b', ['parasail'], ['DeepInfra']);
  assert.equal(vonis([[a, b]]).sah, false);
});

test('B5 — giliran yang TIDAK merekam lengan membatalkan vonis', () => {
  const utuh = gPin(1, 'a', ['deepinfra'], ['DeepInfra']);
  const tanpaLengan = gPin(2, 'b', ['deepinfra'], ['DeepInfra']);
  tanpaLengan.jejak.ai.konfigurasi = { modelDiminta: ['m'], lengan: null, temperatureEfektif: [0] };
  assert.equal(vonis([[utuh, tanpaLengan]]).sah, false);
});

test('B5 — giliran tanpa alat ukur sama sekali membatalkan vonis', () => {
  const utuh = gPin(1, 'a', ['deepinfra'], ['DeepInfra']);
  assert.equal(vonis([[utuh, { n: 2, kirim: 'b', jejak: {} }]]).sah, false);
});

test('B1 — pin BERBEDA antar berkas ditolak `bedaKonfigurasi`', () => {
  // Cerminan `lenganSeragam` sisi TypeScript; tanpa ini dua berkas yang di-pin
  // ke penyedia berbeda lolos dibandingkan dan selisih penyedia terbaca sebagai
  // selisih kode — confound yang justru sedang diberantas, lewat pintu belakang.
  const A = { label: 'A', putaran: [[gPin(1, 'a', ['deepinfra'], ['DeepInfra'])]] };
  const B = { label: 'B', putaran: [[gPin(1, 'a', ['parasail'], ['Parasail'])]] };
  const beda = bedaKonfigurasi([A, B]);
  assert.equal(beda.length, 1);
  assert.match(beda[0], /^lengan:/);
  assert.match(beda[0], /pin=deepinfra/);   // cacat-baru-3: pin ikut TERLIHAT di pesannya
});

// ─── SEBARAN PER-PUTARAN — pertanyaan yang gerbang F6 sebenarnya ajukan ───
//
// Ditulis sesudah lengan 1 pertama (2026-08-11). Alat mencetak `5/12` — JUMLAH
// lintas putaran — sementara gerbangnya berbunyi "3x berulang, sebaran < 5
// poin", yaitu SEBARAN ANTAR putaran. Dua besaran yang berbeda, dan yang
// dicetak bukan yang ditanya. Sebaran sesungguhnya harus dihitung manual dengan
// Python dari JSON: putaran 1 = 33%, putaran 2 = 50% → 17 poin. Alat ukur yang
// tidak bisa menjawab pertanyaan gerbangnya sendiri belum selesai.

import { sebaranPerPutaran } from './kesahihan.mjs';

/** n giliran, `rusak` di antaranya menyalakan `kosong`. */
const put = (n, rusak) => Array.from({ length: n }, (_, i) => ({
  n: i + 1, kirim: `k${i + 1}`, kosong: i < rusak, tanya_dobel: false,
}));

// >>> ANGGA — 2026-08-11, PERUBAHAN SEMANTIK YANG DISENGAJA (bukan pelemahan).
//
// Ronde 3 audit K23 memasang pagar `MIN_GILIRAN = 21` di `sebaranPerPutaran`:
// pada N giliran, persentase hanya bisa bernilai kelipatan 100/N, sehingga di
// N=6 sebaran non-nol TERKECIL sudah 16 poin — ambang "< 5" di situ de facto
// berarti "cacah wajib identik". Penyanggal menghitung titik baliknya: N=21.
//
// Akibatnya fixture 6-giliran TIDAK LAGI SAH untuk menguji vonis LULUS/GAGAL,
// dan tiga test di bawah dipindah ke n >= 21 (25 dan 40). Yang TIDAK berubah:
// ambangnya tetap 5, tidak satu pun assertion dihapus, dan test yang cuma
// menguji ARITMATIKA sebaran tetap memakai n=6 apa adanya — justru sekarang
// dengan assertion TAMBAHAN `bisaDinilai === false` supaya perbedaan antara
// "angkanya benar" dan "vonisnya boleh diambil" terkunci hitam-putih.

test('sebaran = selisih persentase TERTINGGI dan TERENDAH antar putaran', () => {
  const r = sebaranPerPutaran([put(6, 2), put(6, 3)], ['kosong']);
  const k = r.kelas.find((x) => x.kelas === 'kosong');
  // `perPutaran` = TAMPILAN (bulat). `sebaran` = VONIS (rasio eksak).
  // Ronde 3 memisahkan keduanya: 50 − 33⅓ = 16,67 dan yang dipakai gerbang
  // adalah angka itu, bukan 17. Assertion ini SATU-SATUNYA yang berubah
  // nilainya, dan perubahannya disengaja — lihat komentar besar di
  // `sebaranPerPutaran`.
  assert.deepEqual(k.perPutaran, [33, 50]);
  assert.equal(k.sebaran.toFixed(2), '16.67');
  // Aritmatikanya benar DAN vonisnya tetap tidak boleh diambil di n=6.
  assert.equal(r.bisaDinilai, false);
});

test('nol perbedaan → sebaran 0', () => {
  const k = sebaranPerPutaran([put(6, 2), put(6, 2), put(6, 2)], ['kosong']).kelas[0];
  assert.equal(k.sebaran, 0);
});

test('gerbang LULUS: 3 putaran cukup panjang, seluruh kelas sebaran < 5 poin', () => {
  const r = sebaranPerPutaran([put(25, 2), put(25, 2), put(25, 2)], ['kosong', 'tanya_dobel']);
  assert.equal(r.bisaDinilai, true);
  assert.equal(r.lulus, true);
  assert.equal(r.alasan.length, 0);
});

test('gerbang GAGAL kalau SATU kelas saja melebihi 5 poin', () => {
  // 40 giliran: 2/40 = 5%, 4/40 = 10% → sebaran 5 poin, dan n >= 21 sehingga
  // kegagalannya benar-benar datang dari AMBANG, bukan dari pagar panjang.
  const r = sebaranPerPutaran([put(40, 2), put(40, 2), put(40, 4)], ['kosong']);
  assert.equal(r.bisaDinilai, true);
  assert.equal(r.lulus, false);
  assert.match(r.alasan[0], /kosong/);
});

test('alasan sebaran MENCANTUMKAN penyebut, bukan cuma persen', () => {
  // "5 poin" untuk 2/40 vs 4/40 terbaca seperti temuan besar; penyebutnya yang
  // memberi tahu pembaca bahwa peristiwanya dua giliran.
  const r = sebaranPerPutaran([put(40, 2), put(40, 2), put(40, 4)], ['kosong']);
  assert.match(r.alasan[0], /2\/40/);
  assert.match(r.alasan[0], /4\/40/);
});

test('KURANG dari 3 putaran → TIDAK BISA DINILAI, dan itu bukan LULUS', () => {
  // Justru keadaan lengan 1 pertama: 2 dari 3 putaran berhasil karena 429.
  // Dua putaran yang kebetulan mirip TIDAK boleh terbaca sebagai gerbang lewat.
  // Panjangnya sengaja 25 supaya SATU-SATUNYA sebab adalah jumlah putaran.
  const r = sebaranPerPutaran([put(25, 2), put(25, 2)], ['kosong']);
  assert.equal(r.lulus, false);
  assert.equal(r.cukupPutaran, false);
  assert.equal(r.bisaDinilai, false);
  assert.equal(r.takBisaDinilai.length, 1);
  assert.match(r.takBisaDinilai[0], /2 dari 3/);
});

test('nol putaran → tidak lulus, tidak melempar', () => {
  const r = sebaranPerPutaran([], ['kosong']);
  assert.equal(r.lulus, false);
  assert.deepEqual(r.kelas, []);
});

test('rasio, bukan cacah: 3/6 dan 2/4 adalah sebaran NOL', () => {
  // >>> KOREKSI RONDE 3: judul & alasan lama berbunyi "putaran yang mati di
  // tengah menyisakan giliran lebih sedikit". Ditelusuri ke `satuPutaran()`,
  // itu TIDAK BISA TERJADI — kegagalan melempar dan seluruh putaran dibuang,
  // jadi tiap putaran yang masuk selalu tepat sepanjang skenario. Test ini
  // karena itu diturunkan jadi apa adanya: penguncian ARITMATIKA rasio, yang
  // tetap penting karena ambang 5 poin harus berarti sama di korpus 6, 51,
  // dan 196 kasus. Ia tidak lagi mengklaim apa pun tentang perilaku harness.
  const k = sebaranPerPutaran([put(6, 3), put(4, 2)], ['kosong']).kelas[0];
  assert.deepEqual(k.perPutaran, [50, 50]);
  assert.equal(k.sebaran, 0);
});

test('BATAS: sebaran tepat 5 poin GAGAL — gerbangnya "< 5", bukan "<= 5"', () => {
  // 40 giliran supaya 5 poin bisa dibentuk persis (2/40 = 5%, 0/40 = 0%) DAN
  // tetap di atas MIN_GILIRAN. Fixture lamanya 20 giliran — persis satu di
  // bawah titik balik, jadi ia menguji ambang di wilayah yang ambangnya sendiri
  // tidak bermakna.
  const r = sebaranPerPutaran([put(40, 2), put(40, 0), put(40, 0)], ['kosong']);
  assert.equal(r.kelas[0].sebaran, 5);
  assert.equal(r.bisaDinilai, true);
  assert.equal(r.lulus, false);
});

test('BATAS: sebaran 4 poin LULUS', () => {
  const r = sebaranPerPutaran([put(25, 1), put(25, 0), put(25, 0)], ['kosong']);
  assert.equal(r.kelas[0].sebaran, 4);
  assert.equal(r.lulus, true);
});

// ─── C3 · pagar panjang putaran: ambang 5 hanya bermakna mulai n = 21 ───

test('C3: putaran 20 giliran TIDAK BISA DINILAI meski sebarannya 0', () => {
  // Sebaran 0 adalah nilai paling "lulus" yang mungkin — dan tetap ditolak,
  // karena di n=20 langkah persentase terkecil (5 poin) sudah menyentuh ambang.
  const r = sebaranPerPutaran([put(20, 1), put(20, 1), put(20, 1)], ['kosong']);
  assert.equal(r.kelas[0].sebaran, 0);
  assert.equal(r.bisaDinilai, false);
  assert.equal(r.lulus, false);
  assert.match(r.takBisaDinilai.join(' '), /21/);
});

test('C3: n = 21 tepat sudah boleh dinilai — titik baliknya inklusif', () => {
  const r = sebaranPerPutaran([put(21, 1), put(21, 1), put(21, 1)], ['kosong']);
  assert.equal(r.bisaDinilai, true);
  assert.equal(r.lulus, true);
});

test('C3: SATU putaran pendek saja sudah membatalkan penilaian', () => {
  const r = sebaranPerPutaran([put(25, 2), put(25, 2), put(6, 0)], ['kosong']);
  assert.equal(r.bisaDinilai, false);
  assert.equal(r.lulus, false);
});

// ─── C1 · putaran NOL giliran bukan "0% pelanggaran" ───

test('C1: tiga putaran NOL giliran tidak boleh terbaca LULUS', () => {
  const r = sebaranPerPutaran([[], [], []], ['kosong']);
  assert.equal(r.lulus, false);
  assert.equal(r.bisaDinilai, false);
  assert.match(r.takBisaDinilai.join(' '), /NOL giliran/);
});

test('C1: putaran NOL giliran disebut KOSONG saja, bukan sekalian "terlalu pendek"', () => {
  // >>> TEMUAN UJI MUTASI (2026-08-11): mutan "pagar `n > 0` dicabut" HIDUP —
  // seluruh 57 test lain tetap hijau tanpa pagar itu, karena vonisnya kebetulan
  // sama (dua-duanya menolak). Yang berubah cuma ALASANNYA: putaran nol giliran
  // ikut dituduh "hanya 0 giliran — di bawah 21", padahal ia bukan pendek, ia
  // KOSONG. Alat ukur yang menyebut sebab yang salah mengarahkan perbaikan ke
  // tempat yang salah — persis kesalahan yang menghasilkan `lupa_produk` 39%
  // palsu. Test ini mengunci sebabnya, bukan cuma vonisnya.
  const r = sebaranPerPutaran([[], [], []], ['kosong']);
  assert.equal(r.takBisaDinilai.length, 1);
  assert.doesNotMatch(r.takBisaDinilai[0], /di bawah 21/);
});

test('C1: satu putaran kosong di antara putaran sah tetap membatalkan', () => {
  const r = sebaranPerPutaran([put(25, 2), [], put(25, 2)], ['kosong']);
  assert.equal(r.lulus, false);
  assert.match(r.takBisaDinilai.join(' '), /1 putaran berisi NOL giliran/);
});

// ─── C4/C5/C9 · daftar kelas: ketiadaan pemeriksaan bukan kebersihan ───

test('C4: daftar kelas KOSONG → tidak lulus (tidak ada yang diperiksa)', () => {
  const r = sebaranPerPutaran([put(25, 0), put(25, 0), put(25, 0)], []);
  assert.equal(r.lulus, false);
  assert.equal(r.bisaDinilai, false);
  assert.match(r.takBisaDinilai.join(' '), /kelas kegagalan KOSONG/);
});

test('C9: `kelas` undefined tidak melempar — memberi VONIS, bukan crash', () => {
  const r = sebaranPerPutaran([put(25, 0), put(25, 0), put(25, 0)], undefined);
  assert.equal(r.lulus, false);
  assert.deepEqual(r.kelas, []);
});

test('C9: `putaran` undefined tidak melempar', () => {
  const r = sebaranPerPutaran(undefined, ['kosong']);
  assert.equal(r.lulus, false);
  assert.deepEqual(r.kelas, []);
});

// ─── C2/N3 · vonis kesahihan MENANG atas vonis sebaran ───

test('C2: `sah: false` membuat gerbang GAGAL walau sebaran 0 dan bisa dinilai', () => {
  // Ini kontradiksi yang benar-benar tercetak di lengan 1: blok atas menyatakan
  // pengukurannya TIDAK SAH, blok bawah mencetak ✔. Sebaran yang dihitung dari
  // pengukuran terconfound bukan bukti apa pun.
  const putaranSah = [put(25, 2), put(25, 2), put(25, 2)];
  assert.equal(sebaranPerPutaran(putaranSah, ['kosong'], { sah: true }).lulus, true);
  const r = sebaranPerPutaran(putaranSah, ['kosong'], { sah: false });
  assert.equal(r.lulus, false);
  assert.equal(r.sahHulu, false);
  // Dua vonis TETAP TERPISAH: sebarannya sendiri masih layak dinilai, dan
  // angkanya masih berguna sebagai diagnosis kebisingan.
  assert.equal(r.bisaDinilai, true);
  assert.equal(r.alasan.length, 0);
});

test('C2: `sah` bawaannya true — pemanggil lama tidak berubah artinya', () => {
  const r = sebaranPerPutaran([put(25, 2), put(25, 2), put(25, 2)], ['kosong']);
  assert.equal(r.sahHulu, true);
  assert.equal(r.lulus, true);
});

// ─── N1 · jumlah & nomor putaran DIBACA dari data, tidak ditulis keras "3" ───

test('N1: nomor putaran bawaan = urutan data', () => {
  const r = sebaranPerPutaran([put(25, 0), put(25, 0), put(25, 0)], ['kosong']);
  assert.deepEqual(r.nomor, [1, 2, 3]);
});

test('N1: nomor putaran NYATA diteruskan apa adanya (putaran gagal dilewati)', () => {
  // `--runs 5` dengan putaran 2 dan 4 mati karena 429 menyisakan putaran 1,3,5.
  // Label yang mengarang "put1 put2 put3" akan menyembunyikan fakta itu.
  const r = sebaranPerPutaran([put(25, 0), put(25, 0), put(25, 0)], ['kosong'], { nomor: [1, 3, 5] });
  assert.deepEqual(r.nomor, [1, 3, 5]);
  assert.equal(r.lulus, true);
});

test('N1: giliran per putaran dilaporkan — penyebutnya bisa dicetak', () => {
  const r = sebaranPerPutaran([put(25, 1), put(23, 1)], ['kosong']);
  assert.deepEqual(r.giliranPerPutaran, [25, 23]);
  assert.deepEqual(r.kelas[0].cacah, [1, 1]);
});

test('lebih dari 3 putaran tetap dinilai — gerbang bilang "3x", bukan "tepat 3x"', () => {
  const r = sebaranPerPutaran(
    [put(25, 2), put(25, 2), put(25, 2), put(25, 2), put(25, 2)],
    ['kosong'],
  );
  assert.equal(r.nomor.length, 5);
  assert.equal(r.lulus, true);
});


// ─── RONDE 3 · rasio EKSAK untuk vonis, pembulatan hanya untuk tampilan ───

test('R3: 1 dari 21 giliran = 4,76 poin → LULUS (pembulatan tidak boleh menggagalkan)', () => {
  // Persis janji `MIN_GILIRAN = 21`: pada 21 giliran, selisih satu kasus
  // menghasilkan 4,76 poin — di bawah ambang. Versi yang membulatkan dulu
  // memvonis 5 → GAGAL, jadi pagarnya mengingkari perhitungan yang
  // melahirkannya. Fixture C3 yang lama tidak pernah menangkap ini karena
  // ketiga putarannya identik (sebaran 0).
  const r = sebaranPerPutaran([put(21, 1), put(21, 0), put(21, 0)], ['kosong']);
  assert.equal(r.kelas[0].sebaran.toFixed(2), '4.76');
  assert.equal(r.lulus, true);
});

test('R3: korpus penuh 196 — toleransi 9 kasus lulus, 10 kasus gagal', () => {
  const lulus = sebaranPerPutaran([put(196, 9), put(196, 0), put(196, 0)], ['kosong']);
  assert.equal(lulus.kelas[0].sebaran.toFixed(2), '4.59');
  assert.equal(lulus.lulus, true);
  const gagal = sebaranPerPutaran([put(196, 10), put(196, 0), put(196, 0)], ['kosong']);
  assert.equal(gagal.kelas[0].sebaran.toFixed(2), '5.10');
  assert.equal(gagal.lulus, false);
});

test('R3: tampilan tetap bulat walau vonis eksak — dua angka, dua peran', () => {
  const k = sebaranPerPutaran([put(21, 1), put(21, 0), put(21, 0)], ['kosong']).kelas[0];
  assert.deepEqual(k.perPutaran, [5, 0, 0]);
  assert.ok(Number.isInteger(k.perPutaran[0]));
  assert.ok(!Number.isInteger(k.sebaran));
});

// ─── RONDE 3 · kelas yang tidak pernah terekam bukan "nol pelanggaran" ───

test('R3: kelas yang fieldnya TIDAK PERNAH ada → tidak bisa dinilai, bukan ✔', () => {
  // `g?.[k]` tidak bisa membedakan field ABSEN dari `false`. Satu nama baru di
  // `KELAS_GAGAL` tanpa field padanannya di `periksa()` akan mencetak
  // `0% 0/25` yang rapi lalu menyumbang ✔ ke gerbang F6. Drift ini SUDAH
  // pernah terjadi sekali di repo ini (`gerbang_menahan` hilang dari salah
  // satu daftar), jadi ini bukan kekhawatiran hipotetis.
  const r = sebaranPerPutaran([put(25, 0), put(25, 0), put(25, 0)], ['kosong', 'kelas_hantu']);
  assert.equal(r.lulus, false);
  assert.equal(r.bisaDinilai, false);
  assert.match(r.takBisaDinilai.join(' '), /kelas_hantu/);
  assert.equal(r.kelas.find((k) => k.kelas === 'kelas_hantu').terekam, false);
});

test('R3: KONTROL — kelas yang terekam dan semuanya `false` TETAP lulus', () => {
  // Tanpa test ini, penjaga di atas bisa "diperbaiki" jadi menolak setiap
  // kelas bersih — membalik cacatnya, bukan menutupnya.
  const r = sebaranPerPutaran([put(25, 0), put(25, 0), put(25, 0)], ['kosong', 'tanya_dobel']);
  assert.equal(r.kelas.every((k) => k.terekam), true);
  assert.equal(r.lulus, true);
});

// ─── RONDE 3 · pesan "terlalu pendek" menyebut panjang yang MEMANG pendek ───

test('R3: putaran KOSONG tidak ikut disebut di daftar panjang "terlalu pendek"', () => {
  const r = sebaranPerPutaran([[], put(6, 0), put(6, 0)], ['kosong']);
  const pesan = r.takBisaDinilai.find((a) => /di bawah 21/.test(a));
  assert.match(pesan, /hanya 6 giliran/);
  assert.doesNotMatch(pesan, /0\//);
});

test('R3: putaran yang CUKUP panjang tidak ikut dituduh pendek', () => {
  const r = sebaranPerPutaran([put(25, 0), put(25, 0), put(6, 0)], ['kosong']);
  const pesan = r.takBisaDinilai.find((a) => /di bawah 21/.test(a));
  assert.match(pesan, /1 putaran hanya 6 giliran/);
  assert.doesNotMatch(pesan, /25/);
});

// ─── RONDE 3 · `cetakSebaran` — pencetak yang DILIHAT operator, dulu nol test ───

import { cetakSebaran } from './kesahihan.mjs';

/** Jalankan `cetakSebaran` sambil menadah seluruh barisnya. */
function tadah(...args) {
  const asli = console.log;
  const baris = [];
  console.log = (...a) => baris.push(a.join(' '));
  try {
    const r = cetakSebaran(...args);
    return { baris, r, teks: baris.join('\n') };
  } finally {
    console.log = asli;
  }
}

test('cetakSebaran: vonis yang DICETAK sama dengan vonis fungsi murninya', () => {
  // Gerbang bisa benar di dalam dan tetap salah di layar. Ini yang dibaca
  // operator, dan sampai ronde 3 ia tidak punya satu pun test.
  const lulus = tadah([put(25, 2), put(25, 2), put(25, 2)], ['kosong'], '  ');
  assert.equal(lulus.r.lulus, true);
  assert.match(lulus.teks, /✔ GERBANG F6 LEWAT/);
  const gagal = tadah([put(40, 2), put(40, 0), put(40, 0)], ['kosong'], '  ');
  assert.equal(gagal.r.lulus, false);
  assert.match(gagal.teks, /✖ GERBANG F6 BELUM LEWAT/);
  assert.doesNotMatch(gagal.teks, /✔/);
});

test('cetakSebaran: `sah:false` mencetak vonis TIDAK SAH, bukan ✔ maupun "belum lewat"', () => {
  // Kontradiksi yang benar-benar tercetak di lengan 1: blok atas TIDAK SAH,
  // blok bawah ✔. Sebabnya ada di layar, jadi pengunciannya juga harus di layar.
  const t = tadah([put(25, 2), put(25, 2), put(25, 2)], ['kosong'], '  ', { sah: false });
  assert.doesNotMatch(t.teks, /✔/);
  assert.match(t.teks, /TIDAK SAH/);
});

test('cetakSebaran: jumlah kolom header = jumlah sel tiap baris kelas', () => {
  const t = tadah([put(25, 2), put(25, 1), put(25, 0)], ['kosong', 'tanya_dobel'], '  ');
  const header = t.baris.find((b) => b.includes('put1'));
  const kolom = (header.match(/put\d+/g) ?? []).length;
  assert.equal(kolom, 3);
  for (const nama of ['kosong', 'tanya_dobel']) {
    const baris = t.baris.find((b) => b.trimStart().startsWith(nama));
    assert.equal((baris.match(/%/g) ?? []).length, kolom);
  }
});

test('cetakSebaran: penyebut ikut tercetak — "5 poin" tanpa penyebut menyesatkan', () => {
  const t = tadah([put(40, 2), put(40, 0), put(40, 0)], ['kosong'], '  ');
  assert.match(t.teks, /2\/40/);
  assert.match(t.teks, /0\/40/);
});

test('cetakSebaran: nomor putaran NYATA dipakai di header, bukan 1..n', () => {
  const t = tadah([put(25, 0), put(25, 0), put(25, 0)], ['kosong'], '  ', { nomor: [1, 3, 5] });
  const header = t.baris.find((b) => b.includes('put1'));
  assert.deepEqual(header.match(/put\d+/g), ['put1', 'put3', 'put5']);
});


// ─── RONDE 3 · daftar kelas tabel `--bandingkan` = GABUNGAN, bukan berkas [0] ───

import { kelasGabungan, selHit } from './kesahihan.mjs';

const berkasHit = (label, hit, total) => ({ label, ringkasan: { hit, giliranTotal: total } });

test('kelasGabungan: kelas yang hanya ada di berkas KEDUA tidak boleh hilang', () => {
  // Terukur di jalur nyata: berkas lama (5 kelas) di kolom kiri membuat baris
  // `gerbang_menahan` lenyap dari tabel, lalu tetap ditutup `✔ Semua kolom sah`.
  const lama = berkasHit('lama', { kosong: 1, tanya_dobel: 0 }, 72);
  const baru = berkasHit('baru', { kosong: 2, tanya_dobel: 1, gerbang_menahan: 3 }, 72);
  assert.deepEqual(kelasGabungan([lama, baru]), ['kosong', 'tanya_dobel', 'gerbang_menahan']);
  // Urutan berkas TIDAK boleh mengubah isi tabel.
  assert.deepEqual(
    [...kelasGabungan([baru, lama])].sort(),
    [...kelasGabungan([lama, baru])].sort(),
  );
});

test('selHit: kelas yang tidak diukur ditandai, bukan dicetak `undefined/72`', () => {
  const lama = berkasHit('lama', { kosong: 1 }, 72);
  assert.equal(selHit(lama, 'kosong'), '1/72');
  assert.equal(selHit(lama, 'gerbang_menahan'), 'tidak diukur');
  // Nol yang SAH tetap dicetak sebagai angka — "tidak diukur" hanya untuk absen.
  assert.equal(selHit(berkasHit('x', { kosong: 0 }, 72), 'kosong'), '0/72');
});

test('kelasGabungan/selHit: berkas cacat tidak melempar', () => {
  assert.deepEqual(kelasGabungan(undefined), []);
  assert.deepEqual(kelasGabungan([{}, null]), []);
  assert.equal(selHit(undefined, 'kosong'), 'tidak diukur');
});
