import { prisma } from "@/lib/db";
import { qboAccessToken, qboQuery } from "@/lib/quickbooks/qbo";
import { dedupeSales } from "./sheet";
import { isSellable, sellerName, type SaleRow } from "./supply";

const ORDERS_START = "2023-01-01";

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function obj(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function refName(row: Record<string, unknown>, key: string) {
  const ref = obj(row[key]);
  return clean(ref?.name || ref?.value);
}

function share(total: number, amount: number, subtotal: number) {
  return total ? (total * amount) / subtotal : 0;
}

function invoiceId(invoice: Record<string, unknown>) {
  return clean(invoice.DocNumber || invoice.Id);
}

/** Line rows, matching the dashboard app's invoice build (without cost columns). */
export function salesFromInvoices(invoices: unknown[], items: unknown[]) {
  const itemById = new Map<string, Record<string, unknown>>();
  for (const raw of items) {
    const item = obj(raw);
    if (item?.Id != null) itemById.set(String(item.Id), item);
  }

  const rows: SaleRow[] = [];
  for (const raw of invoices) {
    const invoice = obj(raw);
    if (!invoice) continue;
    const id = invoiceId(invoice);
    if (!id) continue;
    const lineList = Array.isArray(invoice.Line) ? invoice.Line : [];
    const lines = lineList
      .map(obj)
      .filter((line): line is Record<string, unknown> => line?.DetailType === "SalesItemLineDetail");
    const totalTax = money(obj(invoice.TxnTaxDetail)?.TotalTax);
    const discount = lineList
      .map(obj)
      .filter((line): line is Record<string, unknown> => line?.DetailType === "DiscountLineDetail")
      .reduce((sum, line) => sum + money(line.Amount), 0);
    const subtotal = lines.reduce((sum, line) => sum + money(line.Amount), 0) || 1;
    const date = clean(invoice.TxnDate).slice(0, 10);
    const client = refName(invoice, "CustomerRef") || "Unknown";
    const seller =
      sellerName(refName(invoice, "DepartmentRef") || refName(invoice, "ClassRef")) || "Unassigned";

    for (const line of lines) {
      const detail = obj(line.SalesItemLineDetail) ?? {};
      const itemRef = obj(detail.ItemRef) ?? {};
      const item = itemById.get(String(itemRef.value ?? "")) ?? {};
      const amount = money(line.Amount);
      const qty = money(detail.Qty) || 1;
      const sku = clean(item.Sku || itemRef.name || item.Name);
      const name = clean(line.Description || item.Name || itemRef.name || sku);
      const row: SaleRow = {
        date,
        invoice: id,
        client,
        seller,
        sku,
        item: name,
        qty,
        price: money(detail.UnitPrice) || amount / qty,
        total: amount + share(totalTax, amount, subtotal) - share(discount, amount, subtotal),
      };
      if (/^\d{4}-\d{2}-\d{2}$/.test(row.date) && isSellable(sku, name)) rows.push(row);
    }
  }
  return dedupeSales(rows);
}

export async function readSales() {
  const [rows, latest] = await Promise.all([
    prisma.sale.findMany({ orderBy: { date: "asc" } }),
    prisma.sale.aggregate({ _max: { syncedAt: true } }),
  ]);
  return {
    updatedAt: latest._max.syncedAt?.toISOString() ?? "",
    rows: rows.map((row) => ({
      date: row.date,
      invoice: row.invoice,
      client: row.client,
      seller: row.seller,
      sku: row.sku,
      item: row.item,
      qty: row.qty,
      price: row.price,
      total: row.total,
    })),
  };
}

export async function replaceAllSales(rows: SaleRow[]) {
  const lines = dedupeSales(rows);
  await prisma.$transaction(async (tx) => {
    await tx.sale.deleteMany();
    const syncedAt = new Date();
    for (let i = 0; i < lines.length; i += 500) {
      await tx.sale.createMany({
        data: lines.slice(i, i + 500).map((row) => ({ ...row, syncedAt })),
      });
    }
  });
  return lines.length;
}

export async function syncSales() {
  const token = await qboAccessToken();
  const active = await qboQuery(token, "Item", "Active = true", "Name");
  const inactive = await qboQuery(token, "Item", "Active = false", "Name");
  const start = process.env.QB_ORDERS_START?.trim() || ORDERS_START;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("QB_ORDERS_START must be YYYY-MM-DD");
  const end = new Date().toISOString().slice(0, 10);
  const invoices = await qboQuery(
    token,
    "Invoice",
    `TxnDate >= '${start}' AND TxnDate <= '${end}'`,
    "TxnDate DESC",
  );
  const fetched = invoices
    .map((raw) => {
      const invoice = obj(raw);
      return invoice ? invoiceId(invoice) : "";
    })
    .filter(Boolean);
  const lines = salesFromInvoices(invoices, [...active, ...inactive]);
  await prisma.$transaction(
    async (tx) => {
      if (fetched.length) await tx.sale.deleteMany({ where: { invoice: { in: fetched } } });
      const syncedAt = new Date();
      for (let i = 0; i < lines.length; i += 500) {
        await tx.sale.createMany({
          data: lines.slice(i, i + 500).map((row) => ({ ...row, syncedAt })),
        });
      }
    },
    { timeout: 60_000 },
  );
  return { invoices: fetched.length, lines: lines.length, from: start, to: end };
}
