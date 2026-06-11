-- Business hours / auto-away, CSAT, and custom conversation labels.

-- Business hours + away message on the WhatsApp account.
ALTER TABLE "whatsapp_accounts" ADD COLUMN "business_hours_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "business_hours_start" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "business_hours_end" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "business_days" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];
ALTER TABLE "whatsapp_accounts" ADD COLUMN "business_timezone" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "away_message" TEXT;

-- Conversation labels, auto-away throttle, and CSAT result.
ALTER TABLE "conversations" ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "conversations" ADD COLUMN "last_away_at" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN "csat_score" INTEGER;
ALTER TABLE "conversations" ADD COLUMN "csat_requested_at" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN "csat_responded_at" TIMESTAMP(3);
