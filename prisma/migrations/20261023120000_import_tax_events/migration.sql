-- AlterTable
ALTER TABLE "ImportationLine" ADD COLUMN "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ImportationEvent" (
    "id" TEXT NOT NULL,
    "importationId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportationEvent_importationId_createdAt_idx" ON "ImportationEvent"("importationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ImportationEvent" ADD CONSTRAINT "ImportationEvent_importationId_fkey" FOREIGN KEY ("importationId") REFERENCES "Importation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
