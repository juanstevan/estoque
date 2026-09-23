-- CreateTable
CREATE TABLE "PhotoShare" (
    "token" TEXT NOT NULL,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoShare_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoShare_productId_key" ON "PhotoShare"("productId");
