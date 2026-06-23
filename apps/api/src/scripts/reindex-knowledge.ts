/**
 * Backfill / rebuild semantic embeddings for all active knowledge items.
 *
 *   npm run kb:reindex --workspace=@hermes/api
 *
 * Safe to run repeatedly: KnowledgeIndexService skips items whose content hash
 * is unchanged. No-op (exits 0) when AI_EMBED_MODEL is not configured.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeIndexService } from '../modules/ai/knowledge-index.service';

async function main() {
  const logger = new Logger('kb:reindex');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const index = app.get(KnowledgeIndexService);
    if (!(await index.enabled())) {
      logger.warn('AI_EMBED_MODEL not set — embeddings disabled, nothing to do.');
      return;
    }
    const prisma = app.get(PrismaService);
    const bases = await prisma.knowledgeBase.findMany({ select: { id: true, name: true } });
    let total = 0;
    for (const base of bases) {
      const n = await index.reindexBase(base.id);
      total += n;
      logger.log(`Reindexed ${n} item(s) in "${base.name}" (${base.id}).`);
    }
    logger.log(`Done. ${total} item(s) re-embedded across ${bases.length} base(s).`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
