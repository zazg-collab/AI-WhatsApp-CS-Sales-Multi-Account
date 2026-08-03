import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { createSign } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Client } from 'pg';
import { assertSafeMediaUrl } from '../../common/media-url.util';
import { logAudit } from '../../common/audit.util';
import { encryptSecret, decryptSecret, encryptionEnabled, isEncrypted } from '../../common/secret-crypto.util';
import {
  assertReadOnlySelect,
  mapRecordToProduct,
  maskConnString,
  parseProductCsv,
  pgSslOption,
  ProductRow,
  tokenizeForMatch,
  scoreProductMatch,
} from './products.util';

const FETCH_TIMEOUT_MS = 15_000;
const FETCH_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);
  private autoSyncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  /**
   * Optionally keep stock fresh by re-syncing every configured source on a
   * timer. Off unless PRODUCT_AUTOSYNC_MINUTES > 0. In-process timer (runs per
   * API instance) — fine for a single-instance deploy.
   */
  onModuleInit() {
    const minutes = Number(this.config.get('PRODUCT_AUTOSYNC_MINUTES')) || 0;
    if (minutes <= 0) return;
    const ms = Math.max(1, minutes) * 60_000;
    const timer = setInterval(() => {
      void this.autoSyncAll();
    }, ms);
    this.scheduler.addInterval('product-autosync', timer);
    this.logger.log(`Product auto-sync enabled: every ${minutes} min`);
  }

  /** Re-sync every active source. Best-effort; one failure doesn't stop others. */
  async autoSyncAll() {
    if (this.autoSyncing) return; // no overlap
    this.autoSyncing = true;
    try {
      const sources = await this.prisma.productSource.findMany({ where: { status: 'active' } });
      for (const s of sources) {
        await this.syncSource(s.id).catch((err) =>
          this.logger.warn(`Auto-sync source ${s.id} failed: ${err instanceof Error ? err.message : err}`),
        );
      }
    } finally {
      this.autoSyncing = false;
    }
  }

  list(filter: { search?: string; status?: string }) {
    return this.prisma.product.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: 'insensitive' } },
                { sku: { contains: filter.search, mode: 'insensitive' } },
                { category: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async update(
    id: string,
    data: {
      stock?: number;
      price?: number;
      currency?: string;
      status?: string;
      description?: string;
      /** >>> ANGGA: berat satuan (gram) untuk modul ongkir. null = kosongkan
       *  lagi supaya kembali memakai fallback config. */
      weightGrams?: number | null;
    },
  ) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    return this.prisma.product.update({ where: { id }, data });
  }

  // ── Sync ────────────────────────────────────────────────────────────────

  /** Upsert rows by sku. Returns how many were created/updated. */
  private async upsertRows(rows: ProductRow[], source: string): Promise<{ upserted: number }> {
    let upserted = 0;
    for (const r of rows) {
      await this.prisma.product.upsert({
        where: { sku: r.sku },
        create: {
          sku: r.sku,
          name: r.name,
          category: r.category,
          price: r.price,
          currency: r.currency,
          stock: r.stock ?? 0,
          unit: r.unit,
          description: r.description,
          source,
          lastSyncedAt: new Date(),
        },
        update: {
          name: r.name,
          category: r.category,
          ...(r.price !== undefined ? { price: r.price } : {}),
          ...(r.currency !== undefined ? { currency: r.currency } : {}),
          ...(r.stock !== undefined ? { stock: r.stock } : {}),
          ...(r.unit !== undefined ? { unit: r.unit } : {}),
          ...(r.description !== undefined ? { description: r.description } : {}),
          source,
          lastSyncedAt: new Date(),
        },
      });
      upserted++;
    }
    return { upserted };
  }

  /** Manual CSV upload. */
  async syncFromCsv(buffer: Buffer, userId: string) {
    const rows = parseProductCsv(buffer.toString('utf8'));
    if (rows.length === 0) {
      throw new BadRequestException('Tidak ada baris produk valid (perlu kolom sku & nama).');
    }
    const { upserted } = await this.upsertRows(rows, 'csv');
    await logAudit(this.prisma, {
      userId,
      action: 'product_sync_csv',
      entityType: 'product',
      newValue: { upserted },
    });
    return { upserted, parsed: rows.length };
  }

  // ── Sources (re-syncable) ────────────────────────────────────────────────

  /** List sources with any secrets (DB connection string) masked. */
  async listSources() {
    const sources = await this.prisma.productSource.findMany({ orderBy: { createdAt: 'desc' } });
    return sources.map((s) => {
      const config = { ...((s.config ?? {}) as Record<string, unknown>) };
      if (typeof config.connectionString === 'string') {
        config.connectionString = isEncrypted(config.connectionString) ? '•••• (terenkripsi)' : maskConnString(config.connectionString);
      }
      if (typeof config.privateKey === 'string') config.privateKey = '****';
      return { ...s, config };
    });
  }

  async createSource(dto: {
    type: string;
    name: string;
    url?: string;
    connectionString?: string;
    query?: string;
    spreadsheetId?: string;
    range?: string;
    clientEmail?: string;
    privateKey?: string;
  }) {
    if (dto.type === 'gsheet_csv') {
      if (!dto.url) throw new BadRequestException('url wajib untuk gsheet_csv');
      assertSafeMediaUrl(dto.url); // SSRF guard: https/http only, no private hosts
      return this.prisma.productSource.create({
        data: { type: dto.type, name: dto.name, config: { url: dto.url } },
      });
    }
    if (dto.type === 'postgres' || dto.type === 'gsheet_api') {
      if (!encryptionEnabled()) {
        this.logger.warn(
          `Membuat sumber ${dto.type} TANPA SECRET_ENCRYPTION_KEY — kredensial tersimpan plaintext. Set env tsb di produksi.`,
        );
      }
    }
    if (dto.type === 'postgres') {
      if (!dto.connectionString || !dto.query) {
        throw new BadRequestException('connectionString & query wajib untuk postgres');
      }
      try {
        assertReadOnlySelect(dto.query);
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : 'Query tidak valid');
      }
      return this.prisma.productSource.create({
        data: {
          type: dto.type,
          name: dto.name,
          config: { connectionString: encryptSecret(dto.connectionString), query: dto.query },
        },
      });
    }
    if (dto.type === 'gsheet_api') {
      if (!dto.spreadsheetId || !dto.clientEmail || !dto.privateKey) {
        throw new BadRequestException('spreadsheetId, clientEmail, privateKey wajib untuk gsheet_api');
      }
      return this.prisma.productSource.create({
        data: {
          type: dto.type,
          name: dto.name,
          config: {
            spreadsheetId: dto.spreadsheetId,
            range: dto.range || 'A:Z',
            clientEmail: dto.clientEmail,
            privateKey: encryptSecret(dto.privateKey),
          },
        },
      });
    }
    throw new BadRequestException('Tipe sumber tidak didukung (gsheet_csv | gsheet_api | postgres).');
  }

  async deleteSource(id: string) {
    const s = await this.prisma.productSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Source not found');
    await this.prisma.productSource.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Dry-run a source connection WITHOUT saving it or upserting products:
   * fetch a sample, return the first rows + which columns were detected, so the
   * user can verify the connection/mapping before committing the source.
   */
  async previewSource(dto: {
    type: string;
    url?: string;
    connectionString?: string;
    query?: string;
    spreadsheetId?: string;
    range?: string;
    clientEmail?: string;
    privateKey?: string;
  }) {
    let rows: ProductRow[];
    if (dto.type === 'gsheet_csv') {
      if (!dto.url) throw new BadRequestException('url wajib untuk gsheet_csv');
      assertSafeMediaUrl(dto.url);
      rows = await this.fetchSheetRows({ url: dto.url });
    } else if (dto.type === 'postgres') {
      if (!dto.connectionString || !dto.query) throw new BadRequestException('connectionString & query wajib untuk postgres');
      try { assertReadOnlySelect(dto.query); } catch (err) { throw new BadRequestException(err instanceof Error ? err.message : 'Query tidak valid'); }
      rows = await this.fetchPostgresRows({ connectionString: dto.connectionString, query: dto.query });
    } else if (dto.type === 'gsheet_api') {
      if (!dto.spreadsheetId || !dto.clientEmail || !dto.privateKey) throw new BadRequestException('spreadsheetId, clientEmail, privateKey wajib untuk gsheet_api');
      rows = await this.fetchGsheetApiRows({ spreadsheetId: dto.spreadsheetId, range: dto.range || 'A:Z', clientEmail: dto.clientEmail, privateKey: dto.privateKey });
    } else {
      throw new BadRequestException('Tipe sumber tidak didukung (gsheet_csv | gsheet_api | postgres).');
    }

    // Which ProductRow fields were actually populated across the sample.
    const fields: (keyof ProductRow)[] = ['sku', 'name', 'category', 'price', 'currency', 'stock', 'unit', 'description'];
    const detectedColumns = fields.filter((f) => rows.some((r) => r[f] != null && r[f] !== ''));
    return {
      totalParsed: rows.length,
      detectedColumns,
      sample: rows.slice(0, 10),
    };
  }

  /** Re-sync a configured source (Google Sheet CSV or external Postgres). */
  async syncSource(id: string, userId?: string) {
    const source = await this.prisma.productSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source not found');

    let rows: ProductRow[];
    try {
      if (source.type === 'postgres') {
        rows = await this.fetchPostgresRows(source.config as { connectionString: string; query: string });
      } else if (source.type === 'gsheet_api') {
        rows = await this.fetchGsheetApiRows(source.config as Record<string, string>);
      } else {
        rows = await this.fetchSheetRows(source.config as { url?: string });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.productSource.update({
        where: { id },
        data: { lastSyncedAt: new Date(), lastResult: `Gagal: ${msg}` },
      });
      throw new BadRequestException(msg);
    }

    if (rows.length === 0) {
      await this.prisma.productSource.update({
        where: { id },
        data: { lastSyncedAt: new Date(), lastResult: 'Tidak ada baris valid' },
      });
      throw new BadRequestException('Tidak ada baris produk valid (perlu kolom sku & nama).');
    }
    const { upserted } = await this.upsertRows(rows, `${source.type}:${id}`);
    await this.prisma.productSource.update({
      where: { id },
      data: { lastSyncedAt: new Date(), lastResult: `OK: ${upserted} produk` },
    });
    await logAudit(this.prisma, {
      userId,
      action: 'product_sync_source',
      entityType: 'product_source',
      entityId: id,
      newValue: { type: source.type, upserted },
    });
    return { upserted, parsed: rows.length };
  }

  /** Fetch a published-CSV Google Sheet → product rows. */
  private async fetchSheetRows(config: { url?: string }): Promise<ProductRow[]> {
    const url = config?.url;
    if (!url) throw new BadRequestException('Source has no URL configured');
    assertSafeMediaUrl(url);

    let res: Response;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
        headers: { 'user-agent': 'HermesProductSync/1.0' },
      });
    } catch (err) {
      throw new Error(`Gagal mengambil sheet: ${err instanceof Error ? err.message : err}`);
    }
    if (!res.ok) throw new Error(`Gagal mengambil sheet: status ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > FETCH_MAX_BYTES) throw new Error('Sheet terlalu besar (maks 5MB)');
    return parseProductCsv(raw.toString('utf8'));
  }

  /**
   * Connect to an external Postgres/Supabase database (read-only) and map the
   * configured SELECT's rows to products. Hardened: the query is validated as a
   * single SELECT, runs inside a READ ONLY transaction with a statement
   * timeout, and on a capped connection time. Credentials are never logged.
   */
  private async fetchPostgresRows(config: { connectionString: string; query: string }): Promise<ProductRow[]> {
    if (!config?.connectionString || !config?.query) {
      throw new BadRequestException('Source has no connection configured');
    }
    assertReadOnlySelect(config.query);
    const connectionString = decryptSecret(config.connectionString);

    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
      ssl: pgSslOption(connectionString),
      application_name: 'hermes-product-sync',
    });
    try {
      await client.connect();
      await client.query('BEGIN TRANSACTION READ ONLY');
      // Wrap as a subquery so the row cap applies to any SELECT/WITH safely.
      const inner = config.query.trim().replace(/;+\s*$/, '');
      const result = await client.query(`SELECT * FROM (${inner}) AS _hermes_src LIMIT 5000`);
      await client.query('COMMIT');
      const rows: ProductRow[] = [];
      for (const record of result.rows as Record<string, unknown>[]) {
        const mapped = mapRecordToProduct(record);
        if (mapped) rows.push(mapped);
      }
      return rows;
    } catch (err) {
      // Never surface the connection string; just the DB error message.
      throw new Error(`Query DB gagal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /**
   * Read a PRIVATE Google Sheet via the Sheets API using a service account.
   * The sheet must be shared with the service account's client_email. We mint a
   * short-lived OAuth token by signing a JWT with the service account key (pure
   * crypto — no extra dependency), then read the values range.
   */
  private async fetchGsheetApiRows(config: {
    spreadsheetId?: string;
    range?: string;
    clientEmail?: string;
    privateKey?: string;
  }): Promise<ProductRow[]> {
    const { spreadsheetId, clientEmail, privateKey } = config;
    const range = config.range || 'A:Z';
    if (!spreadsheetId || !clientEmail || !privateKey) {
      throw new BadRequestException('spreadsheetId, clientEmail, privateKey wajib untuk gsheet_api');
    }

    const token = await this.googleAccessToken(clientEmail, decryptSecret(privateKey));
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { authorization: `Bearer ${token}` },
      });
    } catch (err) {
      throw new Error(`Gagal mengambil sheet API: ${err instanceof Error ? err.message : err}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Sheets API status ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
    }
    const data = (await res.json()) as { values?: unknown[][] };
    const values = Array.isArray(data.values) ? data.values : [];
    if (values.length < 2) return [];

    const headers = (values[0] as unknown[]).map((h) => String(h ?? ''));
    const rows: ProductRow[] = [];
    for (let i = 1; i < values.length; i++) {
      const cells = values[i] as unknown[];
      const record: Record<string, unknown> = {};
      headers.forEach((h, idx) => { record[h] = cells[idx]; });
      const mapped = mapRecordToProduct(record);
      if (mapped) rows.push(mapped);
    }
    return rows;
  }

  /** Mint a Google OAuth2 access token from a service account (JWT-bearer flow). */
  private async googleAccessToken(clientEmail: string, privateKeyRaw: string): Promise<string> {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const signingInput = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    let signature: string;
    try {
      signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey).toString('base64url');
    } catch {
      throw new BadRequestException('Private key service account tidak valid');
    }
    const assertion = `${signingInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Auth Google gagal (${res.status})${body ? `: ${body.slice(0, 160)}` : ''}`);
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error('Token Google kosong');
    return json.access_token;
  }

  // ── Bot integration ───────────────────────────────────────────────────────

  /**
   * Active products relevant to a customer query, for prompt injection.
   * Token-overlap match over name/sku (strong) + category/description (weak),
   * with digit↔letter splitting and stopword removal so "klem ukuran 8" finds
   * "Klem 8mm". No fabrication — the bot only ever sees real synced stock.
   */
  async relevantForQuery(query: string, limit = 8) {
    const queryTokens = tokenizeForMatch(query);
    if (queryTokens.size === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const scored = products
      .map((p) => ({ p, score: scoreProductMatch(p, queryTokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((x) => x.p);
  }
}
