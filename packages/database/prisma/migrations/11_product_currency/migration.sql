-- Add ISO 4217 currency code to products.
-- Existing rows get NULL (unknown) — the app falls back to bot.language locale.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "currency" TEXT;
