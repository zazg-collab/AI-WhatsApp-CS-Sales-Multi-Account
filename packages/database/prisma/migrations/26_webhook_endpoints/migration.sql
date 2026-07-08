CREATE TABLE "webhook_endpoints" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "url"        TEXT NOT NULL,
  "secret"     TEXT NOT NULL,
  "events"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);
