-- Corrects drift left by earlier hand-written migrations that renamed a
-- table/column but not the dependent constraints/indexes Postgres leaves
-- behind, or used a column type/DB-level default that doesn't match what a
-- bare Prisma field (`DateTime`, `@default(uuid())`, `@updatedAt`) expects.
-- Every statement below is a rename, default-drop, or same-instant type cast
-- (explicit UTC, matching how every other DateTime column in this schema is
-- stored) — none of them delete or reinterpret existing row data.

-- 25_sentinel_rename renamed "hermes_reviews" -> "sentinel_reviews" and
-- "messages.hermes_review_id" -> "sentinel_review_id", but Postgres does not
-- cascade-rename the constraints/indexes tied to the old names.
ALTER TABLE "sentinel_reviews" RENAME CONSTRAINT "hermes_reviews_pkey" TO "sentinel_reviews_pkey";
ALTER TABLE "sentinel_reviews" RENAME CONSTRAINT "hermes_reviews_bot_id_fkey" TO "sentinel_reviews_bot_id_fkey";
ALTER TABLE "sentinel_reviews" RENAME CONSTRAINT "hermes_reviews_conversation_id_fkey" TO "sentinel_reviews_conversation_id_fkey";
ALTER INDEX "hermes_reviews_conversation_id_idx" RENAME TO "sentinel_reviews_conversation_id_idx";

ALTER TABLE "messages" RENAME CONSTRAINT "messages_hermes_review_id_fkey" TO "messages_sentinel_review_id_fkey";
ALTER INDEX "messages_hermes_review_id_key" RENAME TO "messages_sentinel_review_id_key";

-- 30_wa_channels hand-picked index names and used TIMESTAMPTZ instead of the
-- bare-DateTime default TIMESTAMP(3); it also gave `updated_at` a DB-level
-- default even though @updatedAt is applied client-side by Prisma.
ALTER INDEX "idx_wa_channels_account" RENAME TO "wa_channels_whatsapp_account_id_idx";
ALTER INDEX "wa_channels_account_channel_key" RENAME TO "wa_channels_whatsapp_account_id_channel_id_key";
ALTER TABLE "wa_channels" ALTER COLUMN "created_at" TYPE TIMESTAMP(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "wa_channels" ALTER COLUMN "updated_at" TYPE TIMESTAMP(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "wa_channels" ALTER COLUMN "updated_at" DROP DEFAULT;
-- ...and the inline REFERENCES in 30_wa_channels didn't specify ON UPDATE
-- CASCADE, which the `@relation` in schema.prisma implies by default.
ALTER TABLE "wa_channels" DROP CONSTRAINT "wa_channels_whatsapp_account_id_fkey";
ALTER TABLE "wa_channels" ADD CONSTRAINT "wa_channels_whatsapp_account_id_fkey"
  FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 27_conversation_crm_fields / 29_conversation_sentiment used TIMESTAMPTZ for
-- what schema.prisma declares as a bare `DateTime?` (TIMESTAMP(3)).
ALTER TABLE "conversations" ALTER COLUMN "first_response_at" TYPE TIMESTAMP(3) USING "first_response_at" AT TIME ZONE 'UTC';
ALTER TABLE "conversations" ALTER COLUMN "resolved_at" TYPE TIMESTAMP(3) USING "resolved_at" AT TIME ZONE 'UTC';
ALTER TABLE "conversations" ALTER COLUMN "sentiment_at" TYPE TIMESTAMP(3) USING "sentiment_at" AT TIME ZONE 'UTC';

-- 26_webhook_endpoints gave `id` a DB-level default; Prisma's
-- `@default(uuid())` is generated client-side, so the DB default is
-- redundant drift, not a needed fallback (Prisma always sends an explicit id).
ALTER TABLE "webhook_endpoints" ALTER COLUMN "id" DROP DEFAULT;
