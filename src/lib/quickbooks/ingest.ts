import { ExitStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createProduct } from "@/lib/inventory/service";
import { isPhysicalLine } from "@/lib/inventory/delivery-rules";
import { fitDeliveries } from "@/lib/inventory/orders";
import { recomputeAvailable, roundMoney } from "@/lib/inventory/math";
import { storeQbSyncEvent } from "@/lib/quickbooks/adapter";
import { qbSettings } from "@/lib/quickbooks/qbo";

/** Invoices dated before this never become orders. Stock counting starts here. */
export const INVOICES_FROM = "2026-10-01";

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
  txnDate?: string;
  address?: string;
  balance?: number;
  tax?: number;
  customerId?: string;
  voided?: boolean;
  deleted?: boolean;
  updatedAt?: string;
  realmId?: string;
  lines: QbLineIn[];
  rejected?: "estimate";
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

function addressOf(inv: Json) {
  const ship = obj(inv.ShipAddr) ?? obj(inv.BillAddr);
  if (!ship) return "";
  return [ship.Line1, ship.Line2, ship.City, ship.CountrySubDivisionCode, ship.PostalCode]
    .map((part) => str(part))
    .filter(Boolean)
    .join(", ");
}

export function parseQbInvoice(raw: unknown): QbInvoiceIn | null {
  const root = obj(raw);
  if (!root) return null;
  if (obj(root.Estimate)) return { id: "", docNumber: "", lines: [], rejected: "estimate" };
  const inv = obj(root.Invoice) ?? obj(root.invoice) ?? root;
  if (str(inv.TxnType) === "Estimate") return { id: "", docNumber: "", lines: [], rejected: "estimate" };
  const id = str(inv.Id) || str(inv.id);
  if (!id && !str(inv.DocNumber) && !str(inv.docNumber)) return null;
  const customer = obj(inv.CustomerRef);
  const meta = obj(inv.MetaData);
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
  const balance = inv.Balance == null && inv.balance == null ? undefined : num(inv.Balance ?? inv.balance);
  return {
    id: id || str(inv.DocNumber) || str(inv.docNumber),
    docNumber: str(inv.DocNumber) || str(inv.docNumber) || id,
    customerName: str(customer?.name) || str(inv.customerName) || undefined,
    totalAmount: num(inv.TotalAmt ?? inv.totalAmount),
    txnDate: str(inv.TxnDate) || undefined,
    address: addressOf(inv) || undefined,
    balance,
    tax: num(obj(inv.TxnTaxDetail)?.TotalTax),
    customerId: str(customer?.value) || undefined,
    voided: str(inv.status) === "Voided" || str(inv.TxnStatus) === "Voided" || inv.void === true,
    deleted: str(inv.status) === "Deleted",
    updatedAt: str(meta?.LastUpdatedTime) || undefined,
    realmId: str(root.realmId) || undefined,
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

function issueText(unmatched: QbLineIn[]) {
  return unmatched
    .map((line) => {
      const name = line.name || line.sku || "line";
      return isPhysicalLine(line.name) ? `Unmatched product: ${name}` : `Service line not in inventory: ${name}`;
    })
    .join("\n");
}

async function matchedLines(invoice: QbInvoiceIn) {
  const matched: Array<{ productId: string; quantity: number; unitPrice: number; physical: boolean; name?: string }> = [];
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
      physical: isPhysicalLine(line.name || product.name),
      name: line.name,
    });
  }
  return { matched, unmatched };
}

function invoiceDate(txnDate?: string) {
  if (!txnDate) return null;
  const day = txnDate.slice(0, 10);
  const date = new Date(`${day}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function findExisting(invoice: QbInvoiceIn) {
  if (invoice.realmId && invoice.id) {
    const byQb = await prisma.order.findUnique({
      where: { qbRealmId_qbInvoiceId: { qbRealmId: invoice.realmId, qbInvoiceId: invoice.id } },
      include: { lines: true, deliveries: true },
    });
    if (byQb) return byQb;
  }
  if (!invoice.docNumber) return null;
  const byDoc = await prisma.order.findUnique({
    where: { externalRef: invoice.docNumber },
    include: { lines: true, deliveries: true },
  });
  if (!byDoc) return null;
  if (invoice.id && byDoc.qbInvoiceId && byDoc.qbInvoiceId !== invoice.id) return null;
  if (invoice.realmId && byDoc.qbRealmId && byDoc.qbRealmId !== invoice.realmId) return null;
  return byDoc;
}

export async function ingestInvoice(raw: unknown) {
  const invoice = parseQbInvoice(raw);
  if (!invoice) throw new Error("Not a QuickBooks invoice payload");
  if (invoice.rejected === "estimate") {
    return { skipped: true as const, reason: "estimate" };
  }

  invoice.realmId ||= (await qbSettings()).realmId || undefined;
  const existing = await findExisting(invoice);
  const updatedAt = invoice.updatedAt ? new Date(invoice.updatedAt) : null;
  if (existing?.qbUpdatedAt && updatedAt && updatedAt <= existing.qbUpdatedAt) {
    return { skipped: true as const, reason: "unchanged", order: existing };
  }
  // Only invoices dated from INVOICES_FROM become orders. A deleted or voided one we never had stays out.
  if (!existing && (invoice.deleted || invoice.voided || !invoice.txnDate || invoice.txnDate < INVOICES_FROM)) {
    return { skipped: true as const, reason: "not imported" };
  }

  await storeQbSyncEvent({
    eventType: "invoice",
    externalId: invoice.id,
    payload: raw,
  });

  const { matched, unmatched } = await matchedLines(invoice);
  const issues = issueText(unmatched) || null;
  const header = {
    customerName: invoice.customerName ?? null,
    totalAmount: invoice.totalAmount ?? 0,
    invoiceDate: invoiceDate(invoice.txnDate),
    qbAddress: invoice.address ?? null,
    paymentStatus: invoice.balance == null ? null : invoice.balance <= 0 ? "Paid" : "Open",
    amountPaid: invoice.balance == null ? 0 : Math.max(0, roundMoney((invoice.totalAmount ?? 0) - invoice.balance, 2)),
    taxAmount: invoice.tax ?? 0,
    qbCustomerId: invoice.customerId ?? null,
    qbRealmId: invoice.realmId ?? null,
    qbInvoiceId: invoice.id || null,
    qbUpdatedAt: updatedAt,
    source: "quickbooks",
  };

  if (!existing) {
    const taken = invoice.docNumber
      ? await prisma.order.findUnique({ where: { externalRef: invoice.docNumber } })
      : null;
    const externalRef = !invoice.docNumber || taken ? `qb:${invoice.realmId ?? "qb"}:${invoice.id}` : invoice.docNumber;
    const order = await prisma.order.create({
      data: {
        ...header,
        externalRef,
        status: ExitStatus.PENDING,
        onKanban: false,
        address: invoice.address ?? null,
        voided: Boolean(invoice.voided || invoice.deleted),
        issues,
        lines: {
          create: matched.map((line) => ({
            productId: line.productId,
            orderedQty: line.quantity,
            remainingQty: line.quantity,
            unitPrice: line.unitPrice,
            physical: line.physical,
          })),
        },
      },
    });
    return { skipped: false as const, order, unmatched };
  }

  // Once any delivery's units left, QuickBooks changes are flagged instead of applied.
  const frozen =
    existing.deliveries.some((d) => d.stockOutAt || d.dispatchedAt || d.status === ExitStatus.COMPLETED) ||
    Boolean(existing.dispatchedAt) ||
    existing.status === ExitStatus.COMPLETED;
  if (invoice.deleted || invoice.voided) {
    if (frozen) {
      const order = await prisma.order.update({
        where: { id: existing.id },
        data: {
          ...header,
          voided: true,
          issues: "QuickBooks voided this invoice after it left the warehouse. Review it before changing stock.",
        },
      });
      return { skipped: false as const, order, review: true as const };
    }
    await prisma.$transaction(async (tx) => {
      for (const line of existing.lines) {
        if (line.reservedQty <= 0) continue;
        await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${line.productId} FOR UPDATE`;
        const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
        const reserved = roundMoney(Math.max(0, product.reservedQty - line.reservedQty));
        await tx.product.update({
          where: { id: product.id },
          data: {
            reservedQty: reserved,
            availableQty: recomputeAvailable({ physicalQty: product.physicalQty, reservedQty: reserved }),
          },
        });
        await tx.orderLine.update({ where: { id: line.id }, data: { reservedQty: 0 } });
        await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            type: TransactionType.RESERVED,
            quantity: 0,
            unitCost: product.avgCost,
            totalValue: 0,
            reference: existing.externalRef,
            notes: `Released reservation for voided invoice ${existing.externalRef}`,
            userId: "quickbooks",
          },
        });
      }
    });
    await prisma.delivery.deleteMany({ where: { orderId: existing.id } });
    const order = await prisma.order.update({
      where: { id: existing.id },
      data: { ...header, voided: true, onKanban: false, status: ExitStatus.PENDING, issues: "Voided in QuickBooks" },
    });
    return { skipped: false as const, order };
  }

  if (frozen) {
    // A payment also updates the invoice in QuickBooks. Only changed items need a review.
    const linesChanged =
      matched.length !== existing.lines.length ||
      matched.some((line) => existing.lines.find((row) => row.productId === line.productId)?.orderedQty !== line.quantity);
    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        customerName: header.customerName,
        paymentStatus: header.paymentStatus,
        amountPaid: header.amountPaid,
        taxAmount: header.taxAmount,
        qbCustomerId: header.qbCustomerId,
        qbUpdatedAt: header.qbUpdatedAt,
        ...(linesChanged
          ? { issues: "QuickBooks changed this invoice after it left the warehouse. Stock and proof were left as recorded." }
          : {}),
      },
    });
    return { skipped: false as const, order, review: true as const };
  }

  const quiet = !existing.onKanban && existing.lines.every((line) => line.scannedQty === 0);
  if (quiet) {
    await prisma.orderLine.deleteMany({ where: { orderId: existing.id } });
    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        ...header,
        issues,
        address: existing.address && existing.address !== existing.qbAddress ? existing.address : invoice.address ?? existing.address,
        lines: {
          create: matched.map((line) => ({
            productId: line.productId,
            orderedQty: line.quantity,
            remainingQty: line.quantity,
            unitPrice: line.unitPrice,
            physical: line.physical,
          })),
        },
      },
    });
    return { skipped: false as const, order, unmatched };
  }

  await prisma.$transaction(async (tx) => {
    const seen = new Set<string>();
    for (const line of matched) {
      seen.add(line.productId);
      const current = existing.lines.find((row) => row.productId === line.productId);
      if (!current) {
        const created = await tx.orderLine.create({
          data: {
            orderId: existing.id,
            productId: line.productId,
            orderedQty: line.quantity,
            remainingQty: line.quantity,
            unitPrice: line.unitPrice,
            physical: line.physical,
            reservedQty: existing.onKanban && line.physical ? line.quantity : 0,
          },
        });
        if (existing.onKanban && line.physical) {
          await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${line.productId} FOR UPDATE`;
          const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
          const reserved = roundMoney(product.reservedQty + line.quantity);
          await tx.product.update({
            where: { id: product.id },
            data: {
              reservedQty: reserved,
              availableQty: recomputeAvailable({ physicalQty: product.physicalQty, reservedQty: reserved }),
            },
          });
        }
        void created;
        continue;
      }
      const delta = line.quantity - current.orderedQty;
      await tx.orderLine.update({
        where: { id: current.id },
        data: {
          orderedQty: line.quantity,
          remainingQty: line.quantity,
          unitPrice: line.unitPrice,
          physical: line.physical,
          scannedQty: Math.min(current.scannedQty, line.quantity),
          reservedQty: existing.onKanban && line.physical ? line.quantity : current.reservedQty,
        },
      });
      if (existing.onKanban && line.physical && delta !== 0) {
        await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${line.productId} FOR UPDATE`;
        const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
        const reserved = roundMoney(Math.max(0, product.reservedQty + delta));
        await tx.product.update({
          where: { id: product.id },
          data: {
            reservedQty: reserved,
            availableQty: recomputeAvailable({ physicalQty: product.physicalQty, reservedQty: reserved }),
          },
        });
      }
    }
    for (const current of existing.lines) {
      if (seen.has(current.productId) || current.scannedQty > 0) continue;
      if (current.reservedQty > 0) {
        await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${current.productId} FOR UPDATE`;
        const product = await tx.product.findUniqueOrThrow({ where: { id: current.productId } });
        const reserved = roundMoney(Math.max(0, product.reservedQty - current.reservedQty));
        await tx.product.update({
          where: { id: product.id },
          data: {
            reservedQty: reserved,
            availableQty: recomputeAvailable({ physicalQty: product.physicalQty, reservedQty: reserved }),
          },
        });
      }
      await tx.orderLine.delete({ where: { id: current.id } });
    }
    // Deliveries follow the new quantities; a processing one that is now short goes back to Preparing.
    const reopened = await fitDeliveries(tx, existing.id);
    await tx.order.update({
      where: { id: existing.id },
      data: {
        ...header,
        issues,
        address: existing.address && existing.address !== existing.qbAddress ? existing.address : invoice.address ?? existing.address,
      },
    });
    for (const number of reopened) {
      await tx.orderEvent.create({
        data: {
          orderId: existing.id,
          kind: "stage",
          message: `QuickBooks changed the items. Delivery ${number} needs to be prepared again.`,
          actor: "QuickBooks",
        },
      });
    }
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: existing.id } });
  return { skipped: false as const, order, unmatched };
}

export async function ingestItems(raw: unknown) {
  const items = parseQbItems(raw);
  const created: string[] = [];
  const skipped: string[] = [];
  const known = new Set(
    (await prisma.product.findMany({ select: { sku: true, secondarySku: true } })).flatMap((p) => [p.sku, p.secondarySku]),
  );
  for (const item of items) {
    const id = str(item.Id) || str(item.id);
    const name = str(item.Name) || str(item.name);
    const type = str(item.Type) || str(item.type);
    if (!id || !name) continue;
    // Discount, shipping, fee and service items are never stock, whatever their QuickBooks type.
    if ((type && type !== "Inventory") || !isPhysicalLine(name)) {
      skipped.push(id);
      continue;
    }
    const sku = str(item.Sku) || str(item.sku) || `QB-${id}`;
    if (known.has(sku) || known.has(`qb:${id}`)) {
      skipped.push(sku);
      continue;
    }
    known.add(sku).add(`qb:${id}`);
    // "240 - Door…": the ID lives in its own field here and goes back into the name on push.
    const parts = name.match(/^(\w{1,3}) ?- (.+)$/);
    const preferred = parts?.[1].toUpperCase();
    const codeTaken = preferred
      ? await prisma.product.findUnique({ where: { code: preferred } })
      : null;
    try {
      await createProduct({
        name: parts ? parts[2].trim() : name,
        sku,
        code: preferred && !codeTaken ? preferred : undefined,
        secondarySku: `qb:${id}`,
        initialQty: Math.max(0, num(item.QtyOnHand ?? item.qtyOnHand)),
        notes: "Imported from QuickBooks (qty is owned here after this)",
      });
      created.push(sku);
    } catch {
      skipped.push(sku);
    }
  }
  return { created, skipped };
}
