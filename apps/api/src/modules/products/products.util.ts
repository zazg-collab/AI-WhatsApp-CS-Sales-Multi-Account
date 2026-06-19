/** A parsed product row (only sku + name are required). */
export interface ProductRow {
  sku: string;
  name: string;
  category?: string;
  price?: number;
  /** ISO 4217 code detected from price cell prefix (e.g. "USD", "IDR"). */
  currency?: string;
  stock?: number;
  unit?: string;
  description?: string;
}

/** Header aliases (EN + ID + common) → canonical field. */
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
  currency: 'currency',
  mata_uang: 'currency',
  'mata uang': 'currency',
  moneda: 'currency',   // Spanish
  devise: 'currency',   // French
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

/**
 * Filler words that carry no product identity — dropped before matching so the
 * score reflects real product terms, not "berapa harga stok ukuran". Indonesian
 * CS chatter + a few English equivalents. Keep lean; over-stopping hurts recall.
 */
const MATCH_STOPWORDS = new Set([
  // id — questions / fillers
  'ada', 'apakah', 'berapa', 'harga', 'harganya', 'stok', 'stoknya', 'ready',
  'ukuran', 'size', 'yang', 'untuk', 'dari', 'dengan', 'atau', 'dan', 'ini',
  'itu', 'bisa', 'boleh', 'tolong', 'mau', 'beli', 'pesan', 'order', 'info',
  'tanya', 'nya', 'kak', 'mas', 'mbak', 'bang', 'gan', 'min', 'pak', 'bu',
  'total', 'mohon', 'punya', 'jual', 'cari', 'butuh', 'per',
  // en
  'the', 'and', 'for', 'with', 'have', 'has', 'price', 'stock', 'available',
  'want', 'need', 'buy', 'order', 'please', 'how', 'much', 'many', 'any',
]);

/**
 * Tokenize free text for product matching. Lowercases, splits digit↔letter
 * boundaries ("8mm" → "8 mm", "klem8" → "klem 8") so a size like "ukuran 8"
 * matches a product named "Klem 8mm", drops punctuation and stopwords, and
 * keeps pure-number tokens (sizes) plus words ≥ 2 chars. Returns a de-duped set.
 */
export function tokenizeForMatch(text: string): Set<string> {
  const spaced = (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/(\p{L})(\d)/gu, '$1 $2');
  const tokens = spaced.split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const tok of tokens) {
    if (MATCH_STOPWORDS.has(tok)) continue;
    const isNumber = /^\d+$/.test(tok);
    if (isNumber || tok.length >= 2) out.add(tok);
  }
  return out;
}

/**
 * Relevance score of a product against a tokenized query. Name/SKU hits weigh
 * more than category/description hits. Numbers must match as whole tokens (so
 * "8" does not match "18"); that's guaranteed because both sides are tokenized.
 */
export function scoreProductMatch(
  product: { name: string; category?: string | null; sku?: string | null; description?: string | null },
  queryTokens: Set<string>,
): number {
  if (queryTokens.size === 0) return 0;
  const strong = new Set([...tokenizeForMatch(product.name), ...tokenizeForMatch(product.sku ?? '')]);
  const weak = new Set([...tokenizeForMatch(product.category ?? ''), ...tokenizeForMatch(product.description ?? '')]);
  let score = 0;
  for (const t of queryTokens) {
    if (strong.has(t)) score += 2;
    else if (weak.has(t)) score += 1;
  }
  return score;
}

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

/**
 * TLS option for an external Postgres connection. Validates the server
 * certificate by default (MITM protection). Only disables verification when the
 * admin explicitly opts out via `sslmode=no-verify` in the connection string.
 * Returns undefined (no TLS) when neither TLS nor a managed host is indicated.
 */
export function pgSslOption(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  const cs = connectionString ?? '';
  if (/sslmode=no-verify/i.test(cs)) return { rejectUnauthorized: false };
  if (/supabase|neon\.tech|sslmode=require|sslmode=verify/i.test(cs)) return { rejectUnauthorized: true };
  return undefined;
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

/**
 * Known currency prefix → ISO 4217 code.
 * Checked case-insensitively against the start of the cell value.
 */
const CURRENCY_PREFIXES: Array<[string, string]> = [
  ['rp', 'IDR'],
  ['idr', 'IDR'],
  ['usd', 'USD'],
  ['$', 'USD'],
  ['us$', 'USD'],
  ['eur', 'EUR'],
  ['€', 'EUR'],
  ['gbp', 'GBP'],
  ['£', 'GBP'],
  ['sgd', 'SGD'],
  ['s$', 'SGD'],
  ['myr', 'MYR'],
  ['rm', 'MYR'],
  ['thb', 'THB'],
  ['฿', 'THB'],
  ['php', 'PHP'],
  ['₱', 'PHP'],
  ['aed', 'AED'],
  ['sar', 'SAR'],
  ['aud', 'AUD'],
  ['a$', 'AUD'],
  ['cad', 'CAD'],
  ['c$', 'CAD'],
  ['jpy', 'JPY'],
  ['¥', 'JPY'],
  ['cny', 'CNY'],
  ['krw', 'KRW'],
  ['₩', 'KRW'],
  ['inr', 'INR'],
  ['₹', 'INR'],
  ['brl', 'BRL'],
  ['r$', 'BRL'],
];

/**
 * Detect a currency prefix in a raw price string.
 * Returns the ISO 4217 code or undefined if none recognised.
 */
export function detectCurrency(raw: string): string | undefined {
  const lower = raw.trim().toLowerCase();
  for (const [prefix, code] of CURRENCY_PREFIXES) {
    if (lower.startsWith(prefix)) return code;
  }
  return undefined;
}

/**
 * Strip a number from messy cells like "Rp 1.250.000", "$12.99", or "12 pcs".
 * Handles both dot-as-thousands (id-ID) and comma-as-thousands (en-US).
 * Returns undefined for non-numeric strings.
 */
function toNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.trunc(raw) : undefined;
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  // Strip all non-digit characters except the last separator that might be decimal.
  // Strategy: keep only digits, then parse as integer (prices are whole units).
  const digitsOnly = s.replace(/[^\d]/g, '');
  if (!digitsOnly) return undefined;
  const n = parseInt(digitsOnly, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map an arbitrary record (CSV row object or DB row) to a ProductRow using the
 * header aliases. Returns undefined if it lacks sku+name. Shared by the CSV and
 * external-database sync paths so both honor the same column names + coercion.
 */
export function mapRecordToProduct(record: Record<string, unknown>): ProductRow | undefined {
  const row: Partial<ProductRow> = {};
  // Track the raw price string so we can extract currency from its prefix.
  let rawPriceStr: string | undefined;

  for (const [key, raw] of Object.entries(record)) {
    const field = HEADER_ALIASES[key.trim().toLowerCase()];
    if (!field) continue;
    if (field === 'price') {
      if (typeof raw === 'string') rawPriceStr = raw.trim();
      const n = toNumber(raw);
      if (n !== undefined) row.price = n;
    } else if (field === 'stock') {
      const n = toNumber(raw);
      if (n !== undefined) row.stock = n;
    } else {
      const v = String(raw ?? '').trim();
      if (v) row[field] = v as never;
    }
  }

  if (!row.sku || !row.name) return undefined;

  // Auto-detect currency from the price prefix when no explicit currency column.
  if (!row.currency && rawPriceStr) {
    const detected = detectCurrency(rawPriceStr);
    if (detected) row.currency = detected;
  }

  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    price: row.price,
    currency: row.currency,
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
