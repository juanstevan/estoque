-- Catalog descriptions: one rich-text row per Tag, untagged product, category or family.
-- CreateTable
CREATE TABLE "CatalogText" (
    "id" TEXT NOT NULL,
    "tagId" TEXT,
    "productId" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "family" TEXT,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogText_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogText_tagId_key" ON "CatalogText"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogText_productId_key" ON "CatalogText"("productId");

-- CreateIndex
CREATE INDEX "CatalogText_brand_category_family_idx" ON "CatalogText"("brand", "category", "family");

-- AddForeignKey
ALTER TABLE "CatalogText" ADD CONSTRAINT "CatalogText_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogText" ADD CONSTRAINT "CatalogText_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

