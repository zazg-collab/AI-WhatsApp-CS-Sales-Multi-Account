import {
  DATA_FENCE_OPEN,
  DATA_FENCE_CLOSE,
  fenceData,
  stripDataFences,
  SHIPPING_EXTRACT_SYSTEM,
} from './bot-prompts';

describe('stripDataFences', () => {
  it('removes both id and en fence markers a model might echo', () => {
    const leaked = `${DATA_FENCE_OPEN.id}\nHarga 100rb\n${DATA_FENCE_CLOSE.id}`;
    expect(stripDataFences(leaked)).toBe('Harga 100rb');

    const leakedEn = `${DATA_FENCE_OPEN.en} Price is $5 ${DATA_FENCE_CLOSE.en}`;
    expect(stripDataFences(leakedEn)).toBe('Price is $5');
  });

  it('strips markers produced by fenceData', () => {
    const out = stripDataFences(fenceData('stock 3', 'id'));
    expect(out).toBe('stock 3');
    expect(out).not.toMatch(/<</);
  });

  it('leaves normal replies untouched', () => {
    const reply = 'Halo kak, stok ready. Mau pesan berapa?';
    expect(stripDataFences(reply)).toBe(reply);
  });

  it('handles empty/undefined', () => {
    expect(stripDataFences('')).toBe('');
    expect(stripDataFences(undefined as unknown as string)).toBe('');
  });
});

// >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): harga Golok Bang Jago
// tampil 477rb padahal katalog 199rb. Root cause: instruksi ekstraksi item
// lama bilang "SEMUA barang yang pelanggan sebut ingin dibeli SEJAUH INI di
// percakapan ini" — gak bisa bedain nambah-ke-order-yang-sama vs pertanyaan
// baru soal produk lain yang gak nyambung. Fix ini murni teks prompt (LLM),
// jadi gak bisa dites lewat asersi perilaku — tes ini cuma jaring pengaman
// supaya instruksi pembeda "sinyal penyambung eksplisit" + contoh SALAH/BENAR
// gak hilang diam-diam kalau prompt ini diedit lagi nanti.
describe('SHIPPING_EXTRACT_SYSTEM — pembeda nambah-order vs pertanyaan baru', () => {
  it('instruksi ID mewajibkan sinyal penyambung eksplisit sebelum menggabung barang lama', () => {
    const text = SHIPPING_EXTRACT_SYSTEM.id;
    expect(text).toMatch(/sinyal penyambung/i);
    expect(text).toMatch(/pertanyaan baru/i);
  });

  it('instruksi EN mewajibkan sinyal penyambung eksplisit sebelum menggabung barang lama', () => {
    const text = SHIPPING_EXTRACT_SYSTEM.en;
    expect(text).toMatch(/explicit continuation/i);
    expect(text).toMatch(/new,? ?stand-?alone question/i);
  });

  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, ronde 2): daftar sinyal
  // penyambung awal ("juga"/"sekalian"/"plus"/"tambah") KELEWATAN kata
  // penghubung paling umum buat menyebut BEBERAPA barang SEKALIGUS dalam satu
  // kalimat — "dan"/"sama" (mis. "Golok dan Pisau, kirim ke Solo berapa?").
  // Tanpa ini, model bisa salah menganggap kalimat begitu sebagai dua
  // pertanyaan terpisah dan cuma masukin satu barang ke "items".
  it('daftar sinyal penyambung mencantumkan "dan"/"sama" (ID) dan "and" (EN), bukan cuma juga/sekalian/plus/tambah', () => {
    expect(SHIPPING_EXTRACT_SYSTEM.id).toMatch(/"dan"/);
    expect(SHIPPING_EXTRACT_SYSTEM.en).toMatch(/"and"/);
  });
});
