/**
 * >>> BARU-1 langkah 1 — INSTRUMENTASI MURNI (2026-08-11, cowork).
 *
 * Pemetaan `DebugSnapshot` → `jejak` yang disimpan tiap giliran oleh
 * `replay.mjs`. Dulu blok objek inline di dalam `satuPutaran()`; dipisah ke
 * sini karena `replay.mjs` punya top-level `await` + `process.exit()`, jadi
 * meng-import-nya dari test berarti MENJALANKAN alat ukurnya. Dipisah = bisa
 * dipatok test, dan pemetaan inilah yang seluruh keputusan BARU-1 bergantung
 * padanya. (Jalankan: `node --test tools/eval/jejak.test.mjs`. Bentuk
 * DIREKTORI `node --test tools/eval/` TIDAK jalan di Node 22 — ia gagal
 * seperti test merah; lihat utang tercatat.)
 *
 * ⚠️ Vonis `metode_sebelum_total` SENGAJA TIDAK DISENTUH di irisan ini. Berkas
 * ini hanya MENCATAT; ia tidak menghakimi apa pun.
 *
 * ⚠️⚠️ SATU BATAS YANG WAJIB DIINGAT SAAT MEMBACA BERKAS HASIL (ronde 2 audit
 * K23): seluruh isi `jejak` adalah keadaan **SESUDAH** giliran dijawab, bukan
 * sebelum. `DebugInfoCollector.collectDebugInfo()` menerima `aiReplyText` dan
 * `executedTools` yang SUDAH jadi, lalu membaca cache yang HIDUP. Jadi giliran
 * yang kutipannya baru LAHIR di giliran itu sendiri tidak bisa dibedakan dari
 * giliran yang sudah membawa kutipan sejak sebelumnya — kecuali lewat
 * `toolDipakai` di bawah. Arah biasnya MENENANGKAN, jadi jangan pernah
 * menyimpulkan "totalnya sudah tersedia saat model menyusun kalimat ini" cuma
 * dari `tokens` yang terisi.
 *
 * Kenapa tiga field baru ini, dan kenapa BUKAN yang lain — dibedah dari 26
 * giliran nyata yang sudah tersimpan (`lengan1.json`, `recon-deepseek.json`,
 * `hasil-head-v5.json`), bukan ditebak:
 *
 * 1. `tokens` — ISINYA, bukan keberadaannya. Rantainya sudah diverifikasi
 *    sampai hulu (ronde 2): `ShippingService.debugState()` memulangkan
 *    `tokens: quote ? buildPriceTokens(quote) : {}`, dan `buildPriceTokens`
 *    selalu memuat minimal `kota_tujuan`; sementara `snap.ongkir` diisi
 *    HANYA kalau `quote` ada (`debug-info.collector.ts:70-76`). Jadi
 *    `tokens` tidak kosong ⟺ `adaOngkir` — keberadaannya nol informasi baru.
 *    Yang belum pernah terukur adalah NILAI di dalamnya (`total_transfer`,
 *    `total_cod`, `blok_total`, `subtotal_barang`, …). Itu satu-satunya jalan
 *    menanyakan pertanyaan yang sebenarnya — "apakah angka total yang DIHITUNG
 *    SISTEM SENDIRI pernah sampai ke pelanggan" — tanpa jatuh ke heuristik teks
 *    yang menghakimi heuristik teks.
 *
 * 2. `funnelStep` MENTAH. `funnelMode` meruntuhkan seluruh langkah pra-total
 *    jadi `'normal'`; di `lengan1` ia bernilai `normal` di 12 DARI 12 giliran,
 *    jadi sumbangannya terhadap vonis persis NOL. Langkah mentahnya sudah ada
 *    di `DebugSnapshot.funnelStep` sejak 2026-08-10 dan tidak pernah sekali pun
 *    disimpan ke sini. Ia juga tidak bisa dipulihkan dari `status`, karena
 *    `status` ditimpa `'tool_executed'` tiap kali ada tool yang jalan.
 *
 * 3. `toolDipakai` — NAMA tool yang berjalan DI giliran ini (bukan argumen,
 *    bukan hasil: itu akan menggandakan ukuran berkas tanpa menjawab apa pun).
 *    Ditambahkan karena batas "pasca-giliran" di atas: tanpa ini, dua keadaan
 *    yang justru jadi inti perkara — kutipan LAHIR di giliran ini (lengan1
 *    p2g3) versus kutipan sudah ada tapi bot tetap bilang "cek dulu ke admin"
 *    (p1g4, p2g4) — terlihat identik di berkas hasil.
 *
 * Yang SENGAJA TIDAK dilakukan: mengganti rumus vonisnya. Arah yang tercatat di
 * handover ("pindahkan keputusan ke keberadaan kutipan") sudah TERBANTAH oleh
 * data yang sama — ia menyembuhkan 1 false positive (lengan1 p2g3: total memang
 * tersodor di balasan yang sama) tapi melahirkan 2 false negative (lengan1 p1g4
 * & p2g4: kutipan ADA di cache, bot bilang "cek dulu ke admin", total tidak
 * pernah disodorkan — pelanggaran ASLI). Menuliskannya sekarang berarti
 * menambal di atas dugaan; angkanya dulu. <<<
 */

/**
 * @param {object|null|undefined} debug — `reply.debugInfo` apa adanya.
 * @returns jejak satu giliran.
 */
export function bangunJejak(debug) {
  return {
    funnelMode: debug?.funnelMode ?? null,
    adaOngkir: Boolean(debug?.ongkir),
    jumlahItem: (debug?.items ?? []).length,
    gateWarnings: debug?.gateWarnings ?? [],
    // >>> F6 Bagian 1 (2026-08-11): `undefined` berarti biner yang diukur BELUM
    // punya alat ukur ini — dibedakan dari `{panggilan:0}` yang berarti giliran
    // ini memang tidak menembak LLM. Yang membaca beda itu `ringkasPenyedia`
    // (`kesahihan.mjs`): absen/cacat → `giliranTanpaAlat`, `panggilan:0` →
    // `giliranTanpaLlm`.
    //
    // >>> KOREKSI ronde 2 audit K23: versi pertama komentar ini menulis "jadi
    // jangan diruntuhkan jadi `null`" — SALAH, dan sekarang dicabut. Diuji:
    // `kesahihan.mjs` memakai `if (!r)`, jadi `undefined` dan `null` jatuh ke
    // ember yang SAMA PERSIS; lagipula `JSON.stringify` membuang kunci
    // `undefined` sepenuhnya saat `--out` ditulis. Yang benar-benar dijaga
    // adalah beda "absen" vs "`panggilan:0`", dan itu bertahan tanpa syarat
    // soal `null`. Klaim yang tidak terbukti dicabut, bukan ditambal. <<<
    ai: debug?.aiRingkas,
    // `?? null` (dua nilai), SENGAJA berbeda dari `tokens` di bawah (tiga
    // nilai), dan alasannya bukan kelalaian: di record yang SAMA,
    // `tokens === null` sudah menandai "giliran ini tanpa `debugInfo`". Sebab
    // hilangnya `funnelStep` karenanya selalu bisa dipilah dari tetangganya —
    // `tokens null` ⇒ tidak ada snapshot; `tokens non-null` + `funnelStep null`
    // ⇒ snapshot ada, funnel-nya memang tidak sedang menunggu langkah bernama.
    funnelStep: debug?.funnelStep ?? null,
    // Nama saja. Argumen & hasil sengaja dibuang: yang ditanya cuma "apakah
    // keadaan order BERUBAH di giliran ini", bukan isinya.
    //
    // >>> KOREKSI SEBELUM COMMIT (2026-08-11, terukur di putaran ukur pertama):
    // versi pertama memetakan `toolCalls` yang absen jadi `[]`. Itu MENGARANG
    // fakta. Terukur: `debug.toolCalls` **SELALU** `undefined` untuk provider
    // nyata — `test-harness.controller.ts:174` hanya mengisi `executedTools` di
    // cabang `'mock'`; di cabang provider sungguhan variabelnya tidak pernah
    // ditugaskan, karena panggilan tool hidup di dalam `ai.service.ts` dan
    // tidak pernah naik ke `ReplyOutcome`. Jadi `[]` akan terbaca "nol tool
    // berjalan di giliran ini" padahal yang benar "tidak ada yang merekam" —
    // persis kelas kesalahan yang `tokens: null` vs `{}` dibangun untuk
    // mencegah, dan ia lolos ke berkas hasil putaran pertama.
    //   `null` = tidak direkam (jalur provider nyata hari ini: SELALU ini)
    //   `[]`   = direkam, dan memang nol tool berjalan
    // >>> IRISAN A (2026-08-11): sumbernya sekarang DUA, dengan urutan yang
    // disengaja — dan bukan karena duplikasi, melainkan karena dua provider
    // memang mengisi tempat yang berbeda:
    //   1. `debug.toolCalls` — jalur `'mock'`. Bentuknya paling kaya
    //      (`{name, args, result}`) dan cuma jalur itu yang mengisinya.
    //   2. `debug.aiRingkas.toolDijalankan` — jalur provider NYATA. Dicatat di
    //      `ai.service.ts` lewat AsyncLocalStorage yang sama dengan pencatat
    //      penyedia, ditempelkan ke panggilan LLM yang memintanya, TANPA dedup
    //      (pengulangan itu temuannya sendiri — utang A2).
    // Didahulukan #1 supaya jalur mock tidak berubah artinya: di sana
    // `aiRingkas.toolDijalankan` akan `[]` (nol panggilan LLM) padahal
    // toolnya memang berjalan.
    //   `null` = tidak direkam sama sekali (biner lama / tanpa `debugInfo`)
    //   `[]`   = direkam, dan memang nol tool berjalan
    // `Array.isArray` di KEDUA cabang, bukan cuma yang kedua (koreksi ronde 3):
    // berkas ini mem-parse JSON dari batas luar (`r.json()`), jadi bentuk
    // wadahnya tidak dijamin siapa pun. Test "tahan bentuk cacat" di bawah
    // sudah menjaga cacat pada ELEMEN; asimetrinya ada di WADAH. Ini penjaga
    // batas parsing — BUKAN klaim bahwa bentuk itu muncul di produksi.
    toolDipakai:
      (Array.isArray(debug?.toolCalls) ? debug.toolCalls.map((t) => t?.name ?? '?') : null) ??
      (Array.isArray(debug?.aiRingkas?.toolDijalankan) ? [...debug.aiRingkas.toolDijalankan] : null),
    // TIGA nilai, dan bedanya menentukan cara membaca berkas hasil:
    //   `null` = giliran ini tidak punya `debugInfo` sama sekali
    //   `{}`   = ada snapshot, TIDAK ada kutipan hidup
    //   berisi = kutipan hidup; nilainya yang dicari.
    //
    // >>> BATAS JUJUR (ronde 2 audit K23): `{}` TIDAK selalu berarti "kutipan
    // belum lahir". Ia juga muncul saat panel debug tidak sempat membaca sama
    // sekali — provider `mock` (yang menandai dirinya lewat `status:'mock'`),
    // `conversationId` kosong, `ShippingService` tidak ter-inject, atau
    // `debugState()` melempar dan `catch` di collector menelannya. Di keempat
    // jalur itu SELURUH panel ikut kosong (`adaOngkir:false`, `items:[]`,
    // `funnelStep:null`), jadi tanda tangannya keras dan bisa dikenali — tapi
    // jangan pernah membaca `{}` sebagai pernyataan tentang keadaan order tanpa
    // memeriksa tetangganya dulu. Sensus + kawat sandung invarian di
    // `replay.mjs` mencetak persis ini tiap putaran. <<<
    //
    // Disalin satu lapis. Bukan karena bahaya aliasing — `debug` di sini objek
    // segar hasil `r.json()` per respons HTTP, tidak dibagi dengan siapa pun,
    // dan analogi `fCtx.items` (proses SERVER) yang sempat ditulis di versi
    // pertama sudah DICABUT karena tidak berlaku di sini. Salinannya murah dan
    // dipertahankan supaya `jejak` tidak pernah berbagi identitas dengan
    // snapshot; nilainya `string` semua (`Record<string,string>`), jadi satu
    // lapis memang kedalaman yang benar.
    tokens: debug == null ? null : { ...(debug.tokens ?? {}) },
  };
}
