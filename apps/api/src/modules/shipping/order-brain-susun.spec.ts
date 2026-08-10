import { susunBalasan, normFunnel } from './order-brain';

/**
 * >>> ANGGA — F4 (2026-08-09, cowork). `susunBalasan` menggantikan DUA gerbang
 * yang dulu MENAHAN draft (`funnel_dilanggar` kalimat-hilang dan
 * `kalimat_dobel`) dengan perbaikan deterministik. Test ini menjaga tiga janji
 * yang membuat penggantian itu aman:
 *   1. jalur normal hari ini = no-op BYTE PER BYTE (kalau tidak, keluaran yang
 *      selama ini sudah benar ikut berubah tanpa ada yang jadi lebih benar);
 *   2. kalimat wajib SELALU ada tepat sekali sesudah penyusunan;
 *   3. potongannya tidak meninggalkan sampah tanda baca/emoji.
 */
describe('order-brain — susunBalasan (Reply Contract F4)', () => {
  const WAJIB = 'Produknya mau yang mana kak? 😊';

  it('no-op byte-per-byte kalau prosa sudah menutup dengan kalimat wajib', () => {
    const prosa = 'Ongkir ke Mataram Rp50.000 ya kak.\n\nProduknya mau yang mana kak? 😊';
    const h = susunBalasan(prosa, WAJIB);
    expect(h.text).toBe(prosa);
    expect(h.disisipkan).toBe(false);
    expect(h.salinanDibuang).toBe(0);
  });

  it('no-op walau emoji/tanda baca penutup beda — pembandingnya ternormalisasi', () => {
    const prosa = 'Siap kak.\n\nProduknya mau yang mana kak?';
    const h = susunBalasan(prosa, WAJIB);
    expect(h.text).toBe(prosa);
    expect(h.disisipkan).toBe(false);
  });

  it('kalimat hilang → dipasang sistem di akhir', () => {
    const h = susunBalasan('Ongkir ke Mataram Rp50.000 ya kak.', WAJIB);
    expect(h.disisipkan).toBe(true);
    expect(h.salinanDibuang).toBe(0);
    expect(h.text).toBe('Ongkir ke Mataram Rp50.000 ya kak.\n\nProduknya mau yang mana kak? 😊');
  });

  it('kalimat DOBEL → semua salinan dibuang, ditempel sekali', () => {
    const prosa =
      'Produknya mau yang mana kak? Ongkirnya Rp50.000.\n\nProduknya mau yang mana kak? 😊';
    const h = susunBalasan(prosa, WAJIB);
    expect(h.disisipkan).toBe(true);
    expect(h.salinanDibuang).toBe(2);
    const norm = normFunnel(h.text);
    expect(norm.split(normFunnel(WAJIB)).length - 1).toBe(1);
    expect(h.text.endsWith(WAJIB)).toBe(true);
  });

  it('kalimat nyempil di TENGAH → dipindah ke akhir, tanpa sampah tanda baca', () => {
    const prosa = 'Halo kak. Produknya mau yang mana kak? 😊 Terima kasih.';
    const h = susunBalasan(prosa, WAJIB);
    expect(h.disisipkan).toBe(true);
    expect(h.text).toBe('Halo kak. Terima kasih.\n\nProduknya mau yang mana kak? 😊');
  });

  it('prosa yang ISINYA cuma kalimat wajib tetap satu kalimat, tanpa baris kosong menganga', () => {
    const h = susunBalasan('  Produknya mau yang mana kak? 😊  ', WAJIB);
    // sudah "berakhir dengan" kalimatnya → no-op, spasi pinggir dibiarkan
    expect(h.disisipkan).toBe(false);
    expect(normFunnel(h.text)).toBe(normFunnel(WAJIB));
  });

  describe('tempel: false — segmen burst yang bukan terakhir', () => {
    it('membuang salinan kalimat wajib tanpa memasangnya', () => {
      const h = susunBalasan('Stoknya ada kak. Produknya mau yang mana kak? 😊', WAJIB, { tempel: false });
      expect(h.disisipkan).toBe(false);
      expect(h.salinanDibuang).toBe(1);
      expect(h.text).toBe('Stoknya ada kak.');
    });

    it('no-op kalau memang tidak ada salinannya', () => {
      const h = susunBalasan('Stoknya ada kak.', WAJIB, { tempel: false });
      expect(h).toEqual({ text: 'Stoknya ada kak.', disisipkan: false, salinanDibuang: 0 });
    });

    it('segmen yang ISINYA cuma kalimat wajib jadi kosong (nanti dibuang pemanggil)', () => {
      expect(susunBalasan(WAJIB, WAJIB, { tempel: false }).text).toBe('');
    });
  });

  /**
   * Lima kelas di bawah ditemukan AUDIT, bukan oleh test yang ada — semuanya
   * lolos dari 974 test hijau. Ditulis di sini supaya tidak bisa kembali.
   */
  /**
   * Ditemukan Bossfren di UJI LAPANGAN, dan log membuktikannya: provider
   * memulangkan `{"content":""}` — model tidak menjawab apa pun — lalu
   * komposisi menempelkan kalimat funnel, sehingga pelanggan yang bertanya
   * ONGKIR menerima "mau ambil berapa pcs kak?" sebagai jawaban. Kegagalan
   * total menyamar jadi balasan wajar.
   */
  describe('prosa KOSONG tidak boleh ditempeli (uji lapangan 2026-08-10)', () => {
    it('prosa kosong → dikembalikan kosong, sistem TIDAK mengarang balasan', () => {
      expect(susunBalasan('', WAJIB)).toEqual({ text: '', disisipkan: false, salinanDibuang: 0 });
    });

    it('prosa berisi spasi/baris baru saja tetap dianggap kosong', () => {
      expect(susunBalasan('   \n\n  ', WAJIB).disisipkan).toBe(false);
      expect(susunBalasan('   \n\n  ', WAJIB).text.trim()).toBe('');
    });

    it('prosa berisi SATU kata pun tetap ditempeli seperti biasa', () => {
      const h = susunBalasan('Siap', WAJIB);
      expect(h.disisipkan).toBe(true);
      expect(h.text).toBe(`Siap\n\n${WAJIB}`);
    });
  });

  describe('koreksi audit 2026-08-09', () => {
    // Template closing COD default BERAKHIR dengan {{catatan_sk}}. Versi pertama
    // `polaKalimat` membuang potongan literal kosong di ujung → polanya berhenti
    // di literal sebelum penanda terakhir → formulir closing dipotong berantakan
    // SETIAP giliran, dan cek "sudah menutup" tidak pernah kena.
    const CLOSING_COD =
      'Terimakasih kak konfirmasinya. Berikut data pesanannya ya :\n{{daftar_produk_harga}}\nNama: {{nama_pembeli}}\nAlamat: {{alamat_lengkap}}\n\n{{catatan_sk}}';

    it('kalimat wajib yang BERAKHIR dengan penanda: bentuk MENTAH = no-op byte per byte', () => {
      const prosa = `Baik kak 😊\n\n${CLOSING_COD}`;
      expect(susunBalasan(prosa, CLOSING_COD)).toEqual({
        text: prosa,
        disisipkan: false,
        salinanDibuang: 0,
      });
    });

    it('kalimat wajib yang BERAKHIR dengan penanda: bentuk TERSUBSTITUSI juga dianggap menutup', () => {
      const prosa =
        'Baik kak 😊\n\nTerimakasih kak konfirmasinya. Berikut data pesanannya ya :\nBedog Betekok Rp150.000\nNama: Fatih\nAlamat: Jl. Sandubaya No. 5\n\nS&K: barang dicek dulu ya kak.';
      expect(susunBalasan(prosa, CLOSING_COD).disisipkan).toBe(false);
      expect(susunBalasan(prosa, CLOSING_COD).text).toBe(prosa);
    });

    // peta/norm dulu tidak sinkron untuk huruf di luar BMP: potongan meleset,
    // dan pada kasus ekstrem `slice(0, undefined) + slice(NaN)` menggandakan
    // SELURUH balasan.
    it('huruf di luar BMP tidak menggeser indeks potongan', () => {
      const wajib = 'mau kirim ke mana kak';
      const prosa = '\u{1D5DB}\u{1D5EE}\u{1D5F9}\u{1D5FC} kak. mau kirim ke mana kak? Ditunggu ya';
      const h = susunBalasan(prosa, wajib);
      expect(h.disisipkan).toBe(true);
      expect(h.text).toBe('\u{1D5DB}\u{1D5EE}\u{1D5F9}\u{1D5FC} kak. Ditunggu ya\n\nmau kirim ke mana kak');
    });

    it('teks yang seluruhnya huruf astral tidak menggandakan balasan', () => {
      const wajib = 'mau kirim ke mana kak';
      const prosa = '\u{1D5D4}\u{1D5D5}\u{1D5D6} mau kirim ke mana kak? oke';
      const h = susunBalasan(prosa, wajib);
      expect(h.text.split('oke').length - 1).toBe(1);
      expect(h.text).toBe('\u{1D5D4}\u{1D5D5}\u{1D5D6} oke\n\nmau kirim ke mana kak');
    });

    // normFunnel dan normalisasiBerpeta dulu punya urutan berbeda
    // (lowercase-lalu-saring vs saring-lalu-lowercase) → hasil beda untuk
    // karakter yang lowercase-nya mekar jadi huruf + tanda gabung.
    it('dua normalisasi tidak bisa berbeda pendapat (İ dan kawan-kawan)', () => {
      const wajib = 'kirim ke İstanbul kak';
      const prosa = `Siap kak.\n\n${wajib}`;
      expect(susunBalasan(prosa, wajib)).toEqual({ text: prosa, disisipkan: false, salinanDibuang: 0 });
    });

    it('kemunculan tumpang tindih digabung, tidak menyisakan penggalan yatim', () => {
      const h = susunBalasan('ada ada ada', 'ada ada');
      expect(h.text).toBe('ada ada');
      expect(h.disisipkan).toBe(true);
    });

    it('prosa yang isinya cuma tanda baca tidak ikut terkirim', () => {
      expect(susunBalasan('!!! ??? ...', WAJIB).text).toBe(WAJIB);
    });
  });

  it('kalimat wajib KOSONG (cap 2x tanya kena) → tidak menempel apa pun', () => {
    const h = susunBalasan('Baik kak.', '');
    expect(h).toEqual({ text: 'Baik kak.', disisipkan: false, salinanDibuang: 0 });
  });

  /**
   * Kelas yang hampir lolos di F4 gelombang pertama. Prompt retry gerbang uang
   * menyodorkan balasan sebelumnya yang penandanya SUDAH diisi, jadi teks retry
   * memuat nomor rekening ASLI, bukan `{{rekening_transfer}}`. Kalau pencocokan
   * cuma literal, salinan itu tidak dikenali → tidak dibuang → sistem menempel
   * versi kanoniknya → pelanggan menerima kalimat itu dua kali.
   */
  describe('bentuk TERSUBSTITUSI dikenali (penanda diperlakukan sebagai lubang)', () => {
    const WAJIB_TOKEN = 'Silakan transfer ke rekening berikut: {{rekening_transfer}} ya kak 🙏';

    it('teks memuat versi tersubstitusi di akhir → dianggap sudah menutup, no-op', () => {
      const prosa = 'Totalnya sudah pas kak.\n\nSilakan transfer ke rekening berikut: BCA 1234567890 a.n. Angga ya kak 🙏';
      expect(susunBalasan(prosa, WAJIB_TOKEN)).toEqual({
        text: prosa,
        disisipkan: false,
        salinanDibuang: 0,
      });
    });

    it('versi tersubstitusi nyempil di tengah → dibuang, kanonik ditempel sekali', () => {
      const prosa = 'Silakan transfer ke rekening berikut: BCA 1234567890 ya kak 🙏 Ditunggu ya kak.';
      const h = susunBalasan(prosa, WAJIB_TOKEN);
      expect(h.disisipkan).toBe(true);
      expect(h.salinanDibuang).toBe(1);
      expect(h.text).toBe(`Ditunggu ya kak.\n\n${WAJIB_TOKEN}`);
    });

    it('kalimat lain yang kebetulan mirip TIDAK ikut terbuang', () => {
      const h = susunBalasan('Kami terima transfer dan COD kok kak.', WAJIB_TOKEN);
      expect(h.disisipkan).toBe(true);
      expect(h.text).toBe(`Kami terima transfer dan COD kok kak.\n\n${WAJIB_TOKEN}`);
    });
  });

  it('penanda {{...}} di kalimat wajib ikut dibandingkan apa adanya (belum disubstitusi)', () => {
    const wajib = 'Silakan transfer ke rekening berikut: {{rekening_transfer}} ya kak.';
    const prosa = `Totalnya {{total_transfer}}.\n\n${wajib}`;
    expect(susunBalasan(prosa, wajib).text).toBe(prosa);
    const tanpa = susunBalasan('Totalnya {{total_transfer}}.', wajib);
    expect(tanpa.disisipkan).toBe(true);
    expect(tanpa.text.endsWith(wajib)).toBe(true);
  });

  it('emoji di luar BMP tidak membelah indeks potongan', () => {
    const wajib = 'Mau lanjut kak?';
    const prosa = 'Mau lanjut kak? 🧑‍🍳 Ongkirnya sudah pasti.';
    const h = susunBalasan(prosa, wajib);
    expect(h.disisipkan).toBe(true);
    expect(h.text).toBe('Ongkirnya sudah pasti.\n\nMau lanjut kak?');
  });
});
