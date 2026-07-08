-- Rebrand the in-app supervisor module "Hermes" -> "Sentinel" (kept distinct
-- from the Hermes Agent / Nous Research CLI integration, which is unaffected).

ALTER TYPE "HermesDecision" RENAME TO "SentinelDecision";

-- Renaming an enum value relabels existing rows in place — no data backfill needed.
ALTER TYPE "SenderType" RENAME VALUE 'hermes' TO 'sentinel';

ALTER TABLE "hermes_reviews" RENAME TO "sentinel_reviews";

ALTER TABLE "messages" RENAME COLUMN "hermes_review_id" TO "sentinel_review_id";
