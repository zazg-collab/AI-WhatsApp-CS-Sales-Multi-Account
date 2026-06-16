import { parseProductCsv } from './products.util';

describe('parseProductCsv', () => {
  it('parses headers (EN/ID aliases) and rows', () => {
    const csv = 'sku,nama,harga,stok\nA1,Paket A,100000,5\nB2,Paket B,250000,0';
    const rows = parseProductCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sku: 'A1', name: 'Paket A', price: 100000, stock: 5 });
    expect(rows[1]).toMatchObject({ sku: 'B2', stock: 0 });
  });

  it('strips currency/units from numeric cells', () => {
    const rows = parseProductCsv('kode,produk,harga,qty\nX,Item,"Rp 1.250.000",12 pcs');
    expect(rows[0].price).toBe(1250000);
    expect(rows[0].stock).toBe(12);
  });

  it('honors quoted fields containing commas', () => {
    const rows = parseProductCsv('sku,name,description\nX,Item,"besar, merah, kuat"');
    expect(rows[0].description).toBe('besar, merah, kuat');
  });

  it('skips rows missing sku or name, and ignores unknown columns', () => {
    const rows = parseProductCsv('sku,name,warna\n,NoSku,merah\nC3,Has Name,biru\nD4,,hijau');
    expect(rows.map((r) => r.sku)).toEqual(['C3']);
  });

  it('tolerates BOM and CRLF', () => {
    const rows = parseProductCsv('﻿sku,name\r\nA,Apel\r\n');
    expect(rows).toEqual([{ sku: 'A', name: 'Apel', category: undefined, price: undefined, stock: undefined, unit: undefined, description: undefined }]);
  });

  it('returns [] for empty or header-only input', () => {
    expect(parseProductCsv('')).toEqual([]);
    expect(parseProductCsv('sku,name')).toEqual([]);
  });
});
