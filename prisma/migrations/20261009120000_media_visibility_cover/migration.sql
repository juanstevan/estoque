-- Who may see a file outside the app. Nothing is shared until someone chooses to.
ALTER TABLE "ProductPhoto" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'internal';
-- "cover": the file is the cover of the brand, category, family or tag the link points to.
ALTER TABLE "MediaLink" ADD COLUMN IF NOT EXISTS "role" TEXT;
