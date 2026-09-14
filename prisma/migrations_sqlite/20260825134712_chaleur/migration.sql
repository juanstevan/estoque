/*
  Warnings:

  - You are about to drop the column `brokerFees` on the `Importation` table. All the data in the column will be lost.
  - You are about to drop the column `freightDomestic` on the `Importation` table. All the data in the column will be lost.
  - You are about to drop the column `freightIntl` on the `Importation` table. All the data in the column will be lost.
  - You are about to drop the column `portFees` on the `Importation` table. All the data in the column will be lost.
  - You are about to drop the column `draftEan` on the `ImportationLine` table. All the data in the column will be lost.
  - You are about to drop the column `height` on the `ImportationLine` table. All the data in the column will be lost.
  - You are about to drop the column `length` on the `ImportationLine` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `ImportationLine` table. All the data in the column will be lost.
  - You are about to drop the column `width` on the `ImportationLine` table. All the data in the column will be lost.
  - Added the required column `code` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "InventoryTransaction" ADD COLUMN "clientName" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT 'Chaleur Manufacturing Co.',
    "logoUrl" TEXT,
    "adjustmentReasons" TEXT NOT NULL DEFAULT '["Correction","Adjust","Return","Warranty"]',
    "yearColors" TEXT NOT NULL DEFAULT '{"2024":"#22c55e","2025":"#3b82f6","2026":"#ef4444","2027":"#a855f7"}'
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Importation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INTERNATIONAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "supplierName" TEXT,
    "expectedDate" DATETIME,
    "notes" TEXT,
    "transferFee" REAL NOT NULL DEFAULT 0,
    "freight" REAL NOT NULL DEFAULT 0,
    "delivery" REAL NOT NULL DEFAULT 0,
    "duties" REAL NOT NULL DEFAULT 0,
    "customs" REAL NOT NULL DEFAULT 0,
    "otherCosts" REAL NOT NULL DEFAULT 0,
    "productSubtotal" REAL NOT NULL DEFAULT 0,
    "totalAdditionalCosts" REAL NOT NULL DEFAULT 0,
    "coefficient" REAL NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT 'demo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "receivedAt" DATETIME
);
INSERT INTO "new_Importation" ("createdAt", "createdBy", "customs", "expectedDate", "id", "notes", "otherCosts", "productSubtotal", "receivedAt", "reference", "status", "totalAdditionalCosts", "updatedAt") SELECT "createdAt", "createdBy", "customs", "expectedDate", "id", "notes", "otherCosts", "productSubtotal", "receivedAt", "reference", "status", "totalAdditionalCosts", "updatedAt" FROM "Importation";
DROP TABLE "Importation";
ALTER TABLE "new_Importation" RENAME TO "Importation";
CREATE UNIQUE INDEX "Importation_reference_key" ON "Importation"("reference");
CREATE TABLE "new_ImportationLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importationId" TEXT NOT NULL,
    "productId" TEXT,
    "draftName" TEXT,
    "draftSku" TEXT,
    "quantity" REAL NOT NULL,
    "purchaseUnitCost" REAL NOT NULL DEFAULT 0,
    "allocatedAdditionalCost" REAL NOT NULL DEFAULT 0,
    "landedUnitCost" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "ImportationLine_importationId_fkey" FOREIGN KEY ("importationId") REFERENCES "Importation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ImportationLine" ("allocatedAdditionalCost", "draftName", "draftSku", "id", "importationId", "landedUnitCost", "notes", "productId", "purchaseUnitCost", "quantity") SELECT "allocatedAdditionalCost", "draftName", "draftSku", "id", "importationId", "landedUnitCost", "notes", "productId", "purchaseUnitCost", "quantity" FROM "ImportationLine";
DROP TABLE "ImportationLine";
ALTER TABLE "new_ImportationLine" RENAME TO "ImportationLine";
CREATE INDEX "ImportationLine_importationId_idx" ON "ImportationLine"("importationId");
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalRef" TEXT NOT NULL,
    "customerName" TEXT,
    "seller" TEXT,
    "assignedTo" TEXT,
    "address" TEXT,
    "deliverBy" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "onKanban" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'invoice',
    "notes" TEXT,
    "photos" TEXT,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Order" ("createdAt", "customerName", "externalRef", "id", "notes", "source", "status", "updatedAt") SELECT "createdAt", "customerName", "externalRef", "id", "notes", "source", "status", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_externalRef_key" ON "Order"("externalRef");
CREATE TABLE "new_OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderedQty" REAL NOT NULL,
    "reservedQty" REAL NOT NULL DEFAULT 0,
    "pickedQty" REAL NOT NULL DEFAULT 0,
    "waitingPickupQty" REAL NOT NULL DEFAULT 0,
    "deliveredQty" REAL NOT NULL DEFAULT 0,
    "remainingQty" REAL NOT NULL DEFAULT 0,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderLine" ("deliveredQty", "id", "orderId", "orderedQty", "pickedQty", "productId", "remainingQty", "reservedQty", "waitingPickupQty") SELECT "deliveredQty", "id", "orderId", "orderedQty", "pickedQty", "productId", "remainingQty", "reservedQty", "waitingPickupQty" FROM "OrderLine";
DROP TABLE "OrderLine";
ALTER TABLE "new_OrderLine" RENAME TO "OrderLine";
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "secondarySku" TEXT,
    "ean" TEXT,
    "amazonUrl" TEXT,
    "imageUrl" TEXT,
    "b2bPrice" REAL NOT NULL DEFAULT 0,
    "b2cPrice" REAL NOT NULL DEFAULT 0,
    "fobCost" REAL NOT NULL DEFAULT 0,
    "cifCost" REAL NOT NULL DEFAULT 0,
    "lastSoldPrice" REAL NOT NULL DEFAULT 0,
    "suppliers" TEXT,
    "weight" REAL,
    "length" REAL,
    "width" REAL,
    "height" REAL,
    "packageLength" REAL,
    "packageWidth" REAL,
    "packageHeight" REAL,
    "packageWeight" REAL,
    "cutoutLength" REAL,
    "cutoutWidth" REAL,
    "cutoutHeight" REAL,
    "notes" TEXT,
    "physicalQty" REAL NOT NULL DEFAULT 0,
    "availableQty" REAL NOT NULL DEFAULT 0,
    "reservedQty" REAL NOT NULL DEFAULT 0,
    "waitingPickupQty" REAL NOT NULL DEFAULT 0,
    "waitingDeliveryQty" REAL NOT NULL DEFAULT 0,
    "unavailableQty" REAL NOT NULL DEFAULT 0,
    "avgCost" REAL NOT NULL DEFAULT 0,
    "inventoryValue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("availableQty", "avgCost", "b2bPrice", "b2cPrice", "createdAt", "ean", "height", "id", "imageUrl", "inventoryValue", "length", "name", "notes", "physicalQty", "reservedQty", "secondarySku", "sku", "unavailableQty", "updatedAt", "waitingDeliveryQty", "waitingPickupQty", "weight", "width") SELECT "availableQty", "avgCost", "b2bPrice", "b2cPrice", "createdAt", "ean", "height", "id", "imageUrl", "inventoryValue", "length", "name", "notes", "physicalQty", "reservedQty", "secondarySku", "sku", "unavailableQty", "updatedAt", "waitingDeliveryQty", "waitingPickupQty", "weight", "width" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_ean_idx" ON "Product"("ean");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");
