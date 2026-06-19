-- Hermes auto-learn (P1): mine a conversation for KB/customer-memory proposals
-- when it is resolved. Both columns are nullable and additive.

-- Idempotency guard: skip conversations already mined.
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "learned_at" TIMESTAMP(3);

-- Source trace: which conversation a proposal was mined from.
ALTER TABLE "learning_proposals"
  ADD COLUMN IF NOT EXISTS "conversation_id" TEXT;
