-- AI-mined learning proposals (knowledge / persona / customer_memory / playbook)
-- derived from synced conversation history. Everything lands as `pending` for
-- human review; approval materializes into the live tables.
CREATE TABLE "learning_proposals" (
  "id" TEXT NOT NULL,
  "bot_id" TEXT,
  "customer_id" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "source_message_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source_summary" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "result_entity_id" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learning_proposals_status_idx" ON "learning_proposals"("status");
CREATE INDEX "learning_proposals_bot_id_idx" ON "learning_proposals"("bot_id");
CREATE INDEX "learning_proposals_type_idx" ON "learning_proposals"("type");

ALTER TABLE "learning_proposals"
  ADD CONSTRAINT "learning_proposals_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "bots"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_proposals"
  ADD CONSTRAINT "learning_proposals_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_proposals"
  ADD CONSTRAINT "learning_proposals_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
