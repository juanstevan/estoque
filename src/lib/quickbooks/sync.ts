import { ingestInvoice, ingestItems } from "@/lib/quickbooks/ingest";
import { qboAccessToken, qboQuery } from "@/lib/quickbooks/qbo";

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function syncQuickBooks() {
  const token = await qboAccessToken();
  const items = await qboQuery(token, "Item", "Active = true", "Name");
  const itemResult = await ingestItems(items);

  const since = isoDaysAgo(7);
  const invoices = await qboQuery(
    token,
    "Invoice",
    `TxnDate >= '${since}'`,
    "TxnDate DESC",
  );
  const invoiceResults = [];
  for (const invoice of invoices) {
    invoiceResults.push(await ingestInvoice(invoice));
  }

  return {
    items: { fetched: items.length, ...itemResult },
    invoices: {
      fetched: invoices.length,
      created: invoiceResults.filter((r) => !r.skipped).length,
      skipped: invoiceResults.filter((r) => r.skipped).length,
    },
  };
}
