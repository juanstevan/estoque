-- Tag may already exist from an earlier experiment. Keep that table and add color.
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "color" TEXT NOT NULL DEFAULT '#64748b';

CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_key" ON "Tag"("name");

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tagId" TEXT;

CREATE INDEX IF NOT EXISTS "Product_tagId_idx" ON "Product"("tagId");

CREATE TABLE IF NOT EXISTS "MediaLink" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "productId" TEXT,
    "tagId" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "family" TEXT,
    CONSTRAINT "MediaLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MediaLink_photoId_idx" ON "MediaLink"("photoId");
CREATE INDEX IF NOT EXISTS "MediaLink_productId_idx" ON "MediaLink"("productId");
CREATE INDEX IF NOT EXISTS "MediaLink_tagId_idx" ON "MediaLink"("tagId");

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "ProductPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
