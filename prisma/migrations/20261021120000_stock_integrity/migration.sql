-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'COST_ADJUSTMENT';

-- AlterTable
ALTER TABLE "Importation" ADD COLUMN "historical" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "qbLineId" TEXT;
