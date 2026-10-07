-- Delivery workflow fields. Existing invoices stay off the new rules until they move.

ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbRefreshToken" TEXT;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "qbRealmId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "qbInvoiceId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "qbUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "qbAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "priorStatus" "ExitStatus";
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "completedBy" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "delayReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerNote" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "revisedDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingToken" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "voided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "issues" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "windowNote" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_trackingToken_key" ON "Order"("trackingToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_qbRealmId_qbInvoiceId_key" ON "Order"("qbRealmId", "qbInvoiceId");

ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "scannedQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "physical" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

CREATE TABLE IF NOT EXISTS "OrderProof" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderProof_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderProof_orderId_idx" ON "OrderProof"("orderId");

DO $$ BEGIN
  ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OrderProof" ADD CONSTRAINT "OrderProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
