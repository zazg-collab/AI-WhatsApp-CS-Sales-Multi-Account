#!/usr/bin/env node
/**
 * >>> ANGGA — F6 langkah pertama (2026-08-10, cowork): HARNESS PEMBANDING.
 *
 * Kenapa berkas ini ada, dan kenapa ia dibangun SEBELUM perbaikan berikutnya:
 * dua hari terakhir setiap penilaian mutu ("lebih bagus", "makin berantakan")
 * berasal dari SATU percakapan pada model yang jawabannya berubah-ubah. Empat
 * hipotesis sebab diajukan atas dasar itu, empat-empatnya dibantah data. Tanpa
 * alat ukur, perbaikan dan kebetulan tidak bisa dibedakan — dan penambal
 * siapa pun akan mengulangi pola yang sama.
 *
 * Alat ini memutar percakapan yang SAMA berkali-kali lewat API test-harness,
 * lalu menghitung berapa kali tiap kelas kegagalan muncul. Kelas-kelasnya
 * bukan karangan: semuanya gejala yang BENAR-BENAR terlihat di sesi uji
 * Bossfren, jadi angkanya langsung berbicara soal keluhan yang nyata.
 *
 * Pemakaian:
 *   node tools/eval/replay.mjs --runs 5 --label "HEAD"
 *   node tools/eval/replay.mjs --runs 5 --label "a85a7c0" --out hasil-a85a7c0.json
 *   node tools/eval/replay.mjs --bandingkan hasil-a.json hasil-b.json
 *
 * Yang TIDAK dilakukan alat ini: menilai apakah kalimatnya enak dibaca. Ia
 * hanya menghitung pelanggaran yang bisa diperiksa mesin. Penilaian rasa tetap
 * milik manusia — tapi setidaknya rasa itu tidak lagi dipakai untuk memutuskan
 * commit mana yang salah.
 */
const BASE = process.env.HERMES_API ?? 'http://localhost:3001/api/v1';
const PROVIDER = process.env.EVAL_PROVIDER ?? 'openrouter';
const MODEL = process.env.EVAL_MODEL ?? 'deepseek/deepseek-v4-flash-0731';

/** Percakapan acuan — SAMA persis dengan yang dijalankan Bossfren manual. */
const SKENARIO = [
  'halo kak, golok sembelih multifungsi ready?',
  'iya yg itu. ongkir ke mataram brp ya?',
  'cakranegara',
  'ambil 2 aja',
  'cod aja kak',
  'Fatih, Jl. Pejanggik No. 45 Cakranegara, deket masjid agung',
];

const norm = (s) =>
  (s ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Kalimat tanya terakhir dari sebuah balasan, ternormalisasi. */
function kalimatTanya(teks) {
  return (teks ?? '')
    .split(/\n+/)
    .map((b) => b.trim())
    .filter((b) => b.includes('?'))
    .map(norm)
    .filter(Boolean);
}

/**
 * Kelas kegagalan. Tiap kunci = satu gejala yang pernah Bossfren laporkan.
 * Sengaja deterministik dan konservatif: lebih baik melewatkan pelanggaran
 * halus daripada menghasilkan angka yang tidak bisa dipercaya.
 */
function periksa(teks, debug, indeksGiliran) {
  const t = teks ?? '';
  const mode = debug?.funnelMode ?? null;
  const status = String(debug?.status ?? '');
  const tanya = kalimatTanya(t);
  const dobel = tanya.some((q, i) =>
    tanya.some((r, j) => i !== j && (q.includes(r) || r.includes(q)) && Math.min(q.length, r.length) > 15),
  );
  return {
    kosong: !t.trim() || t.includes('[sistem] Bot tidak mengirim apa pun'),
    kurung_menggantung: /\{\{|\}\}/.test(t),
    tanya_dobel: dobel,
    // Invarian Bossfren: metode bayar TIDAK PERNAH ditanya sebelum total
    // tersodor. Dicek longgar — hanya kalau tawarannya eksplisit "transfer
    // atau cod" DAN langkah funnelnya belum sampai total.
    metode_sebelum_total:
      /(transfer\s*(atau|\/|\|)\s*cod|cod\s*(atau|\/|\|)\s*transfer)/i.test(t) &&
      !['total', 'patokan', 'closing', 'closing_followup'].includes(mode ?? ''),
    gerbang_menahan: (debug?.gateWarnings ?? []).length > 0,
    // Giliran 2 dan seterusnya wajib menunjukkan bot masih ingat produknya.
    lupa_produk: indeksGiliran >= 3 && !/golok/i.test(t),
    status,
    funnelMode: mode,
  };
}

const j = async (metode, jalur, badan) => {
  const r = await fetch(`${BASE}${jalur}`, {
    method: metode,
    headers: { 'content-type': 'application/json' },
    body: badan ? JSON.stringify(badan) : undefined,
  });
  if (!r.ok) throw new Error(`${metode} ${jalur} → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

async function satuPutaran(nomor) {
  const { session } = await j('POST', '/test-harness/sessions', {
    name: `eval-${nomor}-${Date.now()}`,
    provider: PROVIDER,
    model: MODEL,
  });
  const giliran = [];
  try {
    for (let i = 0; i < SKENARIO.length; i++) {
      const res = await j('POST', `/test-harness/sessions/${session.id}/send`, { text: SKENARIO[i] });
      const teks = res?.reply?.content ?? '';
      const debug = res?.reply?.debugInfo ?? null;
      giliran.push({ n: i + 1, kirim: SKENARIO[i], teks, ...periksa(teks, debug, i + 1) });
    }
  } finally {
    await j('DELETE', `/test-harness/sessions/${session.id}`).catch(() => {});
  }
  return giliran;
}

function ringkas(putaran) {
  const kelas = ['kosong', 'kurung_menggantung', 'tanya_dobel', 'metode_sebelum_total', 'gerbang_menahan', 'lupa_produk'];
  const total = putaran.length * SKENARIO.length;
  const hit = Object.fromEntries(kelas.map((k) => [k, 0]));
  const perGiliran = Array.from({ length: SKENARIO.length }, () => Object.fromEntries(kelas.map((k) => [k, 0])));
  for (const p of putaran)
    for (const g of p)
      for (const k of kelas)
        if (g[k]) {
          hit[k]++;
          perGiliran[g.n - 1][k]++;
        }
  return { putaran: putaran.length, giliranTotal: total, hit, perGiliran };
}

const arg = (nama, bawaan) => {
  const i = process.argv.indexOf(`--${nama}`);
  return i > 0 ? process.argv[i + 1] : bawaan;
};

const bandingkan = process.argv.indexOf('--bandingkan');
if (bandingkan > 0) {
  const fs = await import('node:fs');
  const berkas = process.argv.slice(bandingkan + 1).filter((s) => !s.startsWith('--'));
  const data = berkas.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const kelas = Object.keys(data[0].ringkasan.hit);
  console.log(`\n${'kelas kegagalan'.padEnd(24)}${data.map((d) => d.label.padStart(14)).join('')}`);
  console.log('-'.repeat(24 + 14 * data.length));
  for (const k of kelas) {
    const baris = data.map((d) => `${d.ringkasan.hit[k]}/${d.ringkasan.giliranTotal}`.padStart(14)).join('');
    console.log(k.padEnd(24) + baris);
  }
  console.log('');
  process.exit(0);
}

const runs = Number(arg('runs', '5'));
const label = arg('label', 'tanpa-label');
const out = arg('out', null);
console.log(`Memutar ${SKENARIO.length} giliran x ${runs} putaran — label "${label}"`);
console.log(`API ${BASE} · provider ${PROVIDER} · model ${MODEL}\n`);
const putaran = [];
for (let i = 1; i <= runs; i++) {
  process.stdout.write(`  putaran ${i}/${runs} ... `);
  try {
    const g = await satuPutaran(i);
    putaran.push(g);
    const rusak = g.filter((x) => x.kosong || x.kurung_menggantung || x.tanya_dobel || x.metode_sebelum_total || x.lupa_produk).length;
    console.log(`selesai — ${rusak}/${SKENARIO.length} giliran bermasalah`);
  } catch (e) {
    console.log(`GAGAL: ${e.message}`);
  }
}
const ringkasan = ringkas(putaran);
console.log(`\n=== ${label} — ${ringkasan.putaran} putaran, ${ringkasan.giliranTotal} giliran ===`);
for (const [k, v] of Object.entries(ringkasan.hit)) {
  const persen = ringkasan.giliranTotal ? Math.round((v / ringkasan.giliranTotal) * 100) : 0;
  console.log(`  ${k.padEnd(24)} ${String(v).padStart(3)}/${ringkasan.giliranTotal}  (${persen}%)`);
}
console.log('\n  per giliran:');
ringkasan.perGiliran.forEach((g, i) => {
  const isi = Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`    giliran ${i + 1}: ${isi || '— bersih —'}`);
});
if (out) {
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ label, waktu: new Date().toISOString(), ringkasan, putaran }, null, 2));
  console.log(`\nTersimpan: ${out}`);
}
