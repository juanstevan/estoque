-- CreateTable
CREATE TABLE "ImportationProof" (
    "id" TEXT NOT NULL,
    "importationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportationProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportationProof_importationId_idx" ON "ImportationProof"("importationId");

-- AddForeignKey
ALTER TABLE "ImportationProof" ADD CONSTRAINT "ImportationProof_importationId_fkey" FOREIGN KEY ("importationId") REFERENCES "Importation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "returnedQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
