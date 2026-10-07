-- Deliveries per invoice, roles with per-tab access, database sessions, delivery preferences.
-- Additive only: the legacy Order workflow columns stay for rollback.

ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "companyPhone" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "hiddenTabs" TEXT NOT NULL DEFAULT '["tasks","reports"]';
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "stockStage" TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "allowPaid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "allowUnpaid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "collectUnpaid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "prepMethod" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "trackingDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "qbCustomerId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingExpiresAt" TIMESTAMP(3);

ALTER TABLE "OrderProof" ADD COLUMN IF NOT EXISTS "deliveryId" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSignInAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedSignIns" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "access" TEXT NOT NULL DEFAULT '{}',
    "main" BOOLEAN NOT NULL DEFAULT false,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "Role"("name");

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

CREATE TABLE IF NOT EXISTS "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 1,
    "status" "ExitStatus" NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'DELIVERY',
    "assigneeId" TEXT,
    "deliverBy" TIMESTAMP(3),
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "priorStatus" "ExitStatus",
    "delayReason" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "stockOutAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Delivery_orderId_number_key" ON "Delivery"("orderId", "number");
CREATE INDEX IF NOT EXISTS "Delivery_deliverBy_idx" ON "Delivery"("deliverBy");
CREATE INDEX IF NOT EXISTS "Delivery_assigneeId_idx" ON "Delivery"("assigneeId");

CREATE TABLE IF NOT EXISTS "DeliveryLine" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "preparedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "DeliveryLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryLine_deliveryId_orderLineId_key" ON "DeliveryLine"("deliveryId", "orderLineId");
CREATE INDEX IF NOT EXISTS "DeliveryLine_orderLineId_idx" ON "DeliveryLine"("orderLineId");
CREATE INDEX IF NOT EXISTS "OrderProof_deliveryId_idx" ON "OrderProof"("deliveryId");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OrderProof" ADD CONSTRAINT "OrderProof_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Everyone who could sign in before keeps full access until the main user changes their role.
INSERT INTO "Role" ("id", "name", "description", "access", "main", "position")
VALUES ('main', 'Main user', 'Full access, always',
  '{"storage":"edit","media":"edit","imports":"edit","delivery":"edit","tasks":"edit","reports":"edit","settings":"edit"}', true, 0)
ON CONFLICT ("id") DO NOTHING;
UPDATE "User" SET "roleId" = 'main' WHERE "roleId" IS NULL;

-- Invoices already in the workflow become delivery 1 with all their physical lines.
-- Stock that left at dispatch or pickup stays out (stockOutAt = dispatchedAt).
INSERT INTO "Delivery" ("id", "orderId", "number", "status", "mode", "assigneeId", "deliverBy", "priorStatus",
  "delayReason", "dispatchedAt", "stockOutAt", "completedAt", "completedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", 1, o."status", o."mode",
  (SELECT u."id" FROM "User" u WHERE u."name" = o."assignedTo" LIMIT 1),
  o."deliverBy", o."priorStatus", o."delayReason", o."dispatchedAt", o."dispatchedAt", o."completedAt", o."completedBy",
  o."createdAt", CURRENT_TIMESTAMP
FROM "Order" o
WHERE (o."onKanban" OR o."status" = 'COMPLETED') AND NOT o."voided"
  AND NOT EXISTS (SELECT 1 FROM "Delivery" d WHERE d."orderId" = o."id");

INSERT INTO "DeliveryLine" ("id", "deliveryId", "orderLineId", "qty", "preparedQty")
SELECT gen_random_uuid()::text, d."id", l."id", l."orderedQty", LEAST(l."scannedQty", l."orderedQty")
FROM "Delivery" d JOIN "OrderLine" l ON l."orderId" = d."orderId"
WHERE l."physical"
  AND NOT EXISTS (SELECT 1 FROM "DeliveryLine" x WHERE x."deliveryId" = d."id" AND x."orderLineId" = l."id");

UPDATE "OrderProof" p SET "deliveryId" = d."id"
FROM "Delivery" d WHERE d."orderId" = p."orderId" AND d."number" = 1 AND p."deliveryId" IS NULL;

-- The next QuickBooks sync reads every invoice again, filling amount paid, tax and the customer.
UPDATE "Order" SET "qbUpdatedAt" = NULL WHERE "qbInvoiceId" IS NOT NULL;
