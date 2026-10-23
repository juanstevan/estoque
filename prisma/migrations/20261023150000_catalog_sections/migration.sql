CREATE TABLE "CatalogSection" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "family" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CatalogSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogSection_scope_brand_category_family_key" ON "CatalogSection"("scope", "brand", "category", "family");

ALTER TABLE "CatalogText" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "MediaLink" ADD COLUMN "sectionId" TEXT;

-- Adopt descriptions and media already attached to named sections.
INSERT INTO "CatalogSection" ("id", "scope", "brand", "category", "family")
SELECT 'section_' || md5(scope || ':' || length(brand)::text || ':' || brand || ':' || length(category)::text || ':' || category || ':' || length(family)::text || ':' || family),
       scope, brand, category, family
FROM (
    SELECT DISTINCT CASE WHEN NULLIF("family", '') IS NULL THEN 'category' ELSE 'family' END AS scope,
           "brand" AS brand, "category" AS category, COALESCE("family", '') AS family
    FROM "CatalogText"
    WHERE "brand" IS NOT NULL AND "category" IS NOT NULL AND "tagId" IS NULL AND "productId" IS NULL
    UNION
    SELECT DISTINCT CASE WHEN NULLIF("family", '') IS NULL THEN 'category' ELSE 'family' END AS scope,
           "brand" AS brand, "category" AS category, COALESCE("family", '') AS family
    FROM "MediaLink"
    WHERE "brand" IS NOT NULL AND "category" IS NOT NULL AND "tagId" IS NULL AND "productId" IS NULL
) AS existing;

UPDATE "CatalogText" AS text
SET "sectionId" = section."id"
FROM "CatalogSection" AS section
WHERE text."brand" = section."brand" AND text."category" = section."category"
  AND COALESCE(text."family", '') = section."family"
  AND (CASE WHEN NULLIF(text."family", '') IS NULL THEN 'category' ELSE 'family' END) = section."scope"
  AND text."tagId" IS NULL AND text."productId" IS NULL;

UPDATE "MediaLink" AS link
SET "sectionId" = section."id"
FROM "CatalogSection" AS section
WHERE link."brand" = section."brand" AND link."category" = section."category"
  AND COALESCE(link."family", '') = section."family"
  AND (CASE WHEN NULLIF(link."family", '') IS NULL THEN 'category' ELSE 'family' END) = section."scope"
  AND link."tagId" IS NULL AND link."productId" IS NULL;

-- Keep the most recently edited description if a legacy section has duplicate rows.
DELETE FROM "CatalogText" AS older
USING "CatalogText" AS newer
WHERE older."sectionId" = newer."sectionId" AND older."sectionId" IS NOT NULL
  AND (older."updatedAt" < newer."updatedAt" OR (older."updatedAt" = newer."updatedAt" AND older."id" < newer."id"));

CREATE UNIQUE INDEX "CatalogText_sectionId_key" ON "CatalogText"("sectionId");
CREATE INDEX "MediaLink_sectionId_idx" ON "MediaLink"("sectionId");

ALTER TABLE "CatalogText" ADD CONSTRAINT "CatalogText_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CatalogSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CatalogSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
