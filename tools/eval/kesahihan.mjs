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
  const pinInfo = r.lengan[0]?.pinPenyedia;
  if (pinInfo) console.log(`${i}pin penyedia diminta : ${pinInfo.join(', ')}`);
  if (r.giliranTanpaLlm) console.log(`${i}giliran tanpa LLM    : ${r.giliranTanpaLlm} (dikeluarkan dari penyebut)`);
  if (r.giliranTanpaAlat) console.log(`${i}tanpa alat ukur      : ${r.giliranTanpaAlat}`);

  const masalah = [];
  if (daftar.length > 1) masalah.push(`${daftar.length} penyedia hulu BERBEDA melayani pengukuran ini`);
  if (r.takDilaporkan) masalah.push(`${r.takDilaporkan} panggilan TIDAK melaporkan penyedianya — rutenya tak diketahui, bukan sama`);
  if (r.gagal) masalah.push(`${r.gagal} percobaan GAGAL — titik paling mungkin rute berpindah, dan pengacau utama angka lama-jawab`);
  if (r.giliranMintaKunci < r.giliranBerLlm) masalah.push('payload TIDAK meminta kunci rute (`EVAL_LOCK_PROVIDER=true` di PROSES API, bukan di shell replay)');
  if (r.modelDilayani.size > 1) masalah.push(`${r.modelDilayani.size} varian model berbeda dilayani`);

  // >>> ANGGA — DICABUT lalu DIGANTI, ronde penyanggal audit K23 (2026-08-11).
  //
  // Versi pertama membandingkan `pinPenyedia` (SLUG, diisi operator) dengan
  // `penyedia` dari badan respons (NAMA TAMPILAN). Penyanggal menembak
  // `GET https://openrouter.ai/api/v1/providers` — publik, tanpa auth, 101
  // penyedia, dan `name` serta `slug` adalah KOLOM TERPISAH. Kelima nama yang
  // benar-benar kami ukur (DeepInfra, StreamLake, Parasail, Google, Crusoe)
  // ada sebagai `name` dan **NOL** sebagai `slug`. "Google" yang menentukan:
  // slugnya `google-vertex`.
  //
  // Jadi pemeriksaan itu ANTI-KORELASI DENGAN KEBENARAN — ia LULUS persis saat
  // pin kemungkinan besar SALAH (operator menulis nama tampilan), dan GAGAL
  // persis saat pin kemungkinan besar BENAR (operator menulis slug). Gerbang F6
  // jadi permanen merah untuk konfigurasi yang benar. Dicabut, bukan ditambal.
  //
  // `toLowerCase` di kedua sisi JUGA DITOLAK: 23 dari 101 penyedia punya
  // `name.toLowerCase() !== slug`, dan normalisasi agresif pun masih gagal untuk
  // lima — termasuk `Google → google-vertex`, salah satu yang kami ukur. Lebih
  // buruk: mode gagalnya berbalik jadi LOLOS DIAM-DIAM ("cocok" karena kebetulan
  // string), arah yang berkas ini justru dibangun untuk memberantasnya.
  //
  // YANG DIPAKAI SEBAGAI GANTINYA: besaran yang memang bisa dibuktikan dari
  // data — **tepat SATU penyedia melayani seluruh pengukuran** (sudah dijaga
  // `daftar.length > 1` di atas). Itu OUTCOME yang kita pedulikan; apakah pin
  // yang MENYEBABKANNYA tidak perlu diklaim.
  const pin = r.lengan[0]?.pinPenyedia ?? null;
  if (!pin && r.lengan[0]?.kunciRute) {
    // Ini TERVERIFIKASI ke dokumentasi OpenRouter, jadi tetap jadi masalah.
    masalah.push('kunci rute diminta TANPA pin penyedia — `allow_fallbacks:false` sendirian TIDAK mengunci rute (butuh `EVAL_PROVIDER_ONLY`)');
  }
  // Cacat-baru-1 & B5: ketiadaan data TIDAK PERNAH boleh jatuh ke ✔.
  // `giliranTanpaAlat` dan `lenganTakTerekam` selama ini dihitung lalu tidak
  // pernah dibaca — dan di atasnya kini berdiri kalimat yang berbunyi "SELURUH
  // giliran", klaim universal atas giliran yang alat ini tak pernah lihat.
  if (r.lenganTakTerekam)
    masalah.push(`${r.lenganTakTerekam} giliran tidak merekam lengan — identitas pengukurannya tidak diketahui`);
  if (r.giliranTanpaAlat)
    masalah.push(`${r.giliranTanpaAlat} giliran tanpa alat ukur — tidak bisa dinyatakan sah maupun tidak`);
  // Cacat-baru-2 & B2: `r.lengan[0]` dipakai mewakili seluruh putaran, padahal
  // `konfigurasiLengan` di berkas yang SAMA sudah memeriksa keseragaman. Satu
  // modul, dua standar, dan jalur ukur memakai yang lemah. Ditolak saat berbeda
  // — BUKAN disatukan (union), karena union melegalkan pengukuran heterogen.
  if (r.lengan.length && !r.lengan.every((l) => samaLengan(l, r.lengan[0])))
    masalah.push('LENGAN BERUBAH DI TENGAH PENGUKURAN — giliran-giliran ini tidak diukur dengan konfigurasi yang sama');

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
  if (L?.pinPenyedia) {
    console.log(`${i}  Pin diminta [${L.pinPenyedia.join(', ')}] · yang melayani [${daftar.map(([n]) => n).join(', ')}].`);
    console.log(`${i}  ⚠ Keduanya SENGAJA TIDAK dibandingkan: pin memakai SLUG OpenRouter, badan respons`);
    console.log(`${i}    memakai NAMA TAMPILAN, dan itu dua ruang nama berbeda (mis. Google → google-vertex).`);
    console.log(`${i}    Yang dibuktikan di sini bukan "pin dihormati", melainkan "satu penyedia untuk seluruh putaran".`);
  } else {
    console.log(`${i}  ⚠ Yang TIDAK dibuktikan alat ini: apakah HULU menghormati permintaan kunci itu.`);
  }
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
  const seragam = lengan.length > 0 && lengan.every((l) => samaLengan(l, lengan[0]));
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

const samaPin = (x, y) =>
  (!x && !y) || (!!x && !!y && x.length === y.length && x.every((v, i) => v === y[i]));

// >>> B1 (audit K23): `lenganSeragam` di sisi TypeScript sudah membandingkan pin,
// cerminannya di sini TIDAK — jadi dua berkas dengan pin BERBEDA lolos sebagai
// "selengan", dan selisih antar penyedia terbaca sebagai selisih kode. Persis
// confound yang seluruh pekerjaan ini berantas, lolos lewat pintu belakang. <<<
const samaLengan = (a, b) =>
  a !== null && b !== null && a.temperature === b.temperature && a.seed === b.seed
  && a.kunciRute === b.kunciRute && samaPin(a.pinPenyedia, b.pinPenyedia);

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
  // Cacat-baru-3: tanpa pin di sini, pesan penolakannya menampilkan dua string
  // IDENTIK dan berbunyi "berbeda" tanpa perbedaan yang terlihat.
  const tulis = (l) => `temperature=${l.temperature ?? 'produksi'} seed=${l.seed ?? 'tidak dikirim'} kunciRute=${l.kunciRute} pin=${l.pinPenyedia?.join('+') ?? 'tidak'}`;
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

/**
 * >>> ANGGA — 2026-08-11: SEBARAN ANTAR PUTARAN — pertanyaan yang gerbang F6
 * sebenarnya ajukan, dan yang alat ini SELAMA INI TIDAK BISA JAWAB.
 *
 * Gerbang F6 berbunyi: *"korpus jalan 3x berulang, sebaran < 5 poin."*
 * `replay.mjs` mencetak `5/12` — JUMLAH pelanggaran lintas seluruh putaran.
 * Itu besaran yang BERBEDA. Sebaran antar putaran harus dihitung sendiri dari
 * JSON, dan di lengan 1 pertama memang harus kuhitung manual dengan Python:
 * putaran 1 = 33%, putaran 2 = 50% → 17 poin. Alat ukur yang tidak bisa
 * menjawab pertanyaan gerbangnya sendiri belum selesai dibangun.
 *
 * DUA KEPUTUSAN YANG SENGAJA:
 *
 * 1. **Persentase, bukan cacah.** ALASAN VERSI PERTAMA SALAH FAKTA dan
 *    dikoreksi di ronde 3: ia berbunyi "putaran yang mati di tengah menyisakan
 *    giliran lebih sedikit". Ditelusuri ke produsennya, itu tidak bisa terjadi
 *    — `satuPutaran()` MELEMPAR saat satu giliran gagal, dan pemanggilnya
 *    membuang SELURUH putaran itu sebelum `putaran.push`. Yang berkurang
 *    adalah JUMLAH PUTARAN (ditangani `cukupPutaran >= 3`), bukan panjangnya.
 *    Preseden koreksi A9 di berkas ini: kalimat yang menyatakan fakta salah
 *    tentang alatnya sendiri lebih buruk daripada diam.
 *
 *    Alasan yang BENAR: ambang "5 poin" harus punya arti yang sama lintas
 *    UKURAN KORPUS — 6 giliran asap, 51 kasus L4a, 196 kasus korpus penuh.
 *    Cacah tidak bisa memberikan itu (2 pelanggaran dari 6 dan dari 196 adalah
 *    dua dunia berbeda); rasio bisa. Itu pula yang membuat pagar
 *    `MIN_GILIRAN` di bawah ini perlu ada.
 *
 * 2. **Kurang dari 3 putaran = TIDAK BISA DINILAI, dan itu BUKAN lulus.**
 *    Ini persis keadaan lengan 1 pertama: 2 dari 3 putaran berhasil karena 429.
 *    Dua putaran yang kebetulan mirip tidak boleh terbaca sebagai gerbang lewat
 *    — gerbangnya sendiri menyebut angka 3, dan ketiadaan data tidak pernah
 *    boleh jatuh ke ✔.
 */
export function sebaranPerPutaran(putaran, kelas, opsi = {}) {
  const { sah = true, nomor = null } = opsi;
  const daftar = putaran ?? [];
  const daftarKelas = Array.isArray(kelas) ? kelas : [];

  // C9: `kelas` dulu tidak dijaga sementara `putaran` dijaga — asimetri yang
  // membuat alat ukur CRASH alih-alih memberi vonis (preseden NB-1).
  // C4/C5: daftar kelas KOSONG bukan "semua kelas bersih", ia "tidak ada yang
  // diperiksa" — dan ketiadaan pemeriksaan tidak pernah boleh jatuh ke ✔.
  const takBisaDinilai = [];
  if (!daftarKelas.length) takBisaDinilai.push('daftar kelas kegagalan KOSONG — tidak ada yang diperiksa');

  // C1: putaran KOSONG dulu dibaca "0% pelanggaran" lewat `p.length ? … : 0`,
  // sehingga tiga putaran nol giliran memberi `✔ GERBANG F6 LEWAT`. Nol
  // pengukuran diubah jadi angka nol yang sah — kelas kesalahan yang berkas ini
  // sudah dua kali perbaiki di tempat lain, dan tetap kuulangi di sini.
  const kosong = daftar.filter((p) => !p?.length).length;
  if (kosong) takBisaDinilai.push(`${kosong} putaran berisi NOL giliran — tidak ada yang diukur`);

  const giliranPerPutaran = daftar.map((p) => p?.length ?? 0);
  const adaGiliran = daftar.some((p) => p?.length);
  const perKelas = daftar.length && daftarKelas.length
    ? daftarKelas.map((k) => {
        const cacah = daftar.map((p) => (p ?? []).filter((g) => g?.[k]).length);
        // >>> RONDE-3 (2026-08-11) — `sebaran` sekarang RASIO EKSAK, bukan
        // selisih persentase yang sudah dibulatkan.
        //
        // Pembulatan-dulu membuat pagar `MIN_GILIRAN = 21` MENGINGKARI
        // perhitungan yang melahirkannya: 1/21 = 4,76% (eksak, di bawah ambang)
        // dibulatkan jadi 5 → gerbang GAGAL. Terukur juga di korpus penuh:
        // 9/196 = 4,59 → dibulatkan 5 → GAGAL, padahal seharusnya lewat.
        // Pencarian menyeluruh N=21..400 menemukan 99.845 pasangan yang eksak
        // < 5 tapi bulat >= 5, dan **NOL** kasus arah sebaliknya — jadi bugnya
        // selalu ke arah TERLALU KETAT: gerbang menuduh alat ukur berisik
        // padahal ia diam. Itu tetap kesalahan: ia mengarahkan perbaikan ke
        // tempat yang tidak rusak.
        //
        // `perPutaran` TETAP bulat — itu untuk mata manusia di tabel.
        // Yang dibulatkan hanya TAMPILAN, tidak pernah VONIS.
        const rasio = daftar.map((p, i) => (p?.length ? (cacah[i] / p.length) * 100 : 0));
        const perPutaran = rasio.map((v) => Math.round(v));
        const min = Math.min(...rasio);
        const maks = Math.max(...rasio);
        // Kelas yang field-nya tidak pernah muncul di SATU pun giliran bukan
        // "nol pelanggaran" — ia TIDAK TERUKUR. `g?.[k]` tak bisa membedakan
        // absen dari `false`, jadi salah ketik nama kelas (atau nama baru di
        // `KELAS_GAGAL` tanpa field di `periksa()`) akan mencetak `0% 0/25`
        // rapi lalu menyumbang ✔ ke gerbang. Drift itu SUDAH pernah terjadi
        // sekali di repo ini (`gerbang_menahan`).
        const terekam = daftar.some((pu) => (pu ?? []).some((g) => g && k in g));
        return { kelas: k, cacah, perPutaran, rasio, min, maks, sebaran: maks - min, terekam };
      })
    : [];
  if (adaGiliran)
    for (const k of perKelas)
      if (!k.terekam)
        takBisaDinilai.push(
          `kelas \`${k.kelas}\` TIDAK PERNAH terekam di data — ia dihitung 0% karena fieldnya absen, bukan karena bersih`,
        );

  const cukupPutaran = daftar.length >= 3;
  if (!cukupPutaran)
    takBisaDinilai.push(`baru ${daftar.length} dari 3 putaran yang dibutuhkan gerbang`);

  // >>> C3 — TEMUAN PALING MENENTUKAN dari audit K23, dan ia menyelamatkan
  // ambangnya dari "diperbaiki" ke arah yang salah.
  //
  // Persentase pada N giliran hanya bisa bernilai kelipatan 100/N. Pada N=6
  // nilainya 0/17/33/50/67/83/100, jadi **sebaran non-nol TERKECIL adalah 16
  // poin** — ambang "< 5" di situ de facto berarti "cacah wajib IDENTIK di
  // semua putaran, atau GAGAL". Ambang 5 tidak punya makna operasional.
  //
  // Auditor menyimpulkan "ambangnya salah". **Penyanggal membalikkannya**, dan
  // menghitung titik baliknya: **N=21**. Di bawah itu gerbangnya biner; di
  // **N=51 (L4a)** langkahnya 1,96 poin sehingga selisih sampai **2 kasus**
  // masih lulus; di **N=196 (korpus penuh)** langkahnya 0,51 poin, toleransi
  // **9 kasus** (9/196 = 4,59 lulus · 10/196 = 5,10 gagal — angka "7" di versi
  // pertama komentar ini salah hitung, dikoreksi ronde 3). Jadi ambang 5 BENAR untuk korpus sasaran — yang keliru adalah
  // MENILAI GERBANGNYA di skenario asap 6 giliran. Menurunkan/menaikkan ambang
  // akan merusak gerbang persis di tempat ia harus bekerja.
  const MIN_GILIRAN = 21;
  // Cacahnya sudah disaring `n > 0`, tapi daftar yang DICETAK dulu tidak:
  // `[put(25), put(25), put(6)]` berbunyi "1 putaran hanya 25/6 giliran",
  // menuduh putaran 25-giliran berada di bawah 21. Alat ukur yang menyebut
  // SEBAB yang salah mengarahkan perbaikan ke tempat yang salah — pelanggaran
  // yang test C1 di berkas uji dibangun khusus untuk mengunci.
  const pendek = giliranPerPutaran.filter((n) => n > 0 && n < MIN_GILIRAN);
  const terlaluPendek = pendek.length;
  if (terlaluPendek)
    takBisaDinilai.push(
      `${terlaluPendek} putaran hanya ${[...new Set(pendek)].join('/')} giliran — di bawah ${MIN_GILIRAN}, ` +
        `ambang 5 poin tidak bermakna (langkah persentase terkecilnya sudah > 5)`,
    );

  const alasan = [];
  for (const k of perKelas)
    if (k.sebaran >= 5)
      alasan.push(
        `${k.kelas}: sebaran ${k.sebaran.toFixed(1)} poin (` +
          k.perPutaran.map((v, i) => `${v}% [${k.cacah[i]}/${giliranPerPutaran[i]}]`).join(' → ') + ')',
      );

  return {
    kelas: perKelas,
    nomor: nomor ?? daftar.map((_, i) => i + 1),
    giliranPerPutaran,
    cukupPutaran,
    bisaDinilai: takBisaDinilai.length === 0,
    takBisaDinilai,
    sahHulu: sah,
    maksSebaran: perKelas.length ? Math.max(...perKelas.map((k) => k.sebaran)) : 0,
    alasan,
    // C2/N3: vonis kesahihan MENANG. Sebaran yang dihitung dari pengukuran
    // terconfound bukan bukti apa pun, jadi F6 TUNDUK padanya — bukan digabung
    // jadi satu boolean (angka sebarannya tetap berguna sebagai diagnosis
    // kebisingan meski tidak sah, dan alasan ketidaksahihan tetap perlu tampil
    // terpisah). Dua angka, satu vonis berjenjang.
    lulus: sah && takBisaDinilai.length === 0 && alasan.length === 0,
  };
}

/** Cetak tabel sebaran + vonis gerbang F6. `opsi.sah` dari `cetakKesahihan`. */
export function cetakSebaran(putaran, kelas, indent = '    ', opsi = {}) {
  const r = sebaranPerPutaran(putaran, kelas, opsi);
  const i = indent;
  if (r.kelas.length) {
    const lebar = Math.max(...r.kelas.map((k) => k.kelas.length), 5);
    // N2/C3: penyebutnya IKUT DICETAK. "17 poin" untuk 1/6 vs 0/6 terbaca
    // seperti 3,4x di atas batas, padahal peristiwanya satu giliran tunggal.
    console.log(`${i}${'kelas'.padEnd(lebar)}  ${r.nomor.map((n) => `put${n}`.padStart(10)).join('')}${'sebaran'.padStart(10)}`);
    for (const k of r.kelas) {
      const sel = k.perPutaran.map((v, n) => `${v}% ${k.cacah[n]}/${r.giliranPerPutaran[n]}`.padStart(10)).join('');
      console.log(`${i}${k.kelas.padEnd(lebar)}  ${sel}${`${k.sebaran.toFixed(1)} poin`.padStart(12)}${k.sebaran >= 5 ? ' ⟵' : ''}`);
    }
    console.log('');
  }

  if (!r.bisaDinilai) {
    console.log(`${i}✖ GERBANG F6 TIDAK BISA DINILAI:`);
    for (const a of r.takBisaDinilai) console.log(`${i}  · ${a}`);
    return r;
  }
  if (!r.sahHulu) {
    // Vonis kesahihan menang. Angka sebaran di atas tetap berguna sebagai
    // diagnosis kebisingan, tapi ia bukan bukti apa-apa soal gerbang.
    console.log(`${i}✖ GERBANG F6 TIDAK BISA DINILAI — pengukurannya sendiri dinyatakan TIDAK SAH di blok atas.`);
    console.log(`${i}  Sebaran di atas tetap berguna sebagai petunjuk kebisingan, bukan sebagai vonis.`);
    return r;
  }
  if (r.lulus) {
    // N1: jumlah putaran DIBACA dari data, bukan ditulis keras "3 putaran" —
    // bawaan `--runs` adalah 5, dan alat yang mengarang angka yang tidak ia
    // ukur adalah persis pelanggaran yang koreksi A9 tutup di berkas ini.
    console.log(`${i}✔ GERBANG F6 LEWAT — ${r.nomor.length} putaran, sebaran tertinggi ${r.maksSebaran.toFixed(1)} poin (< 5).`);
  } else {
    console.log(`${i}✖ GERBANG F6 BELUM LEWAT:`);
    for (const a of r.alasan) console.log(`${i}  · ${a}`);
    console.log(`${i}  Ingat bunyi gerbangnya: sebaran lebar berarti ALAT UKURNYA yang belum sah,`);
    console.log(`${i}  bukan botnya. Telusuri dulu apakah tiap hit memang pelanggaran sungguhan.`);
  }
  return r;
}


/**
 * >>> RONDE 3 audit K23 (2026-08-11): daftar kelas untuk tabel `--bandingkan`.
 *
 * Dulu `Object.keys(data[0].ringkasan.hit)` — daftar diambil dari berkas
 * PERTAMA saja. Terukur di dua arah, dan dua-duanya buruk:
 *   · berkas lama (5 kelas) di kolom kiri → baris `gerbang_menahan` HILANG
 *     total dari tabel, lalu tetap ditutup `✔ Semua kolom sah`;
 *   · berkas baru (6 kelas) di kolom kiri → sel kanan tercetak `undefined/72`,
 *     yang terlihat seperti data.
 * Peringatan "kelas hanya ada di SATU berkas" memang ada, tapi jauh DI BAWAH
 * tabel yang sudah terlanjur dibaca. Ini cacat A3 yang sama dengan yang sudah
 * ditutup di `pasangkanPerKasus`, masih hidup satu blok di atasnya.
 *
 * Dipindah ke sini — bukan dibiarkan di `replay.mjs` — karena `replay.mjs`
 * menjalankan `preflight()` saat diimpor, sehingga apa pun di dalamnya tidak
 * bisa diuji. Itu persis alasan berkas ini dilahirkan.
 */
export function kelasGabungan(data) {
  const urut = [];
  for (const d of data ?? [])
    for (const k of Object.keys(d?.ringkasan?.hit ?? {})) if (!urut.includes(k)) urut.push(k);
  return urut;
}

/** Sel tabel untuk kelas `k` di berkas `d`. Kelas yang absen ditandai, bukan `undefined`. */
export function selHit(d, k) {
  const hit = d?.ringkasan?.hit ?? {};
  if (!(k in hit)) return 'tidak diukur';
  return `${hit[k]}/${d?.ringkasan?.giliranTotal ?? 0}`;
}
