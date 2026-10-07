import { jsonError, jsonOk } from "@/lib/api";
import { purgeExpiredTracking } from "@/lib/inventory/orders";
import { syncQuickBooks } from "@/lib/quickbooks/sync";

export const maxDuration = 300;

/** Daily: expired tracking links go, then an incremental sync. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("Unauthorized", 401);
  }
  const expiredLinks = await purgeExpiredTracking();
  try {
    return jsonOk({ ...(await syncQuickBooks()), expiredLinks });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "QuickBooks sync failed", 400);
  }
}
