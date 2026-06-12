import { BadRequestException } from '@nestjs/common';
import {
  chunkText,
  extractFromFile,
  htmlTitle,
  htmlToText,
  CHUNK_CHARS,
} from './document-extract.util';

describe('document-extract.util', () => {
  describe('htmlToText', () => {
    it('strips tags, scripts, styles and decodes entities', () => {
      const html = `
        <html><head><title>Promo</title><style>.x{color:red}</style>
        <script>alert(1)</script></head>
        <body><h1>Harga &amp; Stok</h1><p>Paket A: 100rb</p><div>Gratis ongkir</div></body></html>`;
      const text = htmlToText(html);
      expect(text).toContain('Harga & Stok');
      expect(text).toContain('Paket A: 100rb');
      expect(text).not.toContain('alert');
      expect(text).not.toContain('color:red');
      expect(text).not.toContain('<');
    });
  });

  describe('htmlTitle', () => {
    it('extracts the page title', () => {
      expect(htmlTitle('<title> Toko  Kami </title>')).toBe('Toko Kami');
    });
    it('returns null when absent', () => {
      expect(htmlTitle('<h1>x</h1>')).toBeNull();
    });
  });

  describe('chunkText', () => {
    it('returns a single chunk for short text', () => {
      expect(chunkText('halo')).toEqual(['halo']);
    });
    it('splits long text into multiple chunks under the limit', () => {
      const para = 'Kalimat penjelasan produk. '.repeat(200) + '\n\n';
      const long = para.repeat(5); // ~27k chars
      const chunks = chunkText(long);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_CHARS);
      // No content lost beyond whitespace trimming
      expect(chunks.join(' ').replace(/\s+/g, '')).toBe(long.replace(/\s+/g, ''));
    });
  });

  describe('extractFromFile', () => {
    it('reads txt/md/csv directly', async () => {
      const r = await extractFromFile(Buffer.from('harga,stok\n100,5'), 'produk.csv');
      expect(r.kind).toBe('csv');
      expect(r.text).toContain('harga,stok');
    });
    it('strips html files', async () => {
      const r = await extractFromFile(Buffer.from('<p>Halo <b>kak</b></p>'), 'page.html');
      expect(r.kind).toBe('html');
      expect(r.text).toBe('Halo kak');
    });
    it('rejects unsupported extensions', async () => {
      await expect(extractFromFile(Buffer.from('x'), 'virus.exe')).rejects.toThrow(BadRequestException);
    });
    it('rejects legacy .doc with a helpful message', async () => {
      await expect(extractFromFile(Buffer.from('x'), 'old.doc')).rejects.toThrow(/docx/);
    });
    it('routes xlsx through the sheet parser', async () => {
      // Build a real tiny workbook in-memory so the round trip is honest.
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([['produk', 'harga'], ['Paket A', 100000]]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daftar');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const r = await extractFromFile(buf, 'harga.xlsx');
      expect(r.kind).toBe('excel');
      expect(r.text).toContain('Sheet: Daftar');
      expect(r.text).toContain('Paket A');
    });
  });
});
