-- In-app settings: theme colors, QuickBooks credentials (env vars stay as fallback), sync status.
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "accentColor" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbClientId" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbClientSecret" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbRealmId" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbRedirectUri" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbSyncAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbSyncedAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "qbSyncError" TEXT;

-- QuickBooks LastUpdatedTime last pulled or pushed for this product. Two-way sync baseline.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "qbUpdatedAt" TIMESTAMP(3);
