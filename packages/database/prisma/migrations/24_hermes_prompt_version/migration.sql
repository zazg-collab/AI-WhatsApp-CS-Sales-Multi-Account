-- Audit #5: track which Hermes prompt version produced each review.
ALTER TABLE "hermes_reviews" ADD COLUMN "prompt_version" TEXT;
