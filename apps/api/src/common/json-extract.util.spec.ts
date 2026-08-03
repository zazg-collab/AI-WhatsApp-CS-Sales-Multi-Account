import { extractFirstJson, parseFirstJson } from './json-extract.util';

/**
 * >>> ANGGA — regresi insiden 2026-08-03.
 *
 * Seorang admin melihat kotak DRAFT berisi keluaran model mentah. Penyebabnya
 * berlapis dua; ini menjaga lapisan pertamanya: ekstraksi JSON.
 *
 * Fixture di bawah disalin PERSIS dari layar Bossfren — bukan karangan. Model
 * mengembalikan JSON yang benar, lalu menempelkan tag `</sai>` dan salinan
 * kedua jawaban yang sama. Cara lama (kurung buka pertama → kurung tutup
 * TERAKHIR) menelan semuanya dan `JSON.parse` gagal, padahal jawaban yang benar
 * sudah lengkap di bagian pertama.
 */
const KELUARAN_MODEL_ASLI =
  '{"segments":[{"menjawab":1,"balasan":"Maaf kak, saya perlu konfirmasi dulu. ' +
  'Mamuju Utara dan Mamuju itu berbeda lokasi. Kamu rumah di Mamuju Utara, Sulawesi Barat, ya?"},' +
  '{"menjawab":2,"balasan":"Setelah kamu konfirmasi alamatnya, saya bisa cek ongkirnya untuk kamu, kak."}]}' +
  '</sai>' +
  '{{"segments":[{"menjawab":1,"balasan":"Maaf kak, saya perlu konfirmasi dulu. ' +
  'Mamuju Utara dan Mamuju itu berbeda lokasi. Kamu rumah di Mamuju Utara, Sulawesi Barat, ya?"},' +
  '{"menjawab":2,"balasan":"Setelah kamu konfirmasi alamatnya, saya bisa cek ongkirnya untuk kamu, kak."}]}}';

describe('ANGGA — extractFirstJson', () => {
  it('insiden asli: mengambil objek pertama, membuang </sai> + salinan keduanya', () => {
    const parsed = parseFirstJson<{ segments: Array<{ menjawab: number; balasan: string }> }>(
      KELUARAN_MODEL_ASLI,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.segments).toHaveLength(2);
    expect(parsed!.segments[0].balasan).toContain('Mamuju Utara dan Mamuju itu berbeda lokasi');
    expect(parsed!.segments[1].menjawab).toBe(2);
    // Yang menyelamatkan: jawaban yang benar TIDAK ikut terbuang.
    expect(JSON.stringify(parsed)).not.toContain('sai');
  });

  it('cara lama akan gagal untuk fixture ini — buktinya di sini', () => {
    const caraLama = KELUARAN_MODEL_ASLI.slice(
      KELUARAN_MODEL_ASLI.indexOf('{'),
      KELUARAN_MODEL_ASLI.lastIndexOf('}') + 1,
    );
    expect(() => JSON.parse(caraLama)).toThrow();
    // Cara baru, teks yang sama persis:
    expect(() => JSON.parse(extractFirstJson(KELUARAN_MODEL_ASLI)!)).not.toThrow();
  });

  it('prosa sebelum & sesudah JSON diabaikan', () => {
    expect(extractFirstJson('Tentu kak! {"a":1} semoga membantu ya')).toBe('{"a":1}');
  });

  it('blok berpagar diutamakan', () => {
    expect(extractFirstJson('bla ```json\n{"a":1}\n``` bla')).toBe('{"a":1}');
  });

  it('kurung DI DALAM string tidak dihitung', () => {
    const raw = '{"balasan":"harganya {belum} pasti kak"} sisa';
    expect(JSON.parse(extractFirstJson(raw)!)).toEqual({ balasan: 'harganya {belum} pasti kak' });
  });

  it('tanda kutip yang di-escape tidak menutup string terlalu cepat', () => {
    const raw = '{"balasan":"kata \\"golok\\" itu {ini}"} ekor';
    expect(JSON.parse(extractFirstJson(raw)!)).toEqual({ balasan: 'kata "golok" itu {ini}' });
  });

  it('objek bersarang dihitung sampai kurung terluar tertutup', () => {
    expect(extractFirstJson('{"a":{"b":{"c":1}}} lalu {"x":2}')).toBe('{"a":{"b":{"c":1}}}');
  });

  it('keluaran terpotong (tidak pernah tertutup) → null, bukan tebakan', () => {
    expect(extractFirstJson('{"segments":[{"balasan":"kepotong')).toBeNull();
    expect(parseFirstJson('{"segments":[{"balasan":"kepotong')).toBeNull();
  });

  it('tidak ada JSON sama sekali → null', () => {
    expect(extractFirstJson('maaf kak, saya tidak paham')).toBeNull();
    expect(extractFirstJson('')).toBeNull();
  });

  it('parameter expected memaksa bentuk yang diminta (dipakai modul Learning)', () => {
    const raw = '{"pembungkus":1} lalu daftarnya [{"a":1},{"b":2}]';
    expect(extractFirstJson(raw, '[')).toBe('[{"a":1},{"b":2}]');
    expect(extractFirstJson(raw, '{')).toBe('{"pembungkus":1}');
  });

  it('array di tingkat atas ditangani', () => {
    expect(extractFirstJson('[1,2,3] ekor')).toBe('[1,2,3]');
  });
});
