-- QuickBooks name, SKU and price as last seen or pushed (JSON). A pull takes only fields QuickBooks changed since.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "qbSeen" TEXT;
