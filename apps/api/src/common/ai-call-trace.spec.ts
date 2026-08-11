import { bukaJejakAi, denganJejakAi, catatPanggilanAi, catatToolDijalankan, ringkasJejakAi, type JejakPanggilanAi } from './ai-call-trace';

const contoh = (over: Partial<JejakPanggilanAi> = {}): JejakPanggilanAi => ({
  modelDiminta: 'm',
  modelDilayani: null,
  penyedia: null,
  idGenerasi: null,
  promptTokens: null,
  completionTokens: null,
  finishReason: null,
  percobaan: 1,
  ms: 0,
  temperature: 0.6,
  seed: null,
  lenganEval: { temperature: null, seed: null, kunciRute: false, pinPenyedia: null },
  payloadMintaKunciRute: false,
  galat: null,
  ...over,
});

describe('jejak panggilan AI', () => {
  it('catatPanggilanAi DI LUAR penampung adalah no-op SENYAP', () => {
    // Invarian, bukan dugaan: produksi memanggil pencatat ini di setiap giliran
    // TANPA penampung terbuka. Kalau ia melempar, alat ukur mematikan bot —
    // persis kelas kesalahan `funnel_gerbang_total` (tiruan metrics parsial →
    // TypeError → grounding jadi string kosong tanpa satu baris error).
    expect(() => catatPanggilanAi(contoh())).not.toThrow();
  });

  it('mengumpulkan panggilan sesuai URUTAN di dalam satu penampung', async () => {
    const jejak = bukaJejakAi();
    await denganJejakAi(jejak, async () => {
      catatPanggilanAi(contoh({ penyedia: 'DeepSeek' }));
      await Promise.resolve();
      catatPanggilanAi(contoh({ penyedia: 'Novita' }));
    });
    expect(jejak.map((e) => e.penyedia)).toEqual(['DeepSeek', 'Novita']);
  });

  it('jejak TETAP terisi ketika fn melempar, dan galatnya diteruskan APA ADANYA', async () => {
    // Giliran yang GAGAL justru yang paling butuh data penyedia — kalau jejaknya
    // ikut hilang bersama exception, mode kegagalan yang paling ingin kita ukur
    // adalah satu-satunya yang tidak pernah terukur.
    const jejak = bukaJejakAi();
    const meledak = new Error('timeout');
    await expect(
      denganJejakAi(jejak, async () => {
        catatPanggilanAi(contoh({ penyedia: 'DeepSeek', galat: 'TimeoutError' }));
        throw meledak;
      }),
    ).rejects.toBe(meledak);
    expect(jejak).toHaveLength(1);
    expect(jejak[0].galat).toBe('TimeoutError');
  });

  it('dua penampung yang berjalan BERSAMAAN tidak saling bocor', async () => {
    const a = bukaJejakAi();
    const b = bukaJejakAi();
    await Promise.all([
      denganJejakAi(a, async () => {
        await new Promise((r) => setTimeout(r, 5));
        catatPanggilanAi(contoh({ penyedia: 'A' }));
      }),
      denganJejakAi(b, async () => {
        catatPanggilanAi(contoh({ penyedia: 'B' }));
      }),
    ]);
    expect(a.map((e) => e.penyedia)).toEqual(['A']);
    expect(b.map((e) => e.penyedia)).toEqual(['B']);
  });
});

/**
 * >>> ANGGA — F6 Bagian 1 (2026-08-11): blok ini lahir dari MUTATION TESTING,
 * bukan dari perencanaan. Dua mutasi LOLOS seluruh suite karena `ringkasJejakAi`
 * tidak punya satu pun test — dan dua-duanya membuat alat ukur berbohong ke
 * arah yang paling berbahaya, yaitu "angkamu sah kok".
 * <<<
 */
describe('ringkasJejakAi', () => {
  const e = (over: Partial<JejakPanggilanAi> = {}) => contoh(over);

  it('payloadMintaKunciRute hanya benar kalau SEMUA panggilan terkunci — bukan sebagian', () => {
    // Mutasi M8 (`.every` → `.some`) lolos tanpa test ini. Akibatnya nyata:
    // giliran dengan 4 panggilan yang cuma 1 terkunci akan dilaporkan
    // "rute terkunci", dan `replay.mjs` mencetak vonis "✔ layak dibandingkan"
    // untuk pengukuran yang sebenarnya berpindah penyedia di tengah jalan.
    expect(ringkasJejakAi([e({ payloadMintaKunciRute: true }), e({ payloadMintaKunciRute: true })]).payloadMintaKunciRute).toBe(true);
    expect(ringkasJejakAi([e({ payloadMintaKunciRute: true }), e({ payloadMintaKunciRute: false })]).payloadMintaKunciRute).toBe(false);
  });

  it('jejak KOSONG bukan berarti terkunci', () => {
    expect(ringkasJejakAi([]).payloadMintaKunciRute).toBe(false);
  });

  it('penyediaTidakDilaporkan TIDAK menghitung percobaan yang gagal', () => {
    // Mutasi M9 lolos tanpa test ini. Percobaan gagal memang tidak punya badan
    // respons, jadi memasukkannya menggelembungkan "OpenRouter tidak melaporkan
    // penyedia" — angka menakutkan yang mengarahkan perbaikan ke tempat salah,
    // padahal yang terjadi cuma provider-nya sedang tumbang.
    const r = ringkasJejakAi([
      e({ galat: 'HTTP 503: x' }),
      e({ penyedia: null }),
      e({ penyedia: 'DeepSeek' }),
    ]);
    expect(r.penyediaTidakDilaporkan).toBe(1);
    expect(r.gagal).toBe(1);
    expect(r.panggilan).toBe(3);
  });

  it('penyedia di-dedup dan yang null dibuang, promptTokens dijumlahkan', () => {
    const r = ringkasJejakAi([
      e({ penyedia: 'DeepSeek', promptTokens: 100 }),
      e({ penyedia: 'DeepSeek', promptTokens: 250 }),
      e({ penyedia: null, promptTokens: null }),
    ]);
    expect(r.penyedia).toEqual(['DeepSeek']);
    expect(r.promptTokens).toBe(350);
  });
});

/**
 * >>> ANGGA — KOREKSI AUDIT K23 (2026-08-11, temuan A12): `konfigurasi` adalah
 * SATU-SATUNYA sandaran penjaga lintas-lengan di `tools/eval/kesahihan.mjs`,
 * dan sebelum blok ini ia tidak punya satu pun assertion di sisi PRODUSEN —
 * `kesahihan.test.mjs` hanya menyuapkan objek buatan tangan, jadi kontrak
 * produsen↔konsumen tidak pernah teruji ujung-ke-ujung. Regresi apa pun di
 * sini akan mematikan penjaga itu SECARA SENYAP sementara seluruh suite tetap
 * hijau — kelas kegagalan yang sama persis dengan dua mutasi yang lolos di
 * putaran pertama. <<<
 */
describe('ringkasJejakAi.konfigurasi — identitas lengan', () => {
  const dengan = (l: JejakPanggilanAi['lenganEval']) => contoh({ lenganEval: l });
  const L0 = { temperature: 0, seed: 42, kunciRute: true, pinPenyedia: ['DeepInfra'] };

  it('lengan seragam diteruskan apa adanya', () => {
    expect(ringkasJejakAi([dengan(L0), dengan({ ...L0 })]).konfigurasi.lengan).toEqual(L0);
  });

  it('lengan TIDAK seragam → null (tidak diketahui), bukan diambil yang pertama', () => {
    const r = ringkasJejakAi([dengan(L0), dengan({ ...L0, temperature: 0.6 })]);
    expect(r.konfigurasi.lengan).toBeNull();
  });

  it('SEBAGIAN entri tanpa lengan → null; identitas TIDAK boleh disimpulkan dari sampel parsial', () => {
    // Ditemukan MUTATION TESTING (mutasi P2 lolos seluruh suite). Bentuknya
    // mungkin lewat data lama yang di-deserialisasi dari berkas hasil biner
    // sebelumnya. Kalau sebagian entri saja yang punya lengan, menyimpulkan
    // identitas dari yang ada berarti alat memberi vonis PERCAYA DIRI atas
    // sampel parsial — dan konsekuensinya meloloskan perbandingan lintas-lengan,
    // arah kegagalan yang sama dengan cacat A2.
    const tanpa = { ...contoh() } as any;
    delete tanpa.lenganEval;
    expect(ringkasJejakAi([dengan(L0), tanpa]).konfigurasi.lengan).toBeNull();
  });

  it('pin penyedia BERBEDA → lengan tidak seragam → null', () => {
    // Tanpa ini, dua berkas hasil yang di-pin ke penyedia BERBEDA akan lolos
    // sebagai "selengan" dan selisih antar keduanya terbaca sebagai selisih
    // kode — padahal itu selisih penyedia, confound yang justru sedang diberantas.
    const r = ringkasJejakAi([dengan(L0), dengan({ ...L0, pinPenyedia: ['StreamLake'] })]);
    expect(r.konfigurasi.lengan).toBeNull();
  });

  it('jejak kosong → null, BUKAN objek kosong yang bisa dianggap "sama"', () => {
    // Ini jalur cacat A2: dua berkas tanpa data dulu sama-sama menghasilkan
    // himpunan kosong dan lolos sebagai "lengan sama".
    expect(ringkasJejakAi([]).konfigurasi.lengan).toBeNull();
  });

  it('temperature EFEKTIF tetap direkam, tapi terpisah dari identitas lengan', () => {
    // Cacat NB-5: `extractOrderTarget` bertemperature 0 dipanggil LAZY, jadi
    // temperature efektif satu berkas bisa [0, 0.6] dan berkas lain [0.6]
    // MESKIPUN lengannya sama. Kalau identitas diambil dari sini, dua berkas
    // selengan akan saling ditolak.
    const r = ringkasJejakAi([
      dengan(L0), // temperature efektif 0.6 dari `contoh()`
      { ...dengan(L0), temperature: 0 },
    ]);
    expect(r.konfigurasi.temperatureEfektif).toEqual([0, 0.6]);
    expect(r.konfigurasi.lengan).toEqual(L0);   // identitasnya TIDAK ikut goyah
  });
});

/**
 * >>> BARU-1 irisan A (2026-08-11, cowork): JEJAK TOOL YANG BENAR-BENAR DIJALANKAN.
 *
 * Kenapa ini dibangun, dan kenapa di sini: diagnosis "kutipan hilang di giliran 4"
 * berhenti di satu hipotesis yang tidak bisa dibuktikan MAUPUN dibantah —
 * DUA mesin menulis kunci cache ongkir yang sama tanpa wasit (`finalizeQuote`
 * lewat grounding, dan `llmCalculateShipping` lewat panggilan tool model).
 * Petunjuknya terukur: giliran 5 semestinya memakai snapshot qty 1 (Rp50.000)
 * tapi menghasilkan Rp100.000 (qty 2) — ada penulis kedua di giliran yang sama.
 *
 * Yang menghalangi pembuktian: `DebugSnapshot.toolCalls` SELALU `undefined`
 * untuk provider nyata (`test-harness.controller.ts` hanya mengisi
 * `executedTools` di cabang 'mock'; eksekusi tool hidup di `ai.service.ts` dan
 * tidak pernah naik ke `ReplyOutcome`).
 *
 * Jadi tool dicatat menumpang mekanisme yang SUDAH ADA dan sudah terbukti —
 * `AsyncLocalStorage` yang sama dengan pencatat penyedia — dan ditempelkan ke
 * panggilan LLM yang MEMINTANYA, bukan ke satu daftar datar. Itu lebih kaya
 * (ketahuan tool mana lahir dari panggilan keberapa) dan tidak menambah sumber
 * kebenaran kedua yang bisa drift.
 */
describe('jejak tool yang dijalankan', () => {
  it('ringkasJejakAi mengumpulkan nama tool dari SELURUH panggilan, sesuai urutan', () => {
    // Struktural: `toolDijalankan` belum ada di tipe saat test ini ditulis.
    // Sengaja lewat API publik LAMA supaya RED-nya jatuh di ASSERTION, bukan
    // di compile — RED yang gagal compile tidak membuktikan apa-apa soal
    // perilakunya.
    const a = { ...contoh(), toolDijalankan: ['calculate_shipping'] } as unknown as JejakPanggilanAi;
    const b = { ...contoh(), toolDijalankan: ['send_reply'] } as unknown as JejakPanggilanAi;
    const r = ringkasJejakAi([a, b]) as unknown as { toolDijalankan: string[] };
    expect(r.toolDijalankan).toEqual(['calculate_shipping', 'send_reply']);
  });

  it('panggilan TANPA tool tidak menyumbang apa pun — daftarnya kosong, bukan undefined', () => {
    const r = ringkasJejakAi([contoh(), contoh()]) as unknown as { toolDijalankan: string[] };
    expect(r.toolDijalankan).toEqual([]);
  });

  it('nama yang SAMA dua kali TIDAK di-dedup — pengulangan itu justru temuannya', () => {
    // HEAD cuma punya pembatas putaran, nol deteksi panggilan tool BERULANG
    // dengan argumen sama (utang A2). Kalau ringkasan ini men-dedup, bukti
    // pengulangan itu hilang sebelum sempat dibaca siapa pun.
    const a = {
      ...contoh(),
      toolDijalankan: ['calculate_shipping', 'calculate_shipping'],
    } as unknown as JejakPanggilanAi;
    const r = ringkasJejakAi([a]) as unknown as { toolDijalankan: string[] };
    expect(r.toolDijalankan).toEqual(['calculate_shipping', 'calculate_shipping']);
  });

  it('panggilan lama TANPA field ini tidak bikin ringkasan melempar', () => {
    // Berkas hasil & baris DB lama lahir sebelum field ini ada.
    const r = ringkasJejakAi([contoh()]) as unknown as { toolDijalankan: string[] };
    expect(() => r.toolDijalankan).not.toThrow();
    expect(r.toolDijalankan).toEqual([]);
  });
});

describe('catatToolDijalankan', () => {
  it('DI LUAR penampung adalah no-op SENYAP — alat ukur tidak boleh mematikan bot', () => {
    // Invarian yang sama dengan `catatPanggilanAi`: produksi menjalankan tool
    // di setiap giliran TANPA penampung terbuka.
    expect(() => catatToolDijalankan('calculate_shipping')).not.toThrow();
  });

  it('menempel ke panggilan LLM TERAKHIR, bukan ke daftar datar', () => {
    const sink = bukaJejakAi();
    return denganJejakAi(sink, async () => {
      catatPanggilanAi(contoh({ percobaan: 1 }));
      catatToolDijalankan('search_destinations');
      catatPanggilanAi(contoh({ percobaan: 2 }));
      catatToolDijalankan('calculate_shipping');
      catatToolDijalankan('search_knowledge');
      expect(sink[0].toolDijalankan).toEqual(['search_destinations']);
      expect(sink[1].toolDijalankan).toEqual(['calculate_shipping', 'search_knowledge']);
      expect(ringkasJejakAi(sink).toolDijalankan).toEqual([
        'search_destinations',
        'calculate_shipping',
        'search_knowledge',
      ]);
    });
  });

  it('penampung KOSONG (tool tanpa panggilan tercatat) DIJATUHKAN, bukan dipaksa masuk', () => {
    // Secara alur mustahil — tool lahir dari respons model, dan responsnya
    // dicatat lebih dulu. Kalau sampai terjadi, ia menandakan urutan yang
    // berubah; menaruhnya di entri yang salah lebih buruk daripada hilang.
    const sink = bukaJejakAi();
    return denganJejakAi(sink, async () => {
      expect(() => catatToolDijalankan('calculate_shipping')).not.toThrow();
      expect(sink).toEqual([]);
      expect(ringkasJejakAi(sink).toolDijalankan).toEqual([]);
    });
  });

  it('panggilan yang tidak menjalankan tool tetap `undefined`, bukan array kosong', () => {
    // Membedakan "panggilan ini nol tool" dari "panggilan ini punya tool" di
    // tingkat ENTRI. Diruntuhkan jadi kosong hanya di tingkat RINGKASAN.
    const sink = bukaJejakAi();
    return denganJejakAi(sink, async () => {
      catatPanggilanAi(contoh());
      expect(sink[0].toolDijalankan).toBeUndefined();
      expect(ringkasJejakAi(sink).toolDijalankan).toEqual([]);
    });
  });
});
