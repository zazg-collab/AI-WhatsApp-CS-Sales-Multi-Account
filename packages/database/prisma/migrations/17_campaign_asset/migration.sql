-- Optional media asset for a campaign broadcast (image/video/document). The
-- campaign messageTemplate becomes the caption when an asset is attached.
ALTER TABLE "campaigns" ADD COLUMN "asset_id" TEXT;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
