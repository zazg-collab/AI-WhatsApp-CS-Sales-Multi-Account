import { readFileSync } from 'fs';
import { join } from 'path';
import {
  formatIdr,
  sensorBarisTotal,
  sensorSemuaTokenHarga,
  POLA_TOKEN_TOTAL,
} from './order-brain';

/**
 * >>> ANGGA — F2 gelombang v2 (2026-08-09, cowork). Dua penyensor katalog ini
 * dulu `private method` di ShippingService, jadi TIDAK PERNAH punya unit test
 * langsung — padahal merekalah yang menentukan penanda apa yang BOLEH dilihat
 * model di langkah pra-total/patokan. Sekarang fungsi murni, jadi bisa diuji
 * apa adanya. <<<
 */
describe('order-brain — lapisan penjaga murni', () => {
  it('MURNI: tidak ada satu pun `this.` di KODE (komentar dikecualikan)', () => {
    const kode = readFileSync(join(__dirname, 'order-brain.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')   // blok komentar
      .replace(/\/\/.*$/gm, '');           // komentar baris
    expect(kode).not.toMatch(/\bthis\./);
  });

  describe('sensorBarisTotal — buang baris penanda kelas TOTAL saja', () => {
    it('membuang baris penanda total, menyisakan penanda non-total', () => {
      const lines = [
        '• {{harga_satuan}} — harga per pcs',
        '• {{ongkir}} — ongkos kirim',
        '• {{total_cod}} — total COD',
        '• {{blok_total}} — dua baris lengkap',
      ];
      sensorBarisTotal(lines);
      expect(lines).toEqual([
        '• {{harga_satuan}} — harga per pcs',
        '• {{ongkir}} — ongkos kirim',
      ]);
    });

    it('hanya menyentuh baris berprefiks "• {{" — kalimat biasa tidak ikut terbuang', () => {
      const lines = ['Total pesanan sudah dihitung sistem.', '• {{total_transfer}} — total transfer'];
      sensorBarisTotal(lines);
      expect(lines).toEqual(['Total pesanan sudah dihitung sistem.']);
    });

    it('POLA_TOKEN_TOTAL mengenali seluruh kelas total, termasuk varian diskon & nego', () => {
      for (const t of [
        '{{total_cod}}', '{{total_transfer}}', '{{blok_total}}', '{{subtotal_barang}}',
        '{{rincian_tagihan}}', '{{total_cod_diskon}}', '{{total_transfer_nego}}',
      ]) {
        expect(POLA_TOKEN_TOTAL.test(t)).toBe(true);
      }
      expect(POLA_TOKEN_TOTAL.test('{{ongkir}}')).toBe(false);
      expect(POLA_TOKEN_TOTAL.test('{{harga_satuan}}')).toBe(false);
    });
  });

  describe('sensorSemuaTokenHarga — langkah patokan: NOL angka boleh terlihat', () => {
    it('membuang harga_satuan & ongkir juga, bukan cuma total', () => {
      const lines = [
        '• {{harga_satuan}} — harga per pcs',
        '• {{ongkir}} — ongkos kirim',
        '• {{total_cod}} — total COD',
        '• {{kota_tujuan}} — kota tujuan',
      ];
      sensorSemuaTokenHarga(lines);
      expect(lines).toEqual(['• {{kota_tujuan}} — kota tujuan']);
    });

    it('membuang baris berlabel rupiah walau tanpa penanda', () => {
      const lines = ['• Subtotal barang', '• Ongkir', '• Rp0', '• {{kota_tujuan}} — kota tujuan'];
      sensorSemuaTokenHarga(lines);
      expect(lines).toEqual(['• {{kota_tujuan}} — kota tujuan']);
    });
  });

  describe('formatIdr', () => {
    it('memakai titik sebagai pemisah ribuan tanpa bergantung ICU', () => {
      expect(formatIdr(139000)).toBe('139.000');
      expect(formatIdr(1250000)).toBe('1.250.000');
      expect(formatIdr(999)).toBe('999');
      expect(formatIdr(0)).toBe('0');
    });
  });
});
