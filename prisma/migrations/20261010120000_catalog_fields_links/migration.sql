-- Who sees each catalog field: on the Tag (a model), and on a product without a Tag.
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "catalogFields" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "catalogFields" TEXT NOT NULL DEFAULT '{}';

-- Shareable brand catalogs (builders first).
CREATE TABLE IF NOT EXISTS "CatalogLink" (
  "token" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'partners',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "CatalogLink_pkey" PRIMARY KEY ("token")
);
CREATE INDEX IF NOT EXISTS "CatalogLink_brand_audience_idx" ON "CatalogLink"("brand", "audience");
