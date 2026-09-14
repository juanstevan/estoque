-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECEIVED', 'SOLD', 'RESERVED', 'RELEASED', 'PICKED_UP', 'DELIVERED', 'ADJUSTMENT', 'CORRECTION', 'RETURNED', 'TRANSFER', 'IMPORTATION');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELAYED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExitStatus" AS ENUM ('PENDING', 'PREPARING', 'IN_TRANSIT', 'TO_DELIVER', 'DELAYED', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT 'Chaleur Manufacturing Co.',
    "logoUrl" TEXT,
    "adjustmentReasons" TEXT NOT NULL DEFAULT '["Correction","Adjust","Return","Warranty"]',
    "yearColors" TEXT NOT NULL DEFAULT '{"2024":"#22c55e","2025":"#3b82f6","2026":"#ef4444","2027":"#a855f7"}',
    "importColumns" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "secondarySku" TEXT,
    "ean" TEXT,
    "amazonUrl" TEXT,
    "imageUrl" TEXT,
    "b2bPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "b2cPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fobCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cifCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSoldPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suppliers" TEXT,
    "weight" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "packageLength" DOUBLE PRECISION,
    "packageWidth" DOUBLE PRECISION,
    "packageHeight" DOUBLE PRECISION,
    "packageWeight" DOUBLE PRECISION,
    "cutoutLength" DOUBLE PRECISION,
    "cutoutWidth" DOUBLE PRECISION,
    "cutoutHeight" DOUBLE PRECISION,
    "notes" TEXT,
    "physicalQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availableQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waitingPickupQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waitingDeliveryQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unavailableQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inventoryValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "clientName" TEXT,
    "userId" TEXT NOT NULL DEFAULT 'demo',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantityDelta" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "resultingAvgCost" DOUBLE PRECISION NOT NULL,
    "resultingQty" DOUBLE PRECISION NOT NULL,
    "resultingValue" DOUBLE PRECISION NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Importation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL DEFAULT 'INTERNATIONAL',
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "supplierName" TEXT,
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,
    "transferFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delivery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duties" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAdditionalCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT 'demo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "Importation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportationLine" (
    "id" TEXT NOT NULL,
    "importationId" TEXT NOT NULL,
    "productId" TEXT,
    "draftName" TEXT,
    "draftSku" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purchaseUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocatedAdditionalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "landedUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "ImportationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "customerName" TEXT,
    "seller" TEXT,
    "assignedTo" TEXT,
    "address" TEXT,
    "deliverBy" TIMESTAMP(3),
    "status" "ExitStatus" NOT NULL DEFAULT 'PENDING',
    "onKanban" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'invoice',
    "notes" TEXT,
    "photos" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderedQty" DOUBLE PRECISION NOT NULL,
    "reservedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waitingPickupQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbSyncEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QbSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_ean_idx" ON "Product"("ean");

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_occurredAt_idx" ON "InventoryTransaction"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_idx" ON "InventoryTransaction"("type");

-- CreateIndex
CREATE INDEX "InventoryTransaction_reference_idx" ON "InventoryTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "CostHistory_transactionId_key" ON "CostHistory"("transactionId");

-- CreateIndex
CREATE INDEX "CostHistory_productId_occurredAt_idx" ON "CostHistory"("productId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Importation_reference_key" ON "Importation"("reference");

-- CreateIndex
CREATE INDEX "ImportationLine_importationId_idx" ON "ImportationLine"("importationId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_externalRef_key" ON "Order"("externalRef");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostHistory" ADD CONSTRAINT "CostHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostHistory" ADD CONSTRAINT "CostHistory_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportationLine" ADD CONSTRAINT "ImportationLine_importationId_fkey" FOREIGN KEY ("importationId") REFERENCES "Importation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportationLine" ADD CONSTRAINT "ImportationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
