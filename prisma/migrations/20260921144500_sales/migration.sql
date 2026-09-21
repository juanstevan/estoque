-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "invoice" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "item" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_invoice_sku_key" ON "Sale"("invoice", "sku");
