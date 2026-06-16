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

const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|copy|call|do|vacuum)\b/i;

/**
 * Guard an admin-supplied external query: it must be a single read-only SELECT
 * (or WITH...SELECT). Belt-and-suspenders alongside the read-only transaction
 * the sync runs it in. Throws a plain Error on violation.
 */
export function assertReadOnlySelect(query: string): void {
  const q = (query ?? '').trim().replace(/;+\s*$/, '');
  if (!q) throw new Error('Query kosong');
  if (q.includes(';')) throw new Error('Hanya satu pernyataan SELECT yang diperbolehkan');
  if (!/^(select|with)\b/i.test(q)) throw new Error('Query harus diawali SELECT/WITH');
  if (FORBIDDEN_SQL.test(q)) throw new Error('Query hanya boleh membaca (SELECT), tanpa perintah tulis/DDL');
}

/** Hide the password in a Postgres connection string for safe display. */
export function maskConnString(cs: string): string {
  try {
    const u = new URL(cs);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return cs.replace(/:\/\/([^:@/]+):[^@]+@/, '://$1:****@');
  }
}

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
function toNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.trunc(raw) : undefined;
  const s = String(raw ?? '');
  if (!s) return undefined;
  const digits = s.replace(/[^\d-]/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map an arbitrary record (CSV row object or DB row) to a ProductRow using the
 * header aliases. Returns undefined if it lacks sku+name. Shared by the CSV and
 * external-database sync paths so both honor the same column names + coercion.
 */
export function mapRecordToProduct(record: Record<string, unknown>): ProductRow | undefined {
  const row: Partial<ProductRow> = {};
  for (const [key, raw] of Object.entries(record)) {
    const field = HEADER_ALIASES[key.trim().toLowerCase()];
    if (!field) continue;
    if (field === 'price' || field === 'stock') {
      const n = toNumber(raw);
      if (n !== undefined) row[field] = n;
    } else {
      const v = String(raw ?? '').trim();
      if (v) row[field] = v;
    }
  }
  if (!row.sku || !row.name) return undefined;
  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    price: row.price,
    stock: row.stock,
    unit: row.unit,
    description: row.description,
  };
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

  const headers = parseCsvLine(lines[0]);

  const rows: ProductRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => { record[h] = cells[idx] ?? ''; });
    const mapped = mapRecordToProduct(record);
    if (mapped) rows.push(mapped);
  }
  return rows;
}
