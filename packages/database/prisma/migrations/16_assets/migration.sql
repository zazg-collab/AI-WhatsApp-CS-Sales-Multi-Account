-- Curated reusable media library: brochures, product cards (image + link),
-- and testimonials the bot/admin can send. Files are uploaded once and reused.
CREATE TABLE "assets" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "caption" TEXT,
  "storage_key" TEXT NOT NULL,
  "media_url" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "marketplace_url" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "trigger_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assets_purpose_idx" ON "assets"("purpose");
CREATE INDEX "assets_status_idx" ON "assets"("status");

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
