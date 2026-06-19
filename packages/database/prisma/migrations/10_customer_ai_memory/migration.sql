-- Migration: add ai_memory column to customers table
-- Stores AI-generated customer context facts (approved via Learning module).
-- Kept separate from admin `notes` so it can be safely injected into the AI prompt.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ai_memory" TEXT;
