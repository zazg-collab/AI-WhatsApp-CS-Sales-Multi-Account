/** A parsed product row (only sku + name are required). */
export interface ProductRow {
  sku: string;
  name: string;
  category?: string;
  price?: number;
  stock?: number;
  unit?: string;
  description?: string;
}

/** Header aliases (EN + ID) → canonical field. */
const HEADER_ALIASES: Record<string, keyof ProductRow> = {
  sku: 'sku',
  kode: 'sku',
  'kode produk': 'sku',
  id: 'sku',
  name: 'name',
  nama: 'name',
  'nama produk': 'name',
  produk: 'name',
  category: 'category',
  kategori: 'category',
  price: 'price',
  harga: 'price',
  stock: 'stock',
  stok: 'stock',
  qty: 'stock',
  quantity: 'stock',
  jumlah: 'stock',
  unit: 'unit',
  satuan: 'unit',
  description: 'description',
  deskripsi: 'description',
  keterangan: 'description',
};

/** Parse one CSV line, honoring double-quoted fields (RFC4180-ish). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Strip a number from messy cells like "Rp 1.250.000" or "12 pcs" → 1250000 / 12. */
function toNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d-]/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse CSV text (header row required) into product rows. Unknown columns are
 * ignored; rows without sku+name are skipped. Tolerant of BOM and CRLF.
 */
export function parseProductCsv(text: string): ProductRow[] {
  let clean = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (clean.charCodeAt(0) === 0xfeff) clean = clean.slice(1).trim();
  if (!clean) return [];
  const lines = clean.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase()] ?? null);

  const rows: ProductRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: Partial<ProductRow> = {};
    headers.forEach((field, idx) => {
      if (!field) return;
      const val = cells[idx] ?? '';
      if (field === 'price' || field === 'stock') {
        const n = toNumber(val);
        if (n !== undefined) row[field] = n;
      } else if (val) {
        row[field] = val;
      }
    });
    if (row.sku && row.name) {
      rows.push({
        sku: row.sku,
        name: row.name,
        category: row.category,
        price: row.price,
        stock: row.stock,
        unit: row.unit,
        description: row.description,
      });
    }
  }
  return rows;
}
