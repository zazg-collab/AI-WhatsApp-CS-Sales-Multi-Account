/**
 * >>> ANGGA — F6 Bagian 1, ronde perbaikan audit K23 (2026-08-11, cowork).
 *
 * Logika VONIS KESAHIHAN dipisahkan dari `replay.mjs` supaya bisa DIUJI.
 * Alasannya bukan kerapian: audit K23 menemukan versi pertamanya bisa mencetak
 * "✔ layak dibandingkan" untuk pengukuran yang justru paling terconfound, dan
 * ketiga cacatnya searah — selalu ke arah MENENANGKAN. Logika yang bisa
 * berbohong ke satu arah, dipakai untuk memutuskan gerbang kelulusan F6, dan
 * TIDAK punya test, adalah persis kombinasi yang melahirkan pakem K23.
 *
 * `replay.mjs` tidak bisa diuji apa adanya: ia menjalankan `preflight()` dan
 * memutar percakapan sungguhan begitu diimpor. Modul ini murni — nol I/O, nol
 * jaringan, nol keadaan global. Testnya: `node --test tools/eval/`.
 * <<<
 */
/**
 * Rute penyedia hulu. Ini BUKAN metrik mutu bot — ia metrik KESAHIHAN: ia
 * menjawab "boleh tidak angka-angka di atas dibandingkan dengan putaran lain?"
 *
 * >>> DITULIS ULANG sesudah audit K23 (2026-08-11). Versi pertama bisa
 * mencetak "✔ layak dibandingkan" untuk pengukuran yang justru paling
 * terconfound. Tiga cacatnya, semuanya searah — selalu ke arah MENENANGKAN:
 *
 *  (1) `takDilaporkan` dicetak tapi tidak pernah ikut membatalkan vonis. 70
 *      dari 72 giliran tanpa data penyedia tetap dapat ✔.
 *  (2) Panggilan yang GAGAL tidak ikut membatalkan vonis — padahal percobaan
 *      gagal justru momen paling mungkin rute berpindah.
 *  (3) Giliran dengan NOL panggilan LLM dihitung sebagai "rute tidak terkunci",
 *      sehingga putaran `EVAL_PROVIDER=mock` menuduh operator lupa menyetel
 *      env padahal putaran itu tak pernah menyentuh penyedia mana pun.
 *
 * Aturan barunya satu kalimat: **ketiadaan data tidak pernah boleh jatuh ke ✔.**
 */
export function ringkasPenyedia(putaran) {
  const perPenyedia = new Map();
  const modelDilayani = new Set();
  let panggilan = 0, gagal = 0, takDilaporkan = 0, giliranMintaKunci = 0;
  let giliranBerLlm = 0, giliranTanpaLlm = 0, giliranTanpaAlat = 0, lenganTakTerekam = 0;
  const lengan = [];
  for (const p of putaran)
    for (const g of p) {
      const r = g.jejak?.ai;
      if (!r) { giliranTanpaAlat++; continue; }
      // >>> KOREKSI AUDIT K23 (2026-08-11, cacat NB-1 & NB-2). Bentuk `aiRingkas`
      // yang tidak lengkap (berkas hasil dari biner versi lain) dulu punya DUA
      // mode gagal, dan dua-duanya buruk: `for (const nama of r.penyedia)`
      // melempar `TypeError` — alat ukur CRASH alih-alih memberi vonis — dan
      // `gagal`/`penyediaTidakDilaporkan` yang absen jadi `NaN`, yang falsy,
      // sehingga `if (r.gagal)` lewat begitu saja dan vonisnya jatuh ke ✔ SAH.
      // Bias searah menenangkan lagi, persis kelas yang K23 dibangun untuk
      // memberantas. Bentuk cacat sekarang dihitung sebagai "tanpa alat ukur". <<<
      const utuh = typeof r.panggilan === 'number' && typeof r.gagal === 'number'
        && typeof r.penyediaTidakDilaporkan === 'number' && Array.isArray(r.penyedia);
      if (!utuh) { giliranTanpaAlat++; continue; }
      // Giliran yang memang tidak menembak LLM DIKELUARKAN dari penyebut
      // kesahihan. Ia bukan bukti rute terkunci, dan bukan bukti sebaliknya.
      if (!r.panggilan) { giliranTanpaLlm++; continue; }
      giliranBerLlm++;
      panggilan += r.panggilan;
      gagal += r.gagal;
      takDilaporkan += r.penyediaTidakDilaporkan;
      if (r.payloadMintaKunciRute) giliranMintaKunci++;
      for (const nama of r.penyedia) perPenyedia.set(nama, (perPenyedia.get(nama) ?? 0) + 1);
      for (const m of r.modelDilayani ?? []) modelDilayani.add(m);
      if (r.konfigurasi?.lengan) lengan.push(r.konfigurasi.lengan);
      else lenganTakTerekam++;
    }
  return { perPenyedia, modelDilayani, panggilan, gagal, takDilaporkan, lengan, lenganTakTerekam,
           giliranMintaKunci, giliranBerLlm, giliranTanpaLlm, giliranTanpaAlat };
}

/** Cetak blok kesahihan + vonis. Dipakai jalur ukur DAN jalur `--bandingkan`. */
export function cetakKesahihan(putaran, indent = '    ') {
  const r = ringkasPenyedia(putaran);
  const i = indent;
  if (!r.giliranBerLlm) {
    if (r.giliranTanpaAlat)
      console.log(`${i}✖ biner yang diukur BELUM punya pencatat penyedia (field \`aiRingkas\` absen).`);
    else
      console.log(`${i}✖ tidak ada satu pun panggilan LLM terukur (mode mock? seluruh giliran berhenti sebelum LLM?).`);
    console.log(`${i}  Angka mutu di atas tidak bisa dinyatakan sah maupun tidak sah — rutenya tak terlihat.`);
    return { sah: false, penyedia: [], lengan: null };
  }
  const daftar = [...r.perPenyedia.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`${i}panggilan chat LLM   : ${r.panggilan}${r.gagal ? ` (${r.gagal} percobaan GAGAL)` : ''}`);
  console.log(`${i}giliran dilayani     : ${daftar.map(([n, c]) => `${n}=${c}`).join(' · ') || '(tidak ada yang dilaporkan)'}`);
  if (r.modelDilayani.size) console.log(`${i}model dilayani       : ${[...r.modelDilayani].join(' · ')}`);
  if (r.takDilaporkan) console.log(`${i}penyedia tak dilapor : ${r.takDilaporkan} PANGGILAN (bukan giliran)`);
  console.log(`${i}payload minta kunci  : ${r.giliranMintaKunci}/${r.giliranBerLlm} giliran ber-LLM`);
  if (r.giliranTanpaLlm) console.log(`${i}giliran tanpa LLM    : ${r.giliranTanpaLlm} (dikeluarkan dari penyebut)`);
  if (r.giliranTanpaAlat) console.log(`${i}tanpa alat ukur      : ${r.giliranTanpaAlat}`);

  const masalah = [];
  if (daftar.length > 1) masalah.push(`${daftar.length} penyedia hulu BERBEDA melayani pengukuran ini`);
  if (r.takDilaporkan) masalah.push(`${r.takDilaporkan} panggilan TIDAK melaporkan penyedianya — rutenya tak diketahui, bukan sama`);
  if (r.gagal) masalah.push(`${r.gagal} percobaan GAGAL — titik paling mungkin rute berpindah, dan pengacau utama angka lama-jawab`);
  if (r.giliranMintaKunci < r.giliranBerLlm) masalah.push('payload TIDAK meminta kunci rute (`EVAL_LOCK_PROVIDER=true` di PROSES API, bukan di shell replay)');
  if (r.modelDilayani.size > 1) masalah.push(`${r.modelDilayani.size} varian model berbeda dilayani`);

  if (masalah.length) {
    console.log(`\n${i}⚠ ANGKA MUTU DI ATAS TIDAK SAH UNTUK DIBANDINGKAN LINTAS PUTARAN.`);
    for (const m of masalah) console.log(`${i}  · ${m}`);
    console.log(`${i}  Sebaran yang lebar di sini belum tentu soal bot — perbaiki dulu alat ukurnya.`);
    return { sah: false, penyedia: daftar.map(([n]) => n), lengan: r.lengan[0] ?? null };
  }
  console.log(`\n${i}✔ satu penyedia (${daftar[0][0]}), payload minta kunci di semua giliran ber-LLM.`);
  // >>> KOREKSI AUDIT (A9): kalimat ini dulu HARDCODE "seed tidak dikirim,
  // temperature != 0" — dan sesudah lengan 1 lahir, dua-duanya justru
  // kebalikannya. Alat yang mengaku sedang menyatakan BATASNYA sendiri lalu
  // menyatakan dua fakta yang salah adalah lebih buruk daripada diam. Sekarang
  // dibaca dari lengan yang benar-benar terekam. <<<
  const L = r.lengan[0];
  console.log(`${i}  ⚠ Yang TIDAK dibuktikan alat ini: apakah HULU menghormati permintaan kunci itu.`);
  if (L && L.temperature === 0 && L.seed !== null)
    console.log(`${i}    Determinisme: temperature 0 + seed ${L.seed} DIMINTA — tapi apakah hulu menghormati \`seed\` juga tidak dibuktikan.`);
  else if (L && L.temperature === 0)
    console.log(`${i}    Determinisme: temperature 0, TANPA seed — keluaran masih bisa berbeda antar putaran.`);
  else
    console.log(`${i}    Determinisme: TIDAK dipatok (lengan produksi) — sebaran antar putaran WAJAR, jangan dibaca sebagai regresi.`);
  return { sah: true, penyedia: daftar.map(([n]) => n), lengan: L ?? null };
}


/**
 * >>> ANGGA — F6 Bagian 1, OPSI C (2026-08-11): PENJAGA LINTAS-LENGAN.
 *
 * Begitu ada dua lengan pengukuran (temperature 0 untuk memvalidasi ALAT,
 * temperature produksi untuk memvonis BOT), kesalahan yang paling mudah terjadi
 * bukan salah hitung — melainkan menyandingkan angka lengan 1 dengan angka
 * lengan 2 lalu menyimpulkan "commit B lebih baik". Alat harus MENOLAKNYA,
 * bukan mengandalkan orang ingat lengan mana yang menghasilkan berkas mana.
 */
export function konfigurasiLengan(putaran) {
  const modelDiminta = new Set();
  const lengan = [];
  let tanpaLengan = 0, adaGiliran = 0;
  for (const p of putaran ?? [])
    for (const g of p) {
      const k = g.jejak?.ai?.konfigurasi;
      adaGiliran++;
      if (!k) { tanpaLengan++; continue; }
      for (const v of k.modelDiminta ?? []) modelDiminta.add(v);
      if (k.lengan) lengan.push(k.lengan); else tanpaLengan++;
    }
  const seragam = lengan.length > 0 && lengan.every(
    (l) => l.temperature === lengan[0].temperature && l.seed === lengan[0].seed && l.kunciRute === lengan[0].kunciRute,
  );
  return {
    modelDiminta: [...modelDiminta].sort(),
    // `null` = TIDAK DIKETAHUI. Bukan "kosong", bukan "sama dengan yang lain
    // yang juga kosong" — itu cacat A2, dan arahnya meloloskan perbandingan
    // lintas-lengan tanpa satu kata peringatan.
    lengan: seragam && !tanpaLengan ? { ...lengan[0] } : null,
    tanpaLengan,
    adaGiliran,
  };
}

const samaPersis = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const samaLengan = (a, b) =>
  a !== null && b !== null && a.temperature === b.temperature && a.seed === b.seed && a.kunciRute === b.kunciRute;

/**
 * Daftar perbedaan konfigurasi antar berkas. Kosong = boleh dibandingkan.
 *
 * >>> KOREKSI AUDIT K23 (2026-08-11): dulu membandingkan HIMPUNAN temperature
 * efektif, dan itu cacat berkepala dua (NB-5): himpunan kosong bikin dua berkas
 * tanpa instrumentasi lolos sebagai "selengan" (A2), sementara satu jalur kode
 * yang kebetulan terlewati di satu berkas saja bikin dua berkas SELENGAN
 * ditolak (A11). Sekarang identitasnya dari DEKLARASI env, yang konstan untuk
 * seluruh proses pengukuran, jadi dua-duanya hilang sekaligus. <<<
 */
export function bedaKonfigurasi(daftarBerkas) {
  const konf = daftarBerkas.map((d) => ({ label: d.label, k: konfigurasiLengan(d.putaran) }));
  const beda = [];
  const takDiketahui = konf.filter((c) => c.k.lengan === null);
  if (takDiketahui.length) {
    // Ketiadaan data TIDAK PERNAH jatuh ke "boleh dibandingkan".
    beda.push(`lengan TIDAK DIKETAHUI di: ${takDiketahui.map((c) => c.label).join(', ')} — berkas dari biner tanpa pencatat lengan, atau lengannya berubah di tengah pengukuran`);
    return beda;
  }
  const acuan = konf[0];
  const tulis = (l) => `temperature=${l.temperature ?? 'produksi'} seed=${l.seed ?? 'tidak dikirim'} kunciRute=${l.kunciRute}`;
  for (const lain of konf.slice(1)) {
    if (!samaLengan(acuan.k.lengan, lain.k.lengan))
      beda.push(`lengan: ${acuan.label}=[${tulis(acuan.k.lengan)}] vs ${lain.label}=[${tulis(lain.k.lengan)}]`);
    if (!samaPersis(acuan.k.modelDiminta, lain.k.modelDiminta))
      beda.push(`modelDiminta: ${acuan.label}=[${acuan.k.modelDiminta.join(',') || '—'}] vs ${lain.label}=[${lain.k.modelDiminta.join(',') || '—'}]`);
  }
  return beda;
}

/**
 * >>> PERBANDINGAN BERPASANGAN PER-KASUS.
 *
 * Kenapa ini lebih penting daripada menaikkan jumlah putaran: korpusnya
 * KASUS YANG SAMA PERSIS di kedua sisi. Dengan membandingkan dua persentase
 * agregat, kasus yang perilakunya TIDAK berubah tetap menyumbang kebisingan ke
 * selisihnya. Dengan membandingkan per-kasus, mereka menyumbang NOL — kebisingan
 * dari kasus stabil hilang sendiri, tanpa satu putaran tambahan dan tanpa
 * menyentuh temperature.
 *
 * Yang dipulangkan hanya kasus yang BERUBAH. Kasus yang sama-sama bersih atau
 * sama-sama rusak di kedua sisi memang bukan informasi tentang perubahan kode.
 */
export function pasangkanPerKasus(a, b, kelasDiminta) {
  // >>> KOREKSI AUDIT K23 (2026-08-11, A3): `kelas` dulu diambil dari berkas
  // PERTAMA saja. Kelas yang tidak ada di berkas kedua jadi `undefined` →
  // falsy → dihitung 0 → dilaporkan "membaik" di SETIAP kasus. Operator
  // membaca "commit B memperbaiki lupa_produk di semua kasus" padahal berkas B
  // tidak pernah mengukurnya. Sekarang dipakai IRISAN, dan yang di luar irisan
  // dilaporkan terpisah alih-alih diam-diam jadi nol. <<<
  const kelasA = Object.keys(a.ringkasan?.hit ?? {});
  const kelasB = Object.keys(b.ringkasan?.hit ?? {});
  const kelas = (kelasDiminta ?? [...new Set([...kelasA, ...kelasB])]).filter(
    (k) => (!kelasA.length || kelasA.includes(k)) && (!kelasB.length || kelasB.includes(k)),
  );
  const kelasTimpang = (kelasDiminta ?? [...new Set([...kelasA, ...kelasB])]).filter((k) => !kelas.includes(k));
  const ringkas = (data) => {
    const m = new Map();
    for (const p of data.putaran ?? [])
      for (const g of p) {
        let e = m.get(g.n);
        if (!e) { e = { n: g.n, kirim: g.kirim, putaran: 0, hit: Object.fromEntries(kelas.map((k) => [k, 0])) }; m.set(g.n, e); }
        e.putaran++;
        for (const k of kelas) if (g[k]) e.hit[k]++;
      }
    return m;
  };
  const ma = ringkas(a), mb = ringkas(b);
  const kunci = [...new Set([...ma.keys(), ...mb.keys()])].sort((x, y) => x - y);

  // Penjaga: kalau teks yang dikirim di indeks yang sama BERBEDA, dua berkas ini
  // memutar skenario yang berbeda dan memasangkannya per indeks adalah omong
  // kosong. Menolak jauh lebih baik daripada memulangkan tabel yang rapi.
  const takSepadan = kunci.filter((n) => ma.get(n) && mb.get(n) && ma.get(n).kirim !== mb.get(n).kirim);
  if (takSepadan.length) return { sepadan: false, takSepadan, berubah: [], kelasTimpang, hanyaDi: [] };

  // >>> KOREKSI AUDIT K23 (A4): kasus yang cuma ada di SATU berkas dulu dibuang
  // diam-diam oleh `continue` tapi tetap masuk `totalKasus`, sehingga tercetak
  // "Nol dari 8 kasus berubah" padahal 2 di antaranya tidak pernah
  // dibandingkan. Skenario yang sangat mungkin: `SKENARIO` bertambah giliran
  // di antara dua pengukuran, atau satu putaran mati di tengah. <<<
  const hanyaDi = kunci
    .filter((n) => !ma.get(n) || !mb.get(n))
    .map((n) => ({ n, label: ma.get(n) ? a.label : b.label }));

  const berubah = [];
  for (const n of kunci) {
    const ea = ma.get(n), eb = mb.get(n);
    if (!ea || !eb) continue;
    const delta = {};
    for (const k of kelas) {
      const ra = ea.hit[k] / ea.putaran, rb = eb.hit[k] / eb.putaran;
      if (ra !== rb) delta[k] = { a: `${ea.hit[k]}/${ea.putaran}`, b: `${eb.hit[k]}/${eb.putaran}`, arah: rb < ra ? 'membaik' : 'memburuk' };
    }
    if (Object.keys(delta).length) berubah.push({ n, kirim: ea.kirim, delta });
  }
  return {
    sepadan: true, takSepadan: [], berubah, kelasTimpang, hanyaDi,
    totalKasus: kunci.length,
    dibandingkan: kunci.length - hanyaDi.length,
  };
}
