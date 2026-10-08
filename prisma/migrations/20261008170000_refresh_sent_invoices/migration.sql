-- QuickBooks price changes used to be skipped once a delivery had left. The next sync reads those invoices again.
UPDATE "Order" SET "qbUpdatedAt" = NULL
WHERE "qbInvoiceId" IS NOT NULL
  AND ("status" = 'COMPLETED' OR "dispatchedAt" IS NOT NULL OR "id" IN (
    SELECT "orderId" FROM "Delivery" WHERE "status" = 'COMPLETED' OR "dispatchedAt" IS NOT NULL OR "stockOutAt" IS NOT NULL
  ));
