-- CreateTable
CREATE TABLE "MediaGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaGroup_parentId_position_idx" ON "MediaGroup"("parentId", "position");

-- AddForeignKey
ALTER TABLE "MediaGroup" ADD CONSTRAINT "MediaGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "Product_groupId_idx" ON "Product"("groupId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MediaGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ProductPhoto" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "ProductPhoto" ADD COLUMN "groupId" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE "ProductPhoto" ADD COLUMN "originalName" TEXT NOT NULL DEFAULT '';

-- Exactly one owner per asset.
ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_one_owner" CHECK (("productId" IS NULL) <> ("groupId" IS NULL));

-- CreateIndex
CREATE INDEX "ProductPhoto_groupId_position_idx" ON "ProductPhoto"("groupId", "position");

-- AddForeignKey
ALTER TABLE "ProductPhoto" ADD CONSTRAINT "ProductPhoto_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MediaGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PhotoShare" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PhotoShare_groupId_key" ON "PhotoShare"("groupId");
