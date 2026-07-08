CREATE TABLE IF NOT EXISTS "wa_channels" (
  "id"                  TEXT PRIMARY KEY,
  "whatsapp_account_id" TEXT NOT NULL REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE,
  "channel_id"          TEXT NOT NULL,
  "name"                TEXT,
  "description"         TEXT,
  "is_following"         BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "wa_channels_account_channel_key"
  ON "wa_channels" ("whatsapp_account_id", "channel_id");

CREATE INDEX IF NOT EXISTS "idx_wa_channels_account"
  ON "wa_channels" ("whatsapp_account_id");
