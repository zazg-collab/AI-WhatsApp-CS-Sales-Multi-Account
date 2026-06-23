-- WhatsApp-native features: reactions, edit/delete, customer avatar.
ALTER TABLE "messages" ADD COLUMN "reactions" JSONB;
ALTER TABLE "messages" ADD COLUMN "edited_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "customers" ADD COLUMN "avatar_url" TEXT;
