-- A17: PR #5 added customer opt-out fields to the schema without a migration —
-- a fresh deploy would boot a Prisma client expecting columns that don't exist
-- (every inbound message would then fail with P2022).
ALTER TABLE "customers" ADD COLUMN "opted_out" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "opted_out_at" TIMESTAMP(3);

-- Align migration 2 with the schema so `prisma migrate diff` runs clean and the
-- CI drift gate can be made blocking: the schema declares deleted_at as
-- TIMESTAMP(3) and has no index on it.
ALTER TABLE "users" ALTER COLUMN "deleted_at" TYPE TIMESTAMP(3);
DROP INDEX IF EXISTS "idx_users_deleted_at";
