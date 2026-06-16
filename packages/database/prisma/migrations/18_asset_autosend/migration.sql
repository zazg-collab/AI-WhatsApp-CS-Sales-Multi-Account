-- Opt-in whitelist for bot auto-sending an asset under ai_on. Off by default;
-- also gated globally by the ASSET_AUTOSEND_ENABLED env flag.
ALTER TABLE "assets" ADD COLUMN "auto_send" BOOLEAN NOT NULL DEFAULT false;
