import {
  parseProductCsv,
  mapRecordToProduct,
  assertReadOnlySelect,
  maskConnString,
  pgSslOption,
  tokenizeForMatch,
  scoreProductMatch,
} from './products.util';

describe('tokenizeForMatch', () => {
  it('splits digit/letter boundaries and drops stopwords', () => {
    const t = tokenizeForMatch('berapa harga klem ukuran 8 kak?');
    expect(t.has('klem')).toBe(true);
    expect(t.has('8')).toBe(true);
    // fillers removed
    expect(t.has('berapa')).toBe(false);
    expect(t.has('harga')).toBe(false);
    expect(t.has('ukuran')).toBe(false);
    expect(t.has('kak')).toBe(false);
  });
  it('treats "8mm" and "8 mm" the same', () => {
    expect(tokenizeForMatch('8mm')).toEqual(tokenizeForMatch('8 mm'));
  });
});

describe('scoreProductMatch', () => {
  const klem = { name: 'Klem Pipa 8mm', category: 'Pipa', sku: 'KLM-8', description: 'klem besi' };
  const klem18 = { name: 'Klem Pipa 18mm', category: 'Pipa', sku: 'KLM-18' };

  it('matches "klem ukuran 8" to the 8mm product, not the 18mm one', () => {
    const q = tokenizeForMatch('klem ukuran 8');
    expect(scoreProductMatch(klem, q)).toBeGreaterThan(scoreProductMatch(klem18, q));
  });
  it('a size number matches as a whole token (8 ≠ 18)', () => {
    const q = tokenizeForMatch('8');
    expect(scoreProductMatch(klem18, q)).toBe(0);
    expect(scoreProductMatch(klem, q)).toBeGreaterThan(0);
  });
  it('returns 0 for an unrelated query', () => {
    expect(scoreProductMatch(klem, tokenizeForMatch('sepeda gunung'))).toBe(0);
  });
});

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

describe('mapRecordToProduct', () => {
  it('maps a DB row object with aliased keys', () => {
    expect(mapRecordToProduct({ kode: 'A1', nama: 'X', stok: 7, harga: 9000 })).toMatchObject({
      sku: 'A1',
      name: 'X',
      stock: 7,
      price: 9000,
    });
  });
  it('returns undefined without sku+name', () => {
    expect(mapRecordToProduct({ nama: 'X' })).toBeUndefined();
  });
});

describe('assertReadOnlySelect', () => {
  it('allows a single SELECT / WITH', () => {
    expect(() => assertReadOnlySelect('SELECT * FROM products')).not.toThrow();
    expect(() => assertReadOnlySelect('with x as (select 1) select * from x')).not.toThrow();
    expect(() => assertReadOnlySelect('SELECT * FROM products;')).not.toThrow();
  });
  it('rejects writes, DDL, and multiple statements', () => {
    expect(() => assertReadOnlySelect('DELETE FROM products')).toThrow();
    expect(() => assertReadOnlySelect('SELECT 1; DROP TABLE x')).toThrow();
    expect(() => assertReadOnlySelect('UPDATE products SET stock=0')).toThrow();
    expect(() => assertReadOnlySelect('')).toThrow();
  });
});

describe('maskConnString', () => {
  it('hides the password', () => {
    expect(maskConnString('postgresql://user:secret@host:5432/db')).toBe('postgresql://user:****@host:5432/db');
  });
});

describe('pgSslOption', () => {
  it('validates the cert by default when TLS is indicated', () => {
    expect(pgSslOption('postgresql://u:p@db.abc.supabase.co:5432/postgres')).toEqual({ rejectUnauthorized: true });
    expect(pgSslOption('postgresql://u:p@h:5432/db?sslmode=require')).toEqual({ rejectUnauthorized: true });
  });
  it('disables verification only on explicit sslmode=no-verify', () => {
    expect(pgSslOption('postgresql://u:p@h:5432/db?sslmode=no-verify')).toEqual({ rejectUnauthorized: false });
  });
  it('returns undefined for a plain local connection', () => {
    expect(pgSslOption('postgresql://u:p@localhost:5432/db')).toBeUndefined();
  });
});
