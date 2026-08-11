-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "secondarySku" TEXT,
    "ean" TEXT,
    "imageUrl" TEXT,
    "b2bPrice" REAL NOT NULL DEFAULT 0,
    "b2cPrice" REAL NOT NULL DEFAULT 0,
    "weight" REAL,
    "length" REAL,
    "width" REAL,
    "height" REAL,
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

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "totalValue" REAL NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "userId" TEXT NOT NULL DEFAULT 'demo',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantityDelta" REAL NOT NULL,
    "unitCost" REAL NOT NULL,
    "resultingAvgCost" REAL NOT NULL,
    "resultingQty" REAL NOT NULL,
    "resultingValue" REAL NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CostHistory_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "InventoryTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Importation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expectedDate" DATETIME,
    "notes" TEXT,
    "freightIntl" REAL NOT NULL DEFAULT 0,
    "customs" REAL NOT NULL DEFAULT 0,
    "brokerFees" REAL NOT NULL DEFAULT 0,
    "portFees" REAL NOT NULL DEFAULT 0,
    "freightDomestic" REAL NOT NULL DEFAULT 0,
    "otherCosts" REAL NOT NULL DEFAULT 0,
    "productSubtotal" REAL NOT NULL DEFAULT 0,
    "totalAdditionalCosts" REAL NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'demo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "receivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ImportationLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importationId" TEXT NOT NULL,
    "productId" TEXT,
    "draftName" TEXT,
    "draftSku" TEXT,
    "draftEan" TEXT,
    "quantity" REAL NOT NULL,
    "purchaseUnitCost" REAL NOT NULL DEFAULT 0,
    "allocatedAdditionalCost" REAL NOT NULL DEFAULT 0,
    "landedUnitCost" REAL NOT NULL DEFAULT 0,
    "weight" REAL,
    "length" REAL,
    "width" REAL,
    "height" REAL,
    "notes" TEXT,
    CONSTRAINT "ImportationLine_importationId_fkey" FOREIGN KEY ("importationId") REFERENCES "Importation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalRef" TEXT NOT NULL,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderedQty" REAL NOT NULL,
    "reservedQty" REAL NOT NULL DEFAULT 0,
    "pickedQty" REAL NOT NULL DEFAULT 0,
    "waitingPickupQty" REAL NOT NULL DEFAULT 0,
    "deliveredQty" REAL NOT NULL DEFAULT 0,
    "remainingQty" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QbSyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_ean_idx" ON "Product"("ean");

-- CreateIndex
CREATE INDEX "Product_secondarySku_idx" ON "Product"("secondarySku");

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
