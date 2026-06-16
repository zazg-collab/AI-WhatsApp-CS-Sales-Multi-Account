import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSafeMediaUrl } from '../../common/media-url.util';
import { logAudit } from '../../common/audit.util';
import { parseProductCsv, ProductRow } from './products.util';

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

  listSources() {
    return this.prisma.productSource.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createSource(dto: { type: string; name: string; url: string }) {
    if (dto.type !== 'gsheet_csv') {
      throw new BadRequestException('Sumber yang didukung saat ini: gsheet_csv (link publish-to-web CSV).');
    }
    assertSafeMediaUrl(dto.url); // SSRF guard: https/http only, no private hosts
    return this.prisma.productSource.create({
      data: { type: dto.type, name: dto.name, config: { url: dto.url } },
    });
  }

  async deleteSource(id: string) {
    const s = await this.prisma.productSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Source not found');
    await this.prisma.productSource.delete({ where: { id } });
    return { ok: true };
  }

  /** Fetch a published-CSV Google Sheet and upsert its rows. */
  async syncSource(id: string, userId: string) {
    const source = await this.prisma.productSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source not found');
    const url = (source.config as { url?: string })?.url;
    if (!url) throw new BadRequestException('Source has no URL configured');
    assertSafeMediaUrl(url);

    let text: string;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
        headers: { 'user-agent': 'HermesProductSync/1.0' },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const raw = Buffer.from(await res.arrayBuffer());
      if (raw.length > FETCH_MAX_BYTES) throw new Error('file too large (max 5MB)');
      text = raw.toString('utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.productSource.update({
        where: { id },
        data: { lastSyncedAt: new Date(), lastResult: `Gagal: ${msg}` },
      });
      throw new BadRequestException(`Gagal mengambil sheet: ${msg}`);
    }

    const rows = parseProductCsv(text);
    if (rows.length === 0) {
      await this.prisma.productSource.update({
        where: { id },
        data: { lastSyncedAt: new Date(), lastResult: 'Tidak ada baris valid' },
      });
      throw new BadRequestException('Tidak ada baris produk valid di sheet (perlu kolom sku & nama).');
    }
    const { upserted } = await this.upsertRows(rows, `gsheet:${id}`);
    await this.prisma.productSource.update({
      where: { id },
      data: { lastSyncedAt: new Date(), lastResult: `OK: ${upserted} produk` },
    });
    await logAudit(this.prisma, {
      userId,
      action: 'product_sync_source',
      entityType: 'product_source',
      entityId: id,
      newValue: { upserted },
    });
    return { upserted, parsed: rows.length };
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
