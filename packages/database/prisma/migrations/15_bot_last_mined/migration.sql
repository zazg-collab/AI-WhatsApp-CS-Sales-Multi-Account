-- Track the last AI Learning mining run per bot so re-runs can skip the
-- transcript miners when there are no new messages since.
ALTER TABLE "bots" ADD COLUMN "last_mined_at" TIMESTAMP(3);
