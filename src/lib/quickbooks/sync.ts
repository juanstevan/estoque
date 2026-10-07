import { prisma } from "@/lib/db";
import { updateProduct } from "@/lib/inventory/service";
import { INVOICES_FROM, ingestInvoice, ingestItems, parseQbInvoice } from "@/lib/quickbooks/ingest";
import {
  EXPIRED,
  NOT_CONNECTED,
  REFUSED,
  itemUpdatedAt,
  itemView,
  pushQuickBooksItem,
  qboChanges,
  qboItem,
  seenOf,
  qboQuery,
  type QbItem,
} from "@/lib/quickbooks/qbo";

/** Answers a retry can't change. Retrying them would only hide the real message. */
function final(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return [NOT_CONNECTED, EXPIRED, REFUSED].includes(message) || message.startsWith("Add the QuickBooks");
}

async function withRetry<T>(run: () => Promise<T>) {
  let wait = 400;
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (final(error)) throw error;
      last = error;
      await new Promise((resolve) => setTimeout(resolve, wait));
      wait *= 2;
    }
  }
  throw last;
}

/**
 * Central sync: Sync now, the once-a-minute tick from open browsers, the daily cron and
 * `npm run qb:sync`. The claim on AppSettings.qbSyncAt is atomic, so any number of callers
 * still means one run per window. `auto` runs stay quiet while QuickBooks isn't connected.
 */
export async function syncQuickBooks({ auto = false } = {}) {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { qbRefreshToken: true },
  });
  if (!settings?.qbRefreshToken) {
    if (auto) return { skipped: true as const };
    throw new Error(NOT_CONNECTED);
  }
  const gap = auto ? 55 : 5;
  const claimed = await prisma.$executeRaw`UPDATE "AppSettings" SET "qbSyncAt" = NOW()
    WHERE id = 'default' AND ("qbSyncAt" IS NULL OR "qbSyncAt" < NOW() - ${gap} * INTERVAL '1 second')`;
  if (!claimed) return { skipped: true as const };
  try {
    const result = await runSync();
    await prisma.appSettings.update({
      where: { id: "default" },
      data: { qbSyncedAt: new Date(), qbSyncError: null },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "QuickBooks sync failed";
    await prisma.appSettings.update({ where: { id: "default" }, data: { qbSyncError: message } });
    throw error;
  }
}

type Seen = { name: string; sku: string; price: number };
/** Nothing remembered: every value QuickBooks has counts as changed. */
const UNSEEN: Seen = { name: "", sku: "", price: 0 };
const PRODUCT = { id: true, code: true, name: true, sku: true, b2bPrice: true, secondarySku: true } as const;

/**
 * The values QuickBooks changed since `before`, in app form. The ID comes from an "ID - Name"
 * prefix, and like a SKU it's only taken when no other product uses it. Prices only above 0.
 */
function changedFields(
  now: Seen,
  before: Seen,
  product: { code: string; name: string; sku: string; b2bPrice: number },
  codes: Set<string>,
  skus: Set<string>,
) {
  const data: { name?: string; code?: string; sku?: string; b2bPrice?: number } = {};
  if (now.name && now.name !== before.name) {
    const parts = now.name.match(/^(\w{1,3}) ?- (.+)$/);
    const name = parts ? parts[2].trim() : now.name;
    if (name !== product.name) data.name = name;
    const code = parts?.[1].toUpperCase();
    if (code && code !== product.code && !codes.has(code)) data.code = code;
  }
  if (now.sku && now.sku !== before.sku && now.sku !== product.sku && !skus.has(now.sku)) data.sku = now.sku;
  if (now.price > 0 && now.price !== before.price && now.price !== product.b2bPrice) data.b2bPrice = now.price;
  return data;
}

/**
 * QuickBooks → app for linked products. Each product remembers its item's name, SKU and price
 * as last seen (or pushed). Only fields QuickBooks changed since then are pulled, so a sale that
 * only moves QtyOnHand never overwrites a name edited here. The first sight just records them.
 * Quantities are never pulled: stock is owned here.
 */
async function pullItems(items: QbItem[]) {
  const products = await prisma.product.findMany({ select: { ...PRODUCT, qbUpdatedAt: true, qbSeen: true } });
  const linked = new Map(
    products.flatMap((p) => (p.secondarySku?.startsWith("qb:") ? [[p.secondarySku.slice(3), p] as const] : [])),
  );
  const codes = new Set(products.map((p) => p.code));
  const skus = new Set(products.map((p) => p.sku));
  let pulled = 0;
  for (const item of items) {
    const product = linked.get(String(item.Id));
    const at = itemUpdatedAt(item);
    if (!product || !at) continue;
    if (product.qbSeen && product.qbUpdatedAt && at <= product.qbUpdatedAt) continue;
    const seen = seenOf(item);
    const data = product.qbSeen
      ? changedFields(JSON.parse(seen), JSON.parse(product.qbSeen), product, codes, skus)
      : {};
    if (Object.keys(data).length) {
      await updateProduct(product.id, data, { fromQuickBooks: true });
      if (data.code) codes.add(data.code);
      if (data.sku) skus.add(data.sku);
      pulled++;
    }
    await prisma.product.update({ where: { id: product.id }, data: { qbUpdatedAt: at, qbSeen: seen } });
  }
  return pulled;
}

/**
 * "Click to match" on an orange link. The app takes the item's name, ID, SKU and price where
 * it can (same rules as a pull; a price only when the app has one, since QuickBooks prices
 * aren't always right). Then QuickBooks gets "ID - Name" plus whatever the app couldn't take:
 * an empty SKU, an ID another product uses. Both sides end up the same.
 */
export async function matchQuickBooks(productId: string) {
  const products = await prisma.product.findMany({ select: PRODUCT });
  const product = products.find((p) => p.id === productId);
  if (!product) throw new Error("Product not found");
  const itemId = product.secondarySku?.startsWith("qb:") ? product.secondarySku.slice(3) : null;
  if (!itemId) throw new Error("Link the product to a QuickBooks item first");
  const item = await qboItem(itemId);
  if (!item) throw new Error("That QuickBooks item no longer exists");
  const data = changedFields(
    JSON.parse(seenOf(item)),
    UNSEEN,
    product,
    new Set(products.map((p) => p.code)),
    new Set(products.map((p) => p.sku)),
  );
  if (product.b2bPrice <= 0) delete data.b2bPrice;
  const matched = Object.keys(data).length ? await updateProduct(productId, data, { fromQuickBooks: true }) : product;
  const pushed = await pushQuickBooksItem(matched);
  if (!pushed) throw new Error("That QuickBooks item no longer exists");
  return itemView(pushed);
}

/** Invoices don't carry the customer's phone; it comes from the customer once ("" = none on file). */
async function fillPhones() {
  const orders = await prisma.order.findMany({
    where: { qbCustomerId: { not: null }, customerPhone: null },
    select: { id: true, qbCustomerId: true },
    take: 200,
  });
  const ids = [...new Set(orders.map((order) => order.qbCustomerId!.replace(/\D/g, "")))].filter(Boolean).slice(0, 100);
  if (!ids.length) return;
  const customers = (await withRetry(() => qboQuery("Customer", `Id IN (${ids.map((id) => `'${id}'`).join(",")})`))) as Array<{
    Id?: string;
    PrimaryPhone?: { FreeFormNumber?: string };
    Mobile?: { FreeFormNumber?: string };
  }>;
  const phones = new Map(customers.map((c) => [String(c.Id), c.PrimaryPhone?.FreeFormNumber || c.Mobile?.FreeFormNumber || ""]));
  for (const order of orders) {
    const id = order.qbCustomerId!.replace(/\D/g, "");
    if (!ids.includes(id)) continue;
    await prisma.order.update({ where: { id: order.id }, data: { customerPhone: phones.get(id) ?? "" } });
  }
}

async function runSync() {
  const items = (await withRetry(() => qboQuery("Item", "Active = true", "Name"))) as QbItem[];
  const itemResult = await ingestItems(items);
  const pulled = await pullItems(items);

  const invoices = await withRetry(() =>
    qboQuery("Invoice", `TxnDate >= '${INVOICES_FROM}'`, "TxnDate DESC"),
  );
  // Deleted invoices only show up here. Intuit looks back 30 days at most.
  const changedSince = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let changes: unknown[] = [];
  let changeError: string | null = null;
  try {
    changes = await withRetry(() => qboChanges(changedSince));
  } catch (error) {
    changeError = error instanceof Error ? error.message : "Change sync failed";
  }

  // Only new or changed invoices go on. One query here keeps a once-a-minute sync cheap.
  const known = new Map(
    (
      await prisma.order.findMany({
        where: { qbInvoiceId: { not: null } },
        select: { qbInvoiceId: true, qbUpdatedAt: true },
      })
    ).map((order) => [order.qbInvoiceId, order.qbUpdatedAt]),
  );
  const seen = new Set<string>();
  const batch: unknown[] = [];
  for (const row of [...changes, ...invoices]) {
    const invoice = parseQbInvoice(row);
    if (invoice?.rejected) continue;
    if (invoice) {
      if (seen.has(invoice.id)) continue;
      seen.add(invoice.id);
      const at = invoice.updatedAt ? new Date(invoice.updatedAt) : null;
      if (known.has(invoice.id)) {
        const before = known.get(invoice.id);
        if (before && at && at <= before) continue;
      } else if (invoice.deleted || invoice.voided || !invoice.txnDate || invoice.txnDate < INVOICES_FROM) {
        continue;
      }
    }
    batch.push(row);
  }

  // 8 at a time. A failed invoice doesn't stop the rest.
  const invoiceResults: Awaited<ReturnType<typeof ingestInvoice>>[] = [];
  const failed: string[] = [];
  for (let i = 0; i < batch.length; i += 8) {
    await Promise.all(
      batch.slice(i, i + 8).map((invoice) =>
        ingestInvoice(invoice).then(
          (result) => invoiceResults.push(result),
          (error) =>
            failed.push(
              `${parseQbInvoice(invoice)?.docNumber || "?"}: ${error instanceof Error ? error.message : String(error)}`,
            ),
        ),
      ),
    );
  }
  // The rest are saved. Failed ones are still new on the next sync, so they retry.
  if (failed.length) {
    throw new Error(`${failed.length} QuickBooks invoices failed to import. ${failed.slice(0, 3).join(" · ")}`);
  }

  await fillPhones().catch(() => undefined);

  const updated = invoiceResults.filter((row) => !row.skipped).length;
  return {
    changed: itemResult.created.length + pulled + updated > 0,
    items: { fetched: items.length, created: itemResult.created.length, pulled },
    invoices: { fetched: batch.length, updated, from: INVOICES_FROM, changeError },
  };
}
