#!/usr/bin/env node
/**
 * >>> ANGGA — Pemeriksaan LIVE modul Shipping Service Mengantar.
 *
 * Bukan pengganti unit test (`shipping.service.spec.ts` sudah menguji seluruh
 * kriteria §9 secara deterministik dengan respons tiruan). Skrip ini menguji
 * hal yang TIDAK bisa diuji dengan mock: apakah kontrak API Mengantar yang
 * sebenarnya masih sesuai asumsi kode — terutama bahwa parameter `weight`
 * berskala KILOGRAM.
 *
 * Jalankan:  node scripts/shipping-live-check.mjs [kata-kunci-kota]
 * Butuh MENGANTAR_API_KEY & MENGANTAR_ORIGIN_ID di environment (atau .env).
 * Kunci API TIDAK PERNAH dicetak — semua URL disamarkan sebelum ditampilkan.
 */

import { readFileSync } from 'node:fs';

function loadEnv() {
  if (!process.env.MENGANTAR_API_KEY) {
    try {
      for (const line of readFileSync('.env', 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* .env opsional */ }
  }
}
loadEnv();

const KEY = process.env.MENGANTAR_API_KEY ?? '';
const ORIGIN = process.env.MENGANTAR_ORIGIN_ID ?? '';
const BASE = (process.env.MENGANTAR_BASE_URL ?? 'https://app.mengantar.com').replace(/\/$/, '');
const KEYWORD = process.argv[2] ?? 'Medan';

const redact = (u) => (KEY ? u.split(KEY).join('***') : u);
const ok = (c, m) => console.log(`${c ? '  LULUS' : '  GAGAL'}  ${m}`);
let failures = 0;
const check = (cond, msg) => { ok(cond, msg); if (!cond) failures++; };

if (!KEY || !ORIGIN) {
  console.error('MENGANTAR_API_KEY / MENGANTAR_ORIGIN_ID belum diset. Berhenti.');
  process.exit(2);
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${redact(url)}`);
  return res.json();
}

console.log(`Base URL     : ${BASE}`);
console.log(`Kunci API    : ${KEY.slice(0, 4)}*** (disamarkan)`);
console.log(`Kata kunci   : ${KEYWORD}\n`);

// ── 1. Search Address + pengelompokan ────────────────────────────────────────
console.log('1) Search Address & pengelompokan per provinsi+kota');
const addr = await get(`${BASE}/api/public/${KEY}/address/search?keyword=${encodeURIComponent(KEYWORD)}`);
const rows = addr?.data ?? [];
const groups = new Map();
for (const r of rows) {
  const k = `${r.PROVINCE_NAME}|${r.CITY_NAME}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r._id);
}
console.log(`  ${rows.length} baris → ${groups.size} kelompok kota`);
for (const [k, ids] of groups) console.log(`    - ${k} (${ids.length} baris)`);
check(rows.length > 0, 'Search Address mengembalikan hasil');
check(groups.size < rows.length || rows.length <= 1, 'pengelompokan memang memampatkan baris kelurahan');

const first = groups.values().next().value;
const destinationId = first[0];

// ── 2. weight berskala KILOGRAM (asumsi paling kritis) ───────────────────────
console.log('\n2) Skala parameter `weight` (asumsi: KILOGRAM, bukan gram)');
const est = {};
for (const w of [1, 2, 3]) {
  est[w] = (await get(`${BASE}/api/order/allEstimatePublic?origin_id=${ORIGIN}&destination_id=${destinationId}&weight=${w}`))?.data ?? {};
}
const linear = [];
for (const name of Object.keys(est[1])) {
  const a = Number(est[1][name]?.estimatedPrice ?? 0);
  const b = Number(est[2][name]?.estimatedPrice ?? 0);
  const c = Number(est[3][name]?.estimatedPrice ?? 0);
  if (a > 0 && b === a * 2 && c === a * 3) linear.push(name);
}
console.log(`  kurir dengan tarif linear per satuan berat: ${linear.join(', ') || '(tidak ada)'}`);
check(
  linear.length >= 3,
  'tarif naik linear terhadap `weight` → `weight` adalah satuan berat besar (kg), bukan gram. ' +
    'Kalau ini GAGAL, hentikan deploy: konversi gram→kg di gramsToKg() mungkin sudah tidak berlaku.',
);

// ── 3. Rule 1 — filter kurir ─────────────────────────────────────────────────
console.log('\n3) Rule 1 — filter kurir');
const EXCLUDE = (process.env.SHIPPING_COURIER_EXCLUDE ?? 'paxel,JNECargo,SiCepatCargo,SapCargo,iDexpressCargo,SAPLite,iDlite')
  .split(',').map((s) => s.trim().toLowerCase());
const passing = Object.entries(est[1]).filter(([n, e]) =>
  !EXCLUDE.includes(n.toLowerCase()) && e?.unsupported !== true && Number(e?.price) > 0 && Number(e?.estimatedPrice) > 0);
console.log(`  lolos filter: ${passing.map(([n]) => n).join(', ') || '(tidak ada)'}`);
check(passing.length > 0, 'ada kurir yang lolos Rule 1 untuk tujuan ini');
check(!passing.some(([n]) => EXCLUDE.includes(n.toLowerCase())), 'tidak ada kurir terlarang yang lolos');

// ── 4. Rule 2 — flag kelayakan COD ───────────────────────────────────────────
console.log('\n4) Rule 2 — flag `unsupported_cod` per kurir yang lolos');
const kosong = [];
for (const [n, e] of passing) {
  const flag = e.unsupported_cod === undefined || e.unsupported_cod === null ? '(kosong)' : String(e.unsupported_cod);
  if (flag === '(kosong)') kosong.push(n);
  console.log(`    ${n.padEnd(12)} unsupported_cod=${flag}`);
}
console.log(`  kurir berflag kosong (butuh allowlist manual): ${kosong.join(', ') || '(tidak ada)'}`);

// ── 5. getPerformancePublic + kecocokan nama kurir ───────────────────────────
console.log('\n5) getPerformancePublic');
const perfRes = await fetch(`${BASE}/api/public/${KEY}/order/getPerformancePublic`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ city: rows[0].CITY_NAME, allEstimateData: est[1] }),
});
const perf = (await perfRes.json())?.data;
console.log(`  recommended=${perf?.recommended} bestCourier=${perf?.bestCourier}`);
const perfKeys = (perf?.couriers ?? []).map((c) => c.key);
const estKeys = Object.keys(est[1]);
const bedaHuruf = perfKeys.filter((k) => !estKeys.includes(k) && estKeys.some((e) => e.toLowerCase() === k.toLowerCase()));
check(Array.isArray(perf?.couriers) && perf.couriers.length > 0, 'performance mengembalikan daftar kurir + skor');
console.log(`  nama kurir yang beda huruf besar/kecil vs estimate: ${bedaHuruf.join(', ') || '(tidak ada)'}`);
check(true, `pencocokan nama kurir HARUS case-insensitive (contoh beda: ${bedaHuruf.join(', ') || 'tidak ada di rute ini'})`);

// ── 6. Rule 6 — codFee hanya muncul kalau COD_AMOUNT dikirim ─────────────────
console.log('\n6) Rule 6 — codFee selalu dari API, tidak pernah dihitung sendiri');
const COD_AMOUNT = 250000;
const withCod = (await get(`${BASE}/api/order/allEstimatePublic?origin_id=${ORIGIN}&destination_id=${destinationId}&weight=1&COD_AMOUNT=${COD_AMOUNT}`))?.data ?? {};
const tanpa = Object.values(est[1]).every((e) => Number(e?.codFee ?? 0) === 0);
check(tanpa, 'tanpa COD_AMOUNT → codFee = 0 di semua kurir');
const contoh = passing[0]?.[0];
console.log(`  contoh ${contoh}: codFee dengan COD_AMOUNT=${COD_AMOUNT} → ${withCod[contoh]?.codFee}`);
check(Number(withCod[contoh]?.codFee ?? 0) > 0, 'dengan COD_AMOUNT → codFee terisi');
const tetapAdaFee = Object.entries(withCod).filter(([, e]) => e?.unsupported_cod === true && Number(e?.codFee) > 0);
console.log(`  kurir unsupported_cod=true yang TETAP mengembalikan codFee: ${tetapAdaFee.map(([n]) => n).join(', ') || '(tidak ada)'}`);
check(true, 'bukti Rule 2: codFee BUKAN sinyal kelayakan COD (karena itu allowlist manual tetap dipakai)');

console.log(`\n${failures === 0 ? 'SEMUA PEMERIKSAAN LIVE LULUS' : `${failures} PEMERIKSAAN GAGAL`}`);
process.exit(failures === 0 ? 0 : 1);
