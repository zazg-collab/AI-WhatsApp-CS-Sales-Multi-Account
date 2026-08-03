import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  CreateKnowledgeItemDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto';
import {
  CHUNK_CHARS,
  chunkText,
  extractFromFile,
  htmlTitle,
  htmlToText,
} from './document-extract.util';
import { assertSafeMediaUrl } from '../../common/media-url.util';
import { logAudit } from '../../common/audit.util';
import { KnowledgeIndexService } from '../ai/knowledge-index.service';

const URL_FETCH_TIMEOUT_MS = 15_000;
const URL_MAX_BYTES = 5 * 1024 * 1024;
/** Bound the manual redirect chain so each hop can be SSRF-re-validated. */
const MAX_URL_REDIRECTS = 5;
/** Cap on the content preview returned by the dry-run parse endpoints. */
const PREVIEW_MAX_CHARS = 12_000;

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeIndex: KnowledgeIndexService,
  ) {}

  /**
   * Fire-and-forget embedding refresh for an item. Never awaited by the CRUD
   * path so a slow/failing embedding provider can't block knowledge edits;
   * KnowledgeIndexService swallows its own errors.
   */
  private indexInBackground(id: string): void {
    void this.knowledgeIndex.indexItem(id);
  }

  listBases() {
    return this.prisma.knowledgeBase.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
  }

  createBase(dto: CreateKnowledgeBaseDto, userId: string) {
    return this.prisma.knowledgeBase.create({
      data: { ...dto, createdById: userId },
    });
  }

  async getBase(id: string) {
    const base = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: { items: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!base) throw new NotFoundException('Knowledge base not found');
    return base;
  }

  /**
   * Rebuild embeddings for every active item in a base. Awaited (unlike the
   * per-item background indexing) so the admin gets a count back. No-op when
   * embeddings are disabled.
   */
  async reindex(id: string) {
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!base) throw new NotFoundException('Knowledge base not found');
    if (!(await this.knowledgeIndex.enabled())) {
      return { enabled: false, reindexed: 0 };
    }
    const reindexed = await this.knowledgeIndex.reindexBase(id);
    return { enabled: true, reindexed };
  }

  // >>> ANGGA: reindex SEMUA knowledge base sekaligus. Dibutuhkan tombol
  // "Bangun ulang indeks" di /settings/ai — sesudah RAG dinyalakan, item lama
  // belum punya embedding, dan upstream cuma menyediakan reindex per-base
  // (yang bahkan tidak punya pemanggil di frontend) atau skrip CLI kb:reindex.
  async reindexAll() {
    if (!(await this.knowledgeIndex.enabled())) {
      return { enabled: false, bases: 0, reindexed: 0 };
    }
    const bases = await this.prisma.knowledgeBase.findMany({ select: { id: true } });
    let reindexed = 0;
    for (const base of bases) {
      reindexed += await this.knowledgeIndex.reindexBase(base.id);
    }
    return { enabled: true, bases: bases.length, reindexed };
  }
  // <<< ANGGA

  updateBase(id: string, dto: UpdateKnowledgeBaseDto, userId: string) {
    return this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.status === 'active' ? { approvedById: userId } : {}),
      },
    });
  }

  async deleteBase(id: string) {
    // Items cascade-delete via the schema's onDelete: Cascade relation.
    return this.prisma.knowledgeBase.delete({ where: { id } });
  }

  /**
   * Create a manually-entered item. Long pastes are auto-chunked (same
   * CHUNK_CHARS boundary as file/URL ingest) so one item never becomes a
   * multi-topic blob that blurs retrieval and bloats every prompt it's
   * injected into — see chunkText(). Short content (the common case) is
   * unaffected: exactly one item, same as before.
   */
  async addItem(baseId: string, dto: CreateKnowledgeItemDto) {
    const shared = {
      knowledgeBaseId: baseId,
      category: dto.category,
      productName: dto.productName,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      status: dto.status,
    };

    if (dto.content.length <= CHUNK_CHARS) {
      const item = await this.prisma.knowledgeItem.create({
        data: { ...shared, title: dto.title, content: dto.content },
      });
      this.indexInBackground(item.id);
      return item;
    }

    const chunks = chunkText(dto.content);
    const items = [];
    for (let i = 0; i < chunks.length; i++) {
      const title = `${dto.title} (bagian ${i + 1}/${chunks.length})`;
      const created = await this.prisma.knowledgeItem.create({
        data: { ...shared, title, content: chunks[i] },
      });
      this.indexInBackground(created.id);
      items.push(created);
    }
    return items;
  }

  async updateItem(id: string, dto: UpdateKnowledgeItemDto) {
    const item = await this.prisma.knowledgeItem.update({
      where: { id },
      data: {
        ...dto,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });
    // Content may have changed → re-embed (indexItem skips if hash unchanged).
    this.indexInBackground(item.id);
    return item;
  }

  async deleteItem(id: string) {
    return this.prisma.knowledgeItem.delete({ where: { id } });
  }

  /**
   * Ingest an uploaded document (pdf/docx/xlsx/csv/txt/md/html): extract its
   * text and store it as active knowledge items, chunked so one large file
   * becomes several prompt-sized items.
   */
  async ingestFile(
    baseId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
    userId: string,
  ) {
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id: baseId } });
    if (!base) throw new NotFoundException('Knowledge base not found');

    const filename = file.originalname ?? 'dokumen';
    const { text, kind } = await extractFromFile(file.buffer, filename, file.mimetype);
    if (!text) {
      throw new BadRequestException(
        'Tidak ada teks yang bisa diekstrak dari file ini (mungkin hasil scan/gambar)',
      );
    }

    const items = await this.createChunkedItems(baseId, filename, text, kind);
    await logAudit(this.prisma, {
      userId,
      action: 'knowledge_ingest_file',
      entityType: 'knowledge_base',
      entityId: baseId,
      newValue: { filename, kind, items: items.length, chars: text.length },
    });
    return { source: filename, kind, chars: text.length, items };
  }

  /**
   * Ingest a public web page: fetch it (SSRF-guarded, size/time capped),
   * strip it to readable text, and store as active knowledge items.
   */
  /**
   * Fetch a public URL (SSRF-guarded, size/time capped) and extract readable
   * text. Shared by ingestUrl (commit) and parseUrl (dry-run preview).
   */
  private async fetchAndExtractUrl(url: string): Promise<{ sourceTitle: string; text: string; kind: string }> {
    // Same SSRF rules as media fetching: https/http only, no private ranges.
    assertSafeMediaUrl(url);

    // Follow redirects manually so every hop is re-validated. With
    // redirect:'follow', an attacker-controlled public host can 302 to
    // http://169.254.169.254/... and the initial assertSafeMediaUrl above would
    // never see the final (internal) target — the classic SSRF redirect bypass.
    let res: Response;
    let currentUrl = url;
    try {
      for (let hop = 0; ; hop++) {
        if (hop > MAX_URL_REDIRECTS) {
          throw new BadRequestException('Terlalu banyak pengalihan (redirect) URL');
        }
        res = await fetch(currentUrl, {
          signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
          headers: { 'user-agent': 'HermesKnowledgeBot/1.0' },
          redirect: 'manual',
        });
        if (res.status < 300 || res.status >= 400) break;
        const location = res.headers.get('location');
        if (!location) break;
        // Resolve relative redirects against the current URL, then re-check.
        currentUrl = new URL(location, currentUrl).toString();
        assertSafeMediaUrl(currentUrl);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Gagal mengambil URL (timeout / tidak terjangkau)');
    }
    if (!res.ok) {
      throw new BadRequestException(`URL mengembalikan status ${res.status}`);
    }

    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > URL_MAX_BYTES) {
      throw new BadRequestException('Halaman terlalu besar (maks 5MB)');
    }

    const contentType = res.headers.get('content-type') ?? '';
    const parsedUrl = new URL(url);
    const urlName = decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() ?? parsedUrl.hostname);

    if (contentType.toLowerCase().includes('html') || /\.html?$/i.test(parsedUrl.pathname) || !urlName.includes('.')) {
      const html = raw.toString('utf8');
      return { text: htmlToText(html), kind: 'website', sourceTitle: htmlTitle(html) ?? parsedUrl.hostname };
    }
    const extracted = await extractFromFile(raw, urlName, contentType);
    return { text: extracted.text, kind: extracted.kind, sourceTitle: urlName };
  }

  async ingestUrl(baseId: string, url: string, userId: string) {
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id: baseId } });
    if (!base) throw new NotFoundException('Knowledge base not found');

    const { sourceTitle, text, kind } = await this.fetchAndExtractUrl(url);
    if (!text) throw new BadRequestException('Tidak ada teks terbaca dari sumber ini');

    const items = await this.createChunkedItems(baseId, sourceTitle, text, kind, url);
    await logAudit(this.prisma, {
      userId,
      action: 'knowledge_ingest_url',
      entityType: 'knowledge_base',
      entityId: baseId,
      newValue: { url, kind, items: items.length, chars: text.length },
    });
    return { source: url, kind, chars: text.length, items };
  }

  /**
   * Dry-run parse of an uploaded file — extracts text WITHOUT persisting so the
   * UI can pre-fill the add-item form (title from filename, content preview)
   * for the user to review/trim before saving (action-first).
   */
  async parseFile(file: { buffer: Buffer; originalname?: string; mimetype?: string }) {
    const filename = file.originalname ?? 'dokumen';
    const { text, kind } = await extractFromFile(file.buffer, filename, file.mimetype);
    if (!text) {
      throw new BadRequestException(
        'Tidak ada teks yang bisa diekstrak dari file ini (mungkin hasil scan/gambar)',
      );
    }
    const title = filename.replace(/\.[^.]+$/, '').trim() || filename;
    return {
      title,
      content: text.slice(0, PREVIEW_MAX_CHARS),
      kind,
      chars: text.length,
      truncated: text.length > PREVIEW_MAX_CHARS,
    };
  }

  /** Dry-run parse of a public URL — same contract as parseFile. */
  async parseUrl(url: string) {
    const { sourceTitle, text, kind } = await this.fetchAndExtractUrl(url);
    if (!text) throw new BadRequestException('Tidak ada teks terbaca dari sumber ini');
    return {
      title: sourceTitle,
      content: text.slice(0, PREVIEW_MAX_CHARS),
      kind,
      chars: text.length,
      truncated: text.length > PREVIEW_MAX_CHARS,
      source: url,
    };
  }

  /** Store extracted text as one or more active knowledge items. */
  private async createChunkedItems(
    baseId: string,
    sourceName: string,
    text: string,
    kind: string,
    sourceUrl?: string,
  ) {
    const chunks = chunkText(text);
    const items = [];
    for (let i = 0; i < chunks.length; i++) {
      const suffix = chunks.length > 1 ? ` (bagian ${i + 1}/${chunks.length})` : '';
      const header = sourceUrl ? `Sumber: ${sourceUrl}\n\n` : '';
      const created = await this.prisma.knowledgeItem.create({
        data: {
          knowledgeBaseId: baseId,
          title: `${sourceName}${suffix}`,
          content: `${header}${chunks[i]}`,
          category: kind,
          status: 'active',
        },
      });
      this.indexInBackground(created.id);
      items.push(created);
    }
    return items;
  }
}
