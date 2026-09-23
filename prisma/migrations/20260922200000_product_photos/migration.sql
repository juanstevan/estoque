-- CreateTable
CREATE TABLE "ProductPhoto" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT NOT NULL,
    "tag" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "size" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPhoto_productId_position_idx" ON "ProductPhoto"("productId", "position");

-- AddForeignKey
ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing single images become each product's first photo.
INSERT INTO "ProductPhoto" ("id", "productId", "url", "thumbUrl", "tag", "contentType")
SELECT 'legacy_' || "id", "id", "imageUrl", "imageUrl", 'main',
       CASE WHEN "imageUrl" ILIKE '%.png' THEN 'image/png'
            WHEN "imageUrl" ILIKE '%.webp' THEN 'image/webp'
            ELSE 'image/jpeg' END
FROM "Product"
WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '' AND "imageUrl" <> '/file.svg';
