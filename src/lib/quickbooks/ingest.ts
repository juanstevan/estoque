import { ExitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createProduct } from "@/lib/inventory/service";
import { placeOnKanban } from "@/lib/inventory/orders";
import { storeQbSyncEvent } from "@/lib/quickbooks/adapter";

export type QbLineIn = {
  sku?: string;
  quantity: number;
  itemId?: string;
  name?: string;
  unitPrice?: number;
};

export type QbInvoiceIn = {
  id: string;
  docNumber: string;
  customerName?: string;
  totalAmount?: number;
  lines: QbLineIn[];
};

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function codeFromName(name: string) {
  const m = name.match(/^(\d{1,3})\b/);
  return m?.[1];
}

export function parseQbInvoice(raw: unknown): QbInvoiceIn | null {
  const root = obj(raw);
  if (!root) return null;
  const inv = obj(root.Invoice) ?? obj(root.invoice) ?? root;
  const id = str(inv.Id) || str(inv.id);
  if (!id && !str(inv.DocNumber) && !str(inv.docNumber)) return null;
  const customer = obj(inv.CustomerRef);
  const linesRaw = inv.Line ?? inv.lines;
  const lines: QbLineIn[] = [];
  for (const row of Array.isArray(linesRaw) ? linesRaw : []) {
    const line = obj(row);
    if (!line) continue;
    if (str(line.DetailType) && str(line.DetailType) !== "SalesItemLineDetail") {
      continue;
    }
    const detail = obj(line.SalesItemLineDetail) ?? line;
    const item = obj(detail.ItemRef);
    const qty = num(detail.Qty ?? line.quantity);
    if (qty <= 0) continue;
    lines.push({
      sku: str(line.sku) || str(detail.Sku) || undefined,
      quantity: qty,
      itemId: str(item?.value) || str(line.itemId) || undefined,
      name: str(item?.name) || str(line.name) || undefined,
      unitPrice: num(detail.UnitPrice ?? line.unitPrice),
    });
  }
  return {
    id: id || str(inv.DocNumber) || str(inv.docNumber),
    docNumber: str(inv.DocNumber) || str(inv.docNumber) || id,
    customerName: str(customer?.name) || str(inv.customerName) || undefined,
    totalAmount: num(inv.TotalAmt ?? inv.totalAmount),
    lines,
  };
}

export function parseQbItems(raw: unknown): Json[] {
  if (Array.isArray(raw)) return raw.filter((x) => obj(x));
  const root = obj(raw);
  if (!root) return [];
  const qr = obj(root.QueryResponse);
  const items = qr?.Item ?? root.Item ?? root.items;
  if (Array.isArray(items)) return items.filter((x) => obj(x));
  if (obj(items)) return [items as Json];
  return [];
}

async function findProduct(line: QbLineIn) {
  if (line.sku) {
    const bySku = await prisma.product.findUnique({ where: { sku: line.sku } });
    if (bySku) return bySku;
  }
  if (line.itemId) {
    const byQb = await prisma.product.findFirst({
      where: { secondarySku: `qb:${line.itemId}` },
    });
    if (byQb) return byQb;
  }
  if (line.name) {
    const byName = await prisma.product.findFirst({
      where: { name: line.name },
    });
    if (byName) return byName;
    const code = codeFromName(line.name);
    if (code) {
      const byCode = await prisma.product.findUnique({ where: { code } });
      if (byCode) return byCode;
    }
  }
  return null;
}

export async function ingestInvoice(raw: unknown) {
  const invoice = parseQbInvoice(raw);
  if (!invoice) throw new Error("Not a QuickBooks invoice payload");

  await storeQbSyncEvent({
    eventType: "invoice",
    externalId: invoice.id,
    payload: raw,
  });

  const existing = await prisma.order.findUnique({
    where: { externalRef: invoice.docNumber },
  });
  if (existing) {
    return { skipped: true as const, reason: "already synced", order: existing };
  }

  const matched: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }> = [];
  const unmatched: QbLineIn[] = [];
  for (const line of invoice.lines) {
    const product = await findProduct(line);
    if (!product) {
      unmatched.push(line);
      continue;
    }
    matched.push({
      productId: product.id,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? 0,
    });
  }
  if (!matched.length) {
    return { skipped: true as const, reason: "no matching products", unmatched };
  }

  const created = await prisma.order.create({
    data: {
      externalRef: invoice.docNumber,
      customerName: invoice.customerName ?? null,
      status: ExitStatus.PENDING,
      onKanban: false,
      source: "quickbooks",
      totalAmount: invoice.totalAmount ?? 0,
      notes: invoice.id !== invoice.docNumber ? `QB ${invoice.id}` : null,
      lines: {
        create: matched.map((line) => ({
          productId: line.productId,
          orderedQty: line.quantity,
          remainingQty: line.quantity,
          unitPrice: line.unitPrice,
        })),
      },
    },
  });
  const order = await placeOnKanban(created.id);
  return { skipped: false as const, order, unmatched };
}

export async function ingestItems(raw: unknown) {
  const items = parseQbItems(raw);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    const id = str(item.Id) || str(item.id);
    const name = str(item.Name) || str(item.name);
    const type = str(item.Type) || str(item.type);
    if (!id || !name) continue;
    if (type && type !== "Inventory") {
      skipped.push(id);
      continue;
    }
    const sku = str(item.Sku) || str(item.sku) || `QB-${id}`;
    const exists = await prisma.product.findFirst({
      where: {
        OR: [{ sku }, { secondarySku: `qb:${id}` }],
      },
    });
    if (exists) {
      skipped.push(sku);
      continue;
    }
    const preferred = codeFromName(name);
    const codeTaken = preferred
      ? await prisma.product.findUnique({ where: { code: preferred } })
      : null;
    await createProduct({
      name,
      sku,
      code: preferred && !codeTaken ? preferred : undefined,
      secondarySku: `qb:${id}`,
      initialQty: Math.max(0, num(item.QtyOnHand ?? item.qtyOnHand)),
      notes: "Imported from QuickBooks (qty is owned here after this)",
    });
    created.push(sku);
  }
  await storeQbSyncEvent({
    eventType: "items",
    payload: { count: items.length, created: created.length },
  });
  return { created, skipped };
}
