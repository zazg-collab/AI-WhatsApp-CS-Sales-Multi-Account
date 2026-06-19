import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

export interface RetrievedKnowledge {
  id: string;
  title: string;
  productName: string | null;
  content: string;
}

/** Postgres vector literal: `[0.1,0.2,...]`. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/** Stable fingerprint of the embedded text; lets re-index skip unchanged rows. */
function contentHash(model: string, title: string, content: string): string {
  return createHash('sha256').update(`${model}\n${title}\n${content}`).digest('hex');
}

/**
 * Writes and reads knowledge-item embeddings (pgvector). Centralises all raw
 * vector SQL so both the write path (KnowledgeService on create/update) and the
 * read path (PromptBuilderService on retrieval) share one implementation.
 *
 * All methods are safe no-ops when embeddings are disabled, so callers never
 * need to guard — the keyword fallback in PromptBuilderService takes over.
 */
@Injectable()
export class KnowledgeIndexService {
  private readonly logger = new Logger(KnowledgeIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  enabled(): Promise<boolean> {
    return this.embeddings.enabled();
  }

  /** Build the text we embed for an item (title + product + content). */
  private embedText(item: { title: string; productName?: string | null; content: string }): string {
    return `${item.title}${item.productName ? ` (${item.productName})` : ''}\n${item.content}`;
  }

  /**
   * Embed and persist a single item's vector. Best-effort: logs and swallows
   * failures so a flaky embedding provider never breaks knowledge CRUD.
   * Skips the network call when the content hash is unchanged.
   */
  async indexItem(id: string): Promise<void> {
    if (!(await this.embeddings.enabled())) return;
    try {
      const item = await this.prisma.knowledgeItem.findUnique({
        where: { id },
        select: { id: true, title: true, productName: true, content: true, contentHash: true },
      });
      if (!item) return;

      const model = await this.embeddings.modelName();
      const hash = contentHash(model, item.title, item.content);
      if (item.contentHash === hash) return; // unchanged — embedding still valid

      const vec = await this.embeddings.embedOne(this.embedText(item));
      await this.prisma.$executeRawUnsafe(
        `UPDATE "knowledge_items" SET "embedding" = $1::vector, "embedding_model" = $2, "content_hash" = $3 WHERE "id" = $4`,
        toVectorLiteral(vec),
        model,
        hash,
        id,
      );
    } catch (err) {
      this.logger.warn(`indexItem(${id}) failed (non-fatal): ${err}`);
    }
  }

  /** Index many items sequentially (used by the reindex script). */
  async indexMany(ids: string[]): Promise<void> {
    for (const id of ids) await this.indexItem(id);
  }

  /**
   * Re-embed every active item in a base whose content changed (or never
   * embedded). Returns the count actually re-embedded.
   */
  async reindexBase(knowledgeBaseId: string): Promise<number> {
    if (!(await this.embeddings.enabled())) return 0;
    const items = await this.prisma.knowledgeItem.findMany({
      where: { knowledgeBaseId, status: 'active' },
      select: { id: true },
    });
    let n = 0;
    for (const { id } of items) {
      const before = await this.prisma.knowledgeItem.findUnique({ where: { id }, select: { contentHash: true } });
      await this.indexItem(id);
      const after = await this.prisma.knowledgeItem.findUnique({ where: { id }, select: { contentHash: true } });
      if (before?.contentHash !== after?.contentHash) n++;
    }
    return n;
  }

  /**
   * Semantic top-K over a base's active, in-window items. Returns [] when
   * embeddings are disabled or no item is embedded yet, so the caller falls
   * back to keyword retrieval.
   */
  async search(knowledgeBaseId: string, query: string, limit: number): Promise<RetrievedKnowledge[]> {
    if (!query || !(await this.embeddings.enabled())) return [];
    let vec: number[];
    try {
      vec = await this.embeddings.embedOne(query);
    } catch (err) {
      this.logger.warn(`search embed failed, falling back to keyword: ${err}`);
      return [];
    }
    try {
      const rows = await this.prisma.$queryRawUnsafe<RetrievedKnowledge[]>(
        `SELECT "id", "title", "product_name" AS "productName", "content"
         FROM "knowledge_items"
         WHERE "knowledge_base_id" = $1
           AND "status" = 'active'
           AND ("valid_until" IS NULL OR "valid_until" >= now())
           AND "embedding" IS NOT NULL
         ORDER BY "embedding" <=> $2::vector
         LIMIT $3`,
        knowledgeBaseId,
        toVectorLiteral(vec),
        limit,
      );
      return rows;
    } catch (err) {
      this.logger.warn(`vector search failed, falling back to keyword: ${err}`);
      return [];
    }
  }
}
