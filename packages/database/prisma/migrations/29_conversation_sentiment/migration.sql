ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "sentiment_label" TEXT,
  ADD COLUMN IF NOT EXISTS "sentiment_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "sentiment_at"    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "idx_conversations_sentiment_at"
  ON "conversations" ("sentiment_at" DESC)
  WHERE "sentiment_at" IS NOT NULL;
