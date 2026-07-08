-- Semantic retrieval for knowledge items (pgvector).
-- Dimension 1536 matches text-embedding-3-small / most OpenAI-compatible
-- embedding models. If you configure AI_EMBED_DIM to a different size, change
-- the vector(N) below to match and rebuild the index.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "knowledge_items"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536),
  ADD COLUMN IF NOT EXISTS "embedding_model" TEXT,
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT;

-- Cosine-distance ANN index. HNSW gives good recall without a training step.
CREATE INDEX IF NOT EXISTS "knowledge_items_embedding_idx"
  ON "knowledge_items"
  USING hnsw ("embedding" vector_cosine_ops);
