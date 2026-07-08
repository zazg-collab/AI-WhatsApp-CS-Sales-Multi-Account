-- Persist WhatsApp mirror state that can change from either the app or phone.
ALTER TABLE "conversations" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "is_muted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "mute_until" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "disappearing_duration" INTEGER;
ALTER TABLE "conversations" ADD COLUMN "disappearing_set_at" TIMESTAMP(3);

ALTER TABLE "messages" ADD COLUMN "is_starred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "is_forwarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "receipt_details" JSONB;
ALTER TABLE "messages" ADD COLUMN "raw_wa_payload" JSONB;
ALTER TABLE "messages" ADD COLUMN "wa_message_type" TEXT;
