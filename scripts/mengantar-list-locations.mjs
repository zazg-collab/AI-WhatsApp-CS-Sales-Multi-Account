#!/usr/bin/env node
/**
 * >>> ANGGA — Daftar SEMUA lokasi yang dikenal API Mengantar, dipisah
 * "Kota" vs "Kabupaten" (dari `CITY_NAME_SI`, label resmi Mengantar sendiri —
 * bukan karangan skrip ini).
 *
 * KENAPA per-provinsi, bukan sekali panggil "kota"/"kabupaten": Search Address
 * dibatasi Mengantar ke 50 baris per panggilan (LAMPIRAN §5 #1), dan satu
 * baris = satu kelurahan/kecamatan, bukan satu kota — provinsi besar (Jawa
 * Timur, Jawa Barat) tetap bisa lebih dari 50 baris meski keyword-nya cuma
 * nama provinsi. Skrip ini MELAPORKAN kapan itu terjadi (`⚠ capped`) alih-alih
 * diam-diam menganggap daftarnya lengkap.
 *
 * Jalankan:  node scripts/mengantar-list-locations.mjs
 * Butuh MENGANTAR_API_KEY di environment (atau .env). Kunci API TIDAK PERNAH
 * dicetak — pola sama seperti shipping-live-check.mjs.
 */

import { readFileSync, writeFileSync } from 'node:fs';

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
const BASE = (process.env.MENGANTAR_BASE_URL ?? 'https://app.mengantar.com').replace(/\/$/, '');
const redact = (u) => (KEY ? u.split(KEY).join('***') : u);

if (!KEY) {
  console.error('MENGANTAR_API_KEY belum diset. Berhenti.');
  process.exit(2);
}

// 38 provinsi resmi (termasuk 4 provinsi pemekaran Papua 2022). Dipakai sebagai
// kata kunci sapuan — BUKAN daftar 514 kabupaten/kota, supaya tidak menebak-nebak
// nama administratif yang bisa salah/ketinggalan zaman.
const PROVINSI = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi',
  'Sumatera Selatan', 'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung',
  'DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur',
  'Banten', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur',
  'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur',
  'Kalimantan Utara', 'Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan',
  'Sulawesi Tenggara', 'Gorontalo', 'Sulawesi Barat', 'Maluku', 'Maluku Utara',
  'Papua', 'Papua Barat', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan',
  'Papua Barat Daya',
];

async function searchAddress(keyword) {
  const url = `${BASE}/api/public/${KEY}/address/search?keyword=${encodeURIComponent(keyword)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  HTTP ${res.status} untuk "${keyword}" — ${redact(url)}`);
      return [];
    }
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch (err) {
    console.error(`  gagal untuk "${keyword}": ${redact(String(err))}`);
    return [];
  }
}

const kota = new Map(); // key: CITY_NAME_SI lower -> {label, province}
const kabupaten = new Map();
const lainnya = new Map(); // CITY_NAME_SI yang tidak diawali "Kota"/"Kab" apa pun
const cappedProvinces = [];
const kosongProvinces = [];

console.log(`Base URL   : ${BASE}`);
console.log(`Kunci API  : ${KEY.slice(0, 4)}*** (disamarkan)`);
console.log(`Provinsi   : ${PROVINSI.length} kata kunci\n`);

for (const prov of PROVINSI) {
  const rows = await searchAddress(prov);
  if (rows.length === 0) kosongProvinces.push(prov);
  if (rows.length >= 50) cappedProvinces.push(`${prov} (${rows.length} baris)`);

  for (const r of rows) {
    const label = (r.CITY_NAME_SI ?? '').trim() || (r.CITY_NAME ?? '').trim();
    if (!label) continue;
    const lower = label.toLowerCase();
    const entry = { label, province: r.PROVINCE_NAME ?? prov };
    if (/^kota\b/.test(lower)) kota.set(lower, entry);
    else if (/^kab(upaten)?\b\.?/.test(lower)) kabupaten.set(lower, entry);
    else lainnya.set(lower, entry);
  }
  // jeda ringan — sopan ke API Mengantar, bukan menembak beruntun
  await new Promise((r) => setTimeout(r, 250));
}

function cetak(judul, map) {
  console.log(`\n=== ${judul} (${map.size}) ===`);
  const sorted = [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'id'));
  for (const { label, province } of sorted) console.log(`  - ${label}  [${province}]`);
}

cetak('KOTA', kota);
cetak('KABUPATEN', kabupaten);
if (lainnya.size) cetak('LABEL LAIN (tidak diawali Kota/Kab — cek manual)', lainnya);

console.log(`\n=== Cakupan ===`);
console.log(`Total unik : ${kota.size} kota + ${kabupaten.size} kabupaten + ${lainnya.size} lainnya`);
if (kosongProvinces.length) {
  console.log(`⚠ 0 hasil untuk: ${kosongProvinces.join(', ')}`);
  console.log(`  (keyword provinsi ini tidak match apa pun di Mengantar — cek nama/ejaan)`);
}
if (cappedProvinces.length) {
  console.log(`⚠ KEMUNGKINAN TERPOTONG (>=50 baris, batas Search Address): ${cappedProvinces.join(', ')}`);
  console.log(`  Daftar kota/kabupaten provinsi ini BISA belum lengkap. Cara pasti melengkapi:`);
  console.log(`  cari per nama kota/kabupaten spesifik, bukan per provinsi.`);
} else {
  console.log(`Tidak ada provinsi yang kena batas 50 baris — daftar di atas kemungkinan besar lengkap.`);
}

const out = {
  generatedAt: new Date().toISOString(),
  kota: [...kota.values()].sort((a, b) => a.label.localeCompare(b.label, 'id')),
  kabupaten: [...kabupaten.values()].sort((a, b) => a.label.localeCompare(b.label, 'id')),
  lainnya: [...lainnya.values()],
  kosongProvinces,
  cappedProvinces,
};
writeFileSync('mengantar-locations.json', JSON.stringify(out, null, 2));
console.log(`\nDitulis ke mengantar-locations.json (tanpa kredensial apa pun).`);
