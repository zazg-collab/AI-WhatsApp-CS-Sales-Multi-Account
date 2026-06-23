-- Add ISO 4217 currency code to products.
-- Existing rows get NULL (unknown) — the app falls back to bot.language locale.
-- (Re-added here, after `19_products` creates the table; see `11_product_currency`
-- for why the original copy of this migration was neutralized to a no-op.)
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "currency" TEXT;
