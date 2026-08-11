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
 * >>> F6 Bagian 1 butir 1 (2026-08-11): RUTE PENYEDIA HULU.
 * Angka mutu bot dari alat ini TIDAK SAH sebagai perbandingan selama rutenya
 * belum terkunci — biner yang sama diukur empat sesi memberi `kosong`
 * 25%/0%/0%/0%. Alat ini sekarang MEMBACA penyedia yang benar-benar melayani
 * tiap giliran dan berteriak sendiri kalau angkanya tidak layak dibandingkan.
 *
 * ⚠️ TOMBOL LENGAN dibaca oleh PROSES API, bukan oleh skrip ini — skrip ini cuma
 * klien HTTP. Menyetelnya di shell tempat `replay.mjs` jalan TIDAK ADA EFEKNYA.
 * Setel di container/proses API (`environment:` atau `docker compose run -e`):
 *   EVAL_PROVIDER_ONLY=<slug>   ← INI yang mengunci rute
 *   EVAL_TEMPERATURE=0  EVAL_SEED=42   ← lengan 1 (validasi alat)
 *
 * ⚠️ KOREKSI 2026-08-11: versi sebelumnya menyuruh `EVAL_LOCK_PROVIDER=true`
 * sebagai cara mengunci rute. Itu SALAH dan sekarang otomatis divonis TIDAK SAH
 * — `allow_fallbacks:false` sendirian hanya mematikan CADANGAN sesudah pilihan
 * default dibuat; penguncian butuh `provider.only`. Ditulis di sini supaya
 * berkas hasil lama yang lahir dari instruksi itu tidak diperlakukan sebagai sah.
 *
 * Pemakaian:
 *   node tools/eval/replay.mjs --runs 5 --label "HEAD"
 *   node tools/eval/replay.mjs --runs 5 --label "a85a7c0" --out hasil-a85a7c0.json
 *   node tools/eval/replay.mjs --bandingkan hasil-a.json hasil-b.json
 *
 * KODE KELUAR (jalur ukur) — vonis, bukan hukuman; berkas `--out` SELALU
 * ditulis lebih dulu, apa pun kodenya:
 *   0 = gerbang F6 lewat
 *   5 = pengukurannya TIDAK SAH (rute/lengan terconfound) — makna yang sama
 *       dengan kode 5 di jalur `--bandingkan`
 *   6 = gerbang F6 GAGAL sungguhan (sebaran >= 5 poin pada pengukuran sah)
 *   7 = gerbang TIDAK BISA DINILAI (putaran < 3, giliran < 21, kelas tak
 *       terekam) — bukan lulus, dan bukan gagal
 * Jangan merangkai jalur ukur dengan `&&`: pengukuran yang BERHASIL pun
 * memulangkan 7 selama korpusnya masih skenario asap 6 giliran. Jalankan tiap
 * langkah sebagai perintah terpisah; `--bandingkan` tetap sah dijalankan
 * apa pun vonis langkah ukurnya.
 *
 * Yang TIDAK dilakukan alat ini: menilai apakah kalimatnya enak dibaca. Ia
 * hanya menghitung pelanggaran yang bisa diperiksa mesin. Penilaian rasa tetap
 * milik manusia — tapi setidaknya rasa itu tidak lagi dipakai untuk memutuskan
 * commit mana yang salah.
 */
// 127.0.0.1, BUKAN localhost. Node 18+ menerjemahkan `localhost` ke ::1 (IPv6)
// lebih dulu, sementara Docker biasanya mempublikasikan port di IPv4 saja —
// hasilnya `fetch failed` tanpa status, tanpa petunjuk. Sudah kena sekali.
import { cetakKesahihan, bedaKonfigurasi, pasangkanPerKasus, konfigurasiLengan, cetakSebaran, kelasGabungan, selHit } from './kesahihan.mjs';
import { bangunJejak } from './jejak.mjs';

const BASE = process.env.HERMES_API ?? 'http://127.0.0.1:3001/api/v1';
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
    // >>> Koreksi (2026-08-10): versi pertama menandai SETIAP giliran >= 3 yang
    // tidak menyebut "golok" sebagai lupa produk. Itu salah rancang dan
    // menghasilkan 39% palsu: balasan yang BENAR untuk "cakranegara" (ongkir)
    // atau "cod aja kak" (minta alamat) memang tidak perlu menyebut nama
    // produk. Metrik yang menghukum jawaban benar lebih buruk daripada tidak
    // ada metrik — ia mengarahkan perbaikan ke tempat yang salah.
    //
    // Satu-satunya giliran yang BENAR-BENAR membuktikan memori adalah giliran
    // 4 ("ambil 2 aja"): bot mustahil tahu "2" itu apa tanpa mengingat giliran
    // 1. Di situlah, dan hanya di situ, tidak menyebut produk = lupa.
    lupa_produk: indeksGiliran === 4 && !/golok/i.test(t),
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

/** Bungkus fetch supaya penyebab koneksi ikut terbaca, bukan cuma "fetch failed". */
const sebab = (e) => {
  const c = e?.cause;
  return c?.code ? `${e.message} (${c.code}${c.address ? ` ${c.address}:${c.port}` : ''})` : e?.message ?? String(e);
};

/**
 * Pemeriksaan awal. Kalau API tidak terjangkau, BERHENTI di sini dengan pesan
 * yang bisa ditindaklanjuti — jangan mencoba lima putaran lalu mencetak tabel
 * nol yang terlihat rapi.
 */
async function preflight() {
  // >>> Koreksi (2026-08-10): `docker compose up -d` pulang begitu container
  // START, bukan begitu Nest SIAP — dan percobaan pertama Bossfren mati kena
  // ECONNRESET karena skrip langsung menembak. Ditunggu sampai 90 detik dengan
  // jeda 3 detik; ini bagian normal dari alur ukur (rebuild → ukur), bukan
  // keadaan luar biasa.
  const batas = Date.now() + 90_000;
  let terakhir;
  let ronde = 0;
  for (;;) {
    try {
      await j('GET', '/test-harness/sessions');
      if (ronde) console.log(`API siap sesudah ${ronde * 3} detik.\n`);
      return;
    } catch (e) {
      terakhir = e;
      if (Date.now() >= batas) break;
      if (ronde === 0) process.stdout.write('Menunggu API siap ');
      process.stdout.write('.');
      ronde++;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  {
    const e = terakhir;
    console.error(`\n✖ API tidak terjangkau di ${BASE}`);
    console.error(`  ${sebab(e)}\n`);
    console.error('  Periksa: (a) container hidup — `docker ps | grep hermes-api`');
    console.error('           (b) port terbuka  — `curl -s -o /dev/null -w "%{http_code}" ' + BASE + '/test-harness/sessions`');
    console.error('           (c) alamat lain   — HERMES_API=http://127.0.0.1:3001/api/v1 node replay.mjs ...\n');
    process.exit(2);
  }
}

async function satuPutaran(nomor) {
  const { session } = await j('POST', '/test-harness/sessions', {
    name: `eval-${nomor}-${Date.now()}`,
    provider: PROVIDER,
    model: MODEL,
  });
  const giliran = [];
  try {
    for (let i = 0; i < SKENARIO.length; i++) {
      // >>> ANGGA — diagnostik (2026-08-10, cowork): LAMA tiap giliran.
      // Timeout provider yang muncul 1 dari 3 putaran tidak bisa didiagnosis
      // tanpa angka ini: 30 detik itu batas per-permintaan di `AI_TIMEOUT_MS`,
      // dan tanpa distribusi lama-jawab kita tidak tahu apakah batas itu
      // kelewat sempit atau ada satu giliran yang memang menggantung. <<<
      const t0 = Date.now();
      let res;
      try {
        res = await j('POST', `/test-harness/sessions/${session.id}/send`, { text: SKENARIO[i] });
      } catch (e) {
        // GILIRAN MANA, dan sesudah BERAPA LAMA. Versi pertama cuma mencetak
        // "GAGAL: HTTP 500" — pesan yang sama persis untuk "provider menolak
        // permintaan" dan "jawaban tidak selesai dalam batas waktu", padahal
        // dua-duanya minta perbaikan di tempat yang berbeda.
        e.message = `giliran ${i + 1} sesudah ${Math.round((Date.now() - t0) / 1000)} detik: ${e.message}`;
        throw e;
      }
      const ms = Date.now() - t0;
      const teks = res?.reply?.content ?? '';
      const debug = res?.reply?.debugInfo ?? null;
      giliran.push({
        n: i + 1,
        kirim: SKENARIO[i],
        teks,
        ms,
        // Keadaan order saat giliran ini dijawab — dipakai membaca pelanggaran
        // `metode_sebelum_total`: apakah saat itu memang belum ada kutipan
        // ongkir/barang (jadi larangan "jangan tanya COD/Transfer sebelum
        // total" tidak pernah disuntikkan), atau ada tapi tetap dilanggar.
        //
        // >>> BARU-1 langkah 1 (2026-08-11): pemetaannya pindah ke
        // `./jejak.mjs` supaya bisa dipatok test — berkas ini punya top-level
        // `await` + `process.exit()`, jadi meng-import-nya dari test berarti
        // MENJALANKAN alat ukurnya. Alasan tiap field ada di sana. <<<
        jejak: bangunJejak(debug),
        ...periksa(teks, debug, i + 1),
      });
    }
  } finally {
    await j('DELETE', `/test-harness/sessions/${session.id}`).catch(() => {});
  }
  return giliran;
}

/**
 * >>> N2 — audit K23 ronde 3 (2026-08-11): SATU daftar kelas kegagalan.
 *
 * Daftar ini dulu ditulis DUA KALI dengan isi BERBEDA: `ringkas()` memuat enam
 * kelas (dipakai tabel ringkasan DAN gerbang sebaran, lewat
 * `Object.keys(ringkasan.hit)`), sementara penyaring diagnostik per-giliran
 * memuat lima — `gerbang_menahan` hilang. Akibatnya persis kelas kegagalan
 * yang alat ini dibangun untuk memberantasnya: sebuah pelanggaran IKUT
 * MENJATUHKAN vonis gerbang tapi TIDAK PERNAH tercetak isinya, jadi tidak ada
 * yang bisa ditelusuri. Duplikasi daftar = drift; sekarang satu sumber.
 */
const KELAS_GAGAL = ['kosong', 'kurung_menggantung', 'tanya_dobel', 'metode_sebelum_total', 'gerbang_menahan', 'lupa_produk'];

function ringkas(putaran) {
  const kelas = KELAS_GAGAL;
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
  // Lama-jawab: median & maksimum, keseluruhan dan per giliran. Maksimum yang
  // penting di sini, bukan rata-rata — yang membunuh sebuah giliran adalah
  // ekornya, dan ekor itulah yang menabrak batas waktu.
  const semuaMs = putaran.flatMap((p) => p.map((g) => g.ms)).filter((v) => typeof v === 'number');
  const med = (xs) => {
    if (!xs.length) return null;
    const u = [...xs].sort((a, b) => a - b);
    return u[Math.floor(u.length / 2)];
  };
  const lama = {
    medianMs: med(semuaMs),
    maksMs: semuaMs.length ? Math.max(...semuaMs) : null,
    perGiliranMs: Array.from({ length: SKENARIO.length }, (_, i) => {
      const xs = putaran.map((p) => p[i]?.ms).filter((v) => typeof v === 'number');
      return { median: med(xs), maks: xs.length ? Math.max(...xs) : null };
    }),
  };
  return { putaran: putaran.length, giliranTotal: total, hit, perGiliran, lama };
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
  const kosong = data.filter((d) => !d.ringkasan?.giliranTotal);
  if (kosong.length) {
    console.error(`\n✖ ${kosong.length} berkas berisi NOL giliran (${kosong.map((d) => d.label).join(', ')}) — tidak ada yang bisa dibandingkan.\n`);
    process.exit(3);
  }
  // >>> OPSI C (2026-08-11): PENJAGA LINTAS-LENGAN, dicetak SEBELUM angka apa
  // pun. Dua lengan pengukuran (temperature 0 = validasi ALAT · temperature
  // produksi = vonis BOT) menghasilkan berkas yang bentuknya identik, dan
  // menyandingkannya menghasilkan kesimpulan yang mulus dan salah. Ditolak di
  // sini, bukan diperingatkan di bawah tabel yang sudah terlanjur dibaca. <<<
  const bedaKonf = bedaKonfigurasi(data);
  for (const d of data) {
    const k = konfigurasiLengan(d.putaran);
    // NB-3: berkas tanpa data TIDAK boleh mencetak pernyataan positif
    // ("seed=[tidak dikirim]") tentang sesuatu yang tidak ia ketahui.
    const teks = k.lengan
      ? `temperature=${k.lengan.temperature ?? 'produksi'} seed=${k.lengan.seed ?? 'tidak dikirim'} kunciRute=${k.lengan.kunciRute} pin=${k.lengan.pinPenyedia?.join('+') ?? 'tidak'}`
      : 'TIDAK DIKETAHUI (biner tanpa pencatat lengan, atau lengan berubah di tengah pengukuran)';
    console.log(`  lengan ${d.label}: model=[${k.modelDiminta.join(',') || '?'}] ${teks}`);
  }
  if (bedaKonf.length) {
    console.error(`\n⛔ BERKAS INI LAHIR DARI LENGAN PENGUKURAN YANG BERBEDA — tidak dibandingkan.`);
    for (const b of bedaKonf) console.error(`   · ${b}`);
    console.error(`   Selisih apa pun antar kolom tidak bisa dipisahkan dari selisih konfigurasi.\n`);
    process.exit(4);
  }

  // RONDE 3: GABUNGAN kelas dari seluruh berkas — bukan dari berkas pertama.
  // Berkas hasil lama lahir sebelum `gerbang_menahan` ada; mengambil daftar
  // dari satu berkas membuat kelas itu hilang senyap dari tabel (atau muncul
  // sebagai `undefined/72`) tepat di tempat perbandingan A-vs-B terjadi.
  const kelas = kelasGabungan(data);
  console.log(`\n${'kelas kegagalan'.padEnd(24)}${data.map((d) => d.label.padStart(14)).join('')}`);
  console.log('-'.repeat(24 + 14 * data.length));
  for (const k of kelas) {
    const baris = data.map((d) => selHit(d, k).padStart(14)).join('');
    console.log(k.padEnd(24) + baris);
  }
  // >>> Koreksi AUDIT K23 (2026-08-11): dulu jalur ini `process.exit(0)` tepat
  // di sini — tanpa satu pun vonis kesahihan. Itu cacat terparah dari
  // kelompoknya, karena JUSTRU DI SINI perbandingan A-vs-B terjadi. Dua berkas
  // bisa masing-masing "sah" secara internal namun dilayani penyedia yang
  // BERBEDA satu sama lain, dan tabel di atas akan terbaca sebagai "commit B
  // memperbaiki `kosong`" padahal yang berubah penyedianya — persis confound
  // yang seluruh pekerjaan ini dibangun untuk memberantasnya. Datanya sudah
  // tersimpan di berkas hasil sejak awal, cuma tidak pernah dibaca. <<<
  console.log('');
  const vonis = [];
  for (const d of data) {
    console.log(`  --- kesahihan: ${d.label} ---`);
    vonis.push({ label: d.label, ...cetakKesahihan(d.putaran ?? [], '    ') });
    console.log('');
  }
  const semuaPenyedia = [...new Set(vonis.flatMap((v) => v.penyedia))];
  if (vonis.some((v) => !v.sah)) {
    console.log('  ⛔ SETIDAKNYA SATU KOLOM TIDAK SAH — tabel di atas TIDAK boleh dipakai memutuskan commit mana yang benar.\n');
  } else if (semuaPenyedia.length > 1) {
    console.log(`  ⛔ Tiap kolom sah SENDIRI-SENDIRI, tapi dilayani penyedia BERBEDA (${semuaPenyedia.join(' vs ')}).`);
    console.log('     Selisih antar kolom tidak bisa dibedakan dari selisih penyedia. Ukur ulang di jendela yang sama.\n');
  } else {
    console.log(`  ✔ Semua kolom sah dan dilayani penyedia yang sama (${semuaPenyedia[0]}) — selisihnya layak dibaca.\n`);
  }

  // >>> OPSI C (2026-08-11): PERBANDINGAN BERPASANGAN PER-KASUS.
  // Tabel agregat di atas membiarkan kasus yang perilakunya TIDAK berubah tetap
  // menyumbang kebisingan ke selisihnya. Di sini kasus stabil menyumbang NOL —
  // tuas terbesar yang tersedia, dan tidak butuh satu putaran tambahan maupun
  // menyentuh temperature. Hanya dijalankan untuk DUA berkas; berpasangan
  // bertiga bukan perbandingan, itu tabel lain lagi. <<<
  if (data.length === 2) {
    const pas = pasangkanPerKasus(data[0], data[1]);
    console.log(`  --- berpasangan per-kasus: ${data[0].label} → ${data[1].label} ---`);
    if (pas.kelasTimpang.length) console.log(`  ⚠ kelas hanya ada di SATU berkas, tidak dibandingkan: ${pas.kelasTimpang.join(', ')}`);
    if (pas.hanyaDi.length) console.log(`  ⚠ ${pas.hanyaDi.length} kasus hanya ada di satu berkas (${pas.hanyaDi.map((h) => `${h.n}@${h.label}`).join(', ')}) — TIDAK dibandingkan.`);
    // A5: klaim "kasus stabil menyumbang NOL kebisingan" hanya berlaku kalau
    // keluarannya dipatok. Di lengan produksi, `ra !== rb` tanpa ambang berarti
    // kasus yang perilakunya TIDAK berubah tetap sering dilaporkan "berubah"
    // dengan label yang terdengar pasti. Diukur penyanggal: pada p(gagal)=0,3
    // dan 3 putaran, 64% kasus stabil dilaporkan berubah, arahnya 50:50 acak.
    const L = vonis[0]?.lengan;
    if (!L || L.temperature !== 0) {
      console.log(`  ⚠ LENGAN PRODUKSI (temperature tidak dipatok): daftar di bawah DIDOMINASI KEBISINGAN SAMPLING.`);
      console.log(`    Pada p(gagal)~0,3 dengan 3 putaran, ~64% kasus yang TIDAK berubah tetap muncul di sini,`);
      console.log(`    dengan arah membaik/memburuk yang 50:50 acak. Jangan baca satu baris sebagai bukti.`);
    }
    if (!pas.sepadan) {
      console.log(`  ⛔ Dua berkas ini memutar SKENARIO BERBEDA di kasus ${pas.takSepadan.join(', ')} — tidak bisa dipasangkan.\n`);
    } else if (!pas.berubah.length) {
      console.log(`  Nol dari ${pas.dibandingkan} kasus yang dibandingkan berubah perilakunya.\n`);
    } else {
      console.log(`  ${pas.berubah.length} dari ${pas.dibandingkan} kasus yang dibandingkan berubah:`);
      for (const b of pas.berubah) {
        for (const [k, d] of Object.entries(b.delta))
          console.log(`    kasus ${b.n} · ${k.padEnd(22)} ${d.a} → ${d.b}  (${d.arah})`);
        console.log(`      kirim: ${b.kirim}`);
      }
      console.log('');
    }
  }
  // >>> KOREKSI AUDIT K23 (A10): dulu SEMUA jalur pulang 0, termasuk sesudah
  // mencetak "⛔ TIDAK SAH". Skrip/CI apa pun yang menulis
  // `replay.mjs --bandingkan … && lanjut` menerima lampu hijau untuk
  // perbandingan yang alat ini sendiri baru saja nyatakan tidak sah — yang
  // mengembalikan ketergantungan pada "orang membaca layar", persis yang mau
  // dihapus. Kode keluar sekarang mencerminkan vonisnya. <<<
  process.exit(vonis.some((v) => !v.sah) || semuaPenyedia.length > 1 ? 5 : 0);
}

await preflight();

const runs = Number(arg('runs', '5'));
const label = arg('label', 'tanpa-label');
const out = arg('out', null);
console.log(`Memutar ${SKENARIO.length} giliran x ${runs} putaran — label "${label}"`);
console.log(`API ${BASE} · provider ${PROVIDER} · model ${MODEL}\n`);
const putaran = [];
// >>> N1 — audit K23 ronde 3: nomor putaran yang BENAR-BENAR berhasil, disimpan
// sejajar dengan `putaran`. Kalau putaran 2 dan 4 mati kena 429, label "put1
// put2 put3" akan mengarang urutan yang tidak pernah terjadi dan menyembunyikan
// fakta bahwa dua putaran hilang. Sengaja TIDAK dimasukkan ke `putaran` itu
// sendiri supaya bentuk JSON hasil tidak berubah — `--bandingkan` dan berkas
// hasil lama tetap terbaca. <<<
const nomorPutaran = [];
for (let i = 1; i <= runs; i++) {
  process.stdout.write(`  putaran ${i}/${runs} ... `);
  try {
    const g = await satuPutaran(i);
    putaran.push(g);
    nomorPutaran.push(i);
    const rusak = g.filter((x) => KELAS_GAGAL.some((k) => x[k]));
    const lamaMaks = Math.max(...g.map((x) => x.ms ?? 0));
    console.log(`selesai — ${rusak.length}/${SKENARIO.length} giliran bermasalah · terlama ${(lamaMaks / 1000).toFixed(1)} detik`);
    // >>> ANGGA — diagnostik (2026-08-10, cowork): CETAK ISI giliran yang
    // melanggar, bukan cuma menghitungnya. Angka "metode_sebelum_total 1/12"
    // membuktikan pelanggaran itu ada tapi tidak menunjukkan KEADAAN saat ia
    // terjadi — dan tanpa keadaan itu, perbaikan mana pun cuma tebakan.
    // Sengaja dipotong 240 karakter: cukup untuk membaca kalimatnya, tidak
    // cukup untuk menenggelamkan tabel hasil. <<<
    for (const x of rusak) {
      const kelas = KELAS_GAGAL.filter((k) => x[k]);
      const ai = x.jejak.ai;
      const rute = ai ? ` llm=${ai.panggilan}${ai.gagal ? `(${ai.gagal} gagal)` : ''} penyedia=${ai.penyedia.join('+') || '?'}` : '';
      const alat = x.jejak.toolDipakai?.length ? ` tool=${x.jejak.toolDipakai.join('+')}` : '';
      console.log(`    ⌁ giliran ${x.n} [${kelas.join(',')}] mode=${x.jejak.funnelMode} langkah=${x.jejak.funnelStep ?? '—'} ongkir=${x.jejak.adaOngkir ? 'ada' : 'tidak'} item=${x.jejak.jumlahItem} gerbang=${x.jejak.gateWarnings.length}${alat}${rute}`);
      // >>> BARU-1 langkah 1 (2026-08-11): isi token giliran ini.
      //
      // Sengaja SELURUH token, bukan pilihan "yang kelihatan penting":
      // menyaring di sini berarti sudah memutuskan field mana yang membuktikan
      // "total tersodor", padahal justru itu yang belum terukur.
      //
      // >>> KOREKSI ronde 2 audit K23: versi pertama mencetak NAMA token saja.
      // Terbantah — himpunan namanya adalah fungsi dari ada/tidaknya kutipan,
      // jadi ia mengulang `ongkir=ada` di baris atasnya dan menjawab nol
      // pertanyaan. Yang dicari NILAInya, jadi nilainya yang dicetak. Newline
      // di `blok_total` diratakan supaya satu giliran tetap satu baris. <<<
      const tk = x.jejak.tokens;
      const isiToken = tk == null
        ? '(tanpa debugInfo)'
        : Object.keys(tk).length
          ? Object.entries(tk).map(([k, v]) => `${k}=${String(v).replace(/\s+/g, ' ')}`).join(' · ').slice(0, 400)
          : '(kosong — TIDAK ada kutipan hidup; lihat sensus di bawah sebelum menyimpulkan sebabnya)';
      console.log(`      token : ${isiToken}`);
      console.log(`      kirim : ${x.kirim}`);
      console.log(`      balas : ${(x.teks || '(kosong)').replace(/\s+/g, ' ').slice(0, 240)}`);
    }
  } catch (e) {
    console.log(`GAGAL: ${sebab(e)}`);
  }
}
// >>> Kalau NOL putaran berhasil, ini kegagalan alat — bukan hasil "bersih".
// Versi pertama mencetak tabel 0/0 yang terlihat rapi dan bahkan menulis
// berkas hasilnya, sehingga `--bandingkan` menyandingkan dua kekosongan
// seolah itu temuan. Persis kelas "kegagalan menyamar jadi hasil" yang alat
// ini justru dibangun untuk memberantasnya.
if (putaran.length === 0) {
  console.error(`\n✖ NOL putaran berhasil — tidak ada yang bisa diukur.`);
  console.error('  Berkas hasil TIDAK ditulis, supaya tidak ada angka palsu yang tersimpan.\n');
  process.exit(3);
}
if (putaran.length < runs) {
  console.log(`\n⚠ Hanya ${putaran.length} dari ${runs} putaran berhasil — angka di bawah dihitung dari yang berhasil saja.`);
}

const ringkasan = ringkas(putaran);
console.log(`\n=== ${label} — ${ringkasan.putaran} putaran, ${ringkasan.giliranTotal} giliran ===`);
for (const [k, v] of Object.entries(ringkasan.hit)) {
  const persen = ringkasan.giliranTotal ? Math.round((v / ringkasan.giliranTotal) * 100) : 0;
  console.log(`  ${k.padEnd(24)} ${String(v).padStart(3)}/${ringkasan.giliranTotal}  (${persen}%)`);
}
if (ringkasan.lama?.medianMs != null) {
  console.log(
    `\n  lama jawab: median ${(ringkasan.lama.medianMs / 1000).toFixed(1)} detik · ` +
      `terlama ${(ringkasan.lama.maksMs / 1000).toFixed(1)} detik ` +
      `(batas AI_TIMEOUT_MS bawaan 30 detik)`,
  );
}
// >>> F6 Bagian 1 (2026-08-11): VONIS KESAHIHAN, dicetak SEBELUM rincian
// per-giliran supaya tidak bisa terlewat. Alat ukur yang tahu dirinya sedang
// tidak sah WAJIB mengatakannya — bukan memulangkan tabel rapi yang menipu.
//
// >>> C2/C8/N3 — audit K23 ronde 3 (2026-08-11): URUTANNYA DIBALIK, dan
// alasannya bukan kerapian.
//
// Versi pertama mencetak sebaran DULU lalu kesahihan, sehingga keluaran lengan
// 1 memuat `✔ GERBANG F6 LEWAT` beberapa baris DI ATAS `⛔ TIDAK SAH` untuk
// pengukuran yang sama. Pembaca yang berhenti di baris pertama membawa pulang
// kesimpulan terbalik. Lebih dalam dari urutan cetak: `sah` memang tidak pernah
// dibaca jalur ukur sama sekali (N3) — dua vonis berjalan sendiri-sendiri.
//
// Sekarang kesahihan dihitung LEBIH DULU dan hasilnya DITERUSKAN sebagai
// `opsi.sah`. Vonis kesahihan MENANG: sebaran yang dihitung dari pengukuran
// terconfound bukan bukti apa pun. Angka sebarannya tetap dicetak — ia berguna
// sebagai diagnosis kebisingan — tapi ia tidak lagi boleh memberi ✔ sendiri.
//
// Komentar lama di blok ini menyatakan kesahihan "dicetak SEBELUM rincian
// per-giliran supaya tidak bisa terlewat"; sejak sebaran disisipkan di atasnya
// kalimat itu berhenti benar dan tidak ada yang mengoreksinya. Diperbaiki.
//
// >>> 2026-08-11: SEBARAN ANTAR PUTARAN. Tabel di atas menjumlahkan seluruh
// putaran (`5/12`); gerbang F6 menanyakan SELISIH antar putaran. Dua besaran
// berbeda, dan sampai hari ini yang dicetak bukan yang ditanya — sebarannya
// harus dihitung manual dari JSON. Sekarang alat menjawabnya sendiri. <<<
// >>> BARU-1 langkah 1 (2026-08-11) — SENSUS TOKEN + KAWAT SANDUNG INVARIAN.
//
// Lahir dari ronde 2 audit K23, dan alasannya satu: satu-satunya cara putaran
// ukur ini bisa disalahbaca secara diam-diam adalah kalau panel debug BUTA
// se-putaran. `tokens: {}` yang berarti "kolektor tidak sempat membaca"
// (`ShippingService` tak ter-inject · `conversationId` kosong · `debugState()`
// melempar dan `catch` menelannya · provider `mock`) terlihat persis sama
// dengan `{}` yang berarti "memang tidak ada kutipan" — dan pembacanya akan
// menyimpulkan "sistem tidak pernah menghitung total" padahal ALAT-nya yang
// tidak pernah membaca. Itu kelas bahaya utama proyek ini: nilai yang terlihat
// sah, artinya lain.
//
// Kawat sandung di bawah menguji premis yang SELURUH irisan ini bersandar
// padanya — `tokens tidak kosong ⟺ adaOngkir`, diverifikasi sampai
// `ShippingService.debugState()`. Kalau biner yang diukur ternyata bukan yang
// diasumsikan, itu ketahuan di putaran yang sama, bukan di ronde audit
// berikutnya. Nol pengaruh ke vonis: ini murni cetak. <<<
{
  const semua = putaran.flat();
  const tNull = semua.filter((x) => x.jejak?.tokens == null).length;
  const tKosong = semua.filter((x) => x.jejak?.tokens && !Object.keys(x.jejak.tokens).length).length;
  const tIsi = semua.length - tNull - tKosong;
  console.log(`\n  --- sensus token (BARU-1) ---`);
  console.log(`    ${tIsi} berisi · ${tKosong} kosong · ${tNull} tanpa debugInfo  (dari ${semua.length} giliran)`);
  if (!tIsi && tKosong) {
    console.log('    ⚠ NOL giliran berkutipan. SEBELUM menyimpulkan "total tidak pernah lahir": `tokens:{}`');
    console.log('      juga muncul kalau ShippingService tidak ter-inject, `conversationId` kosong, atau');
    console.log('      `debugState()` melempar — periksa `adaOngkir`/`items` dan log server dulu.');
  }
  if (tNull) {
    console.log(`    ⚠ ${tNull} giliran TANPA \`debugInfo\` sama sekali — panel debug tidak menjawab, bukan order yang kosong.`);
    console.log('      Catatan: `periksa()` menilai giliran seperti ini dengan `funnelMode = null`, sehingga');
    console.log('      `metode_sebelum_total` bisa menyala karena KETIADAAN DATA. Utang pra-ada; jangan dibaca sebagai pelanggaran.');
  }
  const langgar = semua.filter((x) => x.jejak?.tokens && (Object.keys(x.jejak.tokens).length > 0) !== x.jejak.adaOngkir);
  if (langgar.length) {
    console.log(`    ⛔ ${langgar.length} giliran MELANGGAR invarian "tokens≠{} ⟺ adaOngkir" (giliran ${langgar.map((x) => x.n).join(', ')}).`);
    console.log('       Biner yang diukur BUKAN yang diasumsikan `jejak.mjs`. Jangan pakai hasil ini untuk memutuskan apa pun.');
  }
}

console.log('\n  --- rute penyedia hulu (panggilan chat saja; embeddings & panggilan pasca-kirim di luar cakupan) ---');
const vonisKesahihan = cetakKesahihan(putaran);

console.log('\n  --- sebaran antar putaran (INI yang ditanya gerbang F6) ---');
const vonisGerbang = cetakSebaran(putaran, Object.keys(ringkasan.hit), '    ', {
  sah: vonisKesahihan.sah,
  nomor: nomorPutaran,
});

console.log('\n  per giliran:');
ringkasan.perGiliran.forEach((g, i) => {
  const isi = Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ');
  const l = ringkasan.lama?.perGiliranMs?.[i];
  const jam = l?.maks != null ? ` · ${(l.median / 1000).toFixed(1)}/${(l.maks / 1000).toFixed(1)} detik (median/terlama)` : '';
  console.log(`    giliran ${i + 1}: ${isi || '— bersih —'}${jam}`);
});
if (out) {
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ label, waktu: new Date().toISOString(), ringkasan, putaran }, null, 2));
  console.log(`\nTersimpan: ${out}`);
} else {
  // >>> BARU-1 langkah 1 (2026-08-11, ronde 2 audit K23): layar hanya mencetak
  // giliran yang MELANGGAR; giliran yang bersih tidak pernah menampilkan
  // tokennya. Untuk BARU-1 justru giliran bersih yang sering memegang
  // jawabannya, dan tanpa `--out` nilai token seluruh putaran ini hilang
  // permanen — satu putaran (laptop + kuota LLM + risiko 429) terbuang tanpa
  // ada yang sadar sampai berkasnya dicari dan tidak ada. <<<
  console.log('\n⚠ Tanpa `--out`, nilai token giliran yang BERSIH tidak tersimpan di mana pun —');
  console.log('  dan justru giliran bersih yang sering menjawab pertanyaan BARU-1. Ulangi dengan `--out <berkas>.json`.');
}

// >>> A10 (diperluas, 2026-08-11): jalur `--bandingkan` sudah memulangkan kode
// keluar yang mencerminkan vonisnya; jalur UKUR masih selalu 0 — termasuk
// sesudah mencetak `✖ GERBANG F6 BELUM LEWAT`. Selama begitu, satu-satunya
// penjaga gerbang adalah orang yang membaca layar, dan itu persis yang
// hendak dihapus. Berkas hasil TETAP ditulis lebih dulu: kode keluar adalah
// vonis, bukan hukuman — datanya masih dibutuhkan untuk menelusuri sebabnya.
//
// >>> RONDE 3: satu kode untuk tiga sebab yang berbeda DICABUT. Versi
// sebelumnya memulangkan 6 untuk "gagal", "tidak bisa dinilai", DAN "tidak
// sah" sekaligus — dan karena `SKENARIO` sekarang cuma 6 giliran (di bawah
// `MIN_GILIRAN`), setiap pengukuran yang BERHASIL pun keluar 6. Kode keluar
// yang selalu sama adalah kode keluar tanpa informasi.
//
// Yang SENGAJA TIDAK dilakukan: menambah flag `--tanpa-gerbang`. Itu menambal
// rancangan yang keliru, dan proyek ini melarangnya. Akar masalahnya bukan
// gerbangnya — melainkan bahwa korpusnya belum ada; begitu L4a (51 kasus)
// disambungkan ke jalur ini, gerbangnya bisa dinilai dengan sendirinya.
if (!vonisKesahihan.sah) {
  console.log('\n  (kode keluar 5 — pengukuran TIDAK SAH; hasil di atas tetap ditulis)');
  process.exit(5);
}
if (!vonisGerbang.bisaDinilai) {
  console.log('\n  (kode keluar 7 — gerbang F6 tidak bisa dinilai; hasil di atas tetap ditulis)');
  process.exit(7);
}
if (!vonisGerbang.lulus) {
  console.log('\n  (kode keluar 6 — gerbang F6 GAGAL; hasil di atas tetap ditulis)');
  process.exit(6);
}
