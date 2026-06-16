import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Client } from 'pg';
import { assertSafeMediaUrl } from '../../common/media-url.util';
import { logAudit } from '../../common/audit.util';
import {
  assertReadOnlySelect,
  mapRecordToProduct,
  maskConnString,
  parseProductCsv,
  ProductRow,
} from './products.util';

const FETCH_TIMEOUT_MS = 15_000;
const FETCH_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async update(id: string, data: { stock?: number; price?: number; status?: string; description?: string }) {
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
      const config = (s.config ?? {}) as Record<string, unknown>;
      if (typeof config.connectionString === 'string') {
        return { ...s, config: { ...config, connectionString: maskConnString(config.connectionString) } };
      }
      return s;
    });
  }

  async createSource(dto: {
    type: string;
    name: string;
    url?: string;
    connectionString?: string;
    query?: string;
  }) {
    if (dto.type === 'gsheet_csv') {
      if (!dto.url) throw new BadRequestException('url wajib untuk gsheet_csv');
      assertSafeMediaUrl(dto.url); // SSRF guard: https/http only, no private hosts
      return this.prisma.productSource.create({
        data: { type: dto.type, name: dto.name, config: { url: dto.url } },
      });
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
          config: { connectionString: dto.connectionString, query: dto.query },
        },
      });
    }
    throw new BadRequestException('Tipe sumber tidak didukung (gsheet_csv | postgres).');
  }

  async deleteSource(id: string) {
    const s = await this.prisma.productSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Source not found');
    await this.prisma.productSource.delete({ where: { id } });
    return { ok: true };
  }

  /** Re-sync a configured source (Google Sheet CSV or external Postgres). */
  async syncSource(id: string, userId: string) {
    const source = await this.prisma.productSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source not found');

    let rows: ProductRow[];
    try {
      rows = source.type === 'postgres'
        ? await this.fetchPostgresRows(source.config as { connectionString: string; query: string })
        : await this.fetchSheetRows(source.config as { url?: string });
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

    const client = new Client({
      connectionString: config.connectionString,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 15_000,
      // Supabase/managed PG usually require TLS; allow it without pinning a CA.
      ssl: /supabase|sslmode=require/i.test(config.connectionString) ? { rejectUnauthorized: false } : undefined,
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

  // ── Bot integration ───────────────────────────────────────────────────────

  /**
   * Active products relevant to a customer query, for prompt injection. Pure
   * keyword overlap (name/category/sku) — no fabrication; the bot only ever
   * sees real synced stock.
   */
  async relevantForQuery(query: string, limit = 8) {
    const products = await this.prisma.product.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const terms = Array.from(
      new Set(
        (query ?? '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2),
      ),
    );
    if (terms.length === 0) return [];
    const scored = products
      .map((p) => {
        const hay = `${p.name} ${p.category ?? ''} ${p.sku}`.toLowerCase();
        const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((x) => x.p);
  }
}
