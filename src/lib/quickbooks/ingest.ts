import { ExitStatus, type Order, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createProduct, nextNumber } from "@/lib/inventory/service";
import { splitName } from "@/lib/photos/name";
import { isPhysicalLine, UNMATCHED, unmatchedItems } from "@/lib/inventory/delivery-rules";
import { deliveryPrefs, fitDeliveries, reserveOpenDeliveries, syncOrder } from "@/lib/inventory/orders";
import { recomputeAvailable, roundMoney } from "@/lib/inventory/math";
import { storeQbSyncEvent } from "@/lib/quickbooks/adapter";
import { pushQuickBooksItem, qbSettings } from "@/lib/quickbooks/qbo";

/** Invoices dated before this never become orders. Stock counting starts here. */
export const INVOICES_FROM = "2026-10-01";

export type QbLineIn = {
  /** QuickBooks' own id of the invoice line. */
  lineId?: string;
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

/** "Grill:38 - Grill GA01…" → "38 - Grill GA01…": QuickBooks names sub-items after their parent. */
function itemName(name: string) {
  return name.replace(/^.*:/, "").trim();
}

function codeFromName(name: string) {
  const m = itemName(name).match(/^(\d{1,3})\b/);
  return m?.[1];
}

/**
 * QuickBooks voids an invoice by zeroing it and adding "Voided" to its private note (after any
 * note already there). The invoice API has no void status of its own.
 */
export function isVoidedNote(note: unknown) {
  return typeof note === "string" && /(^|\s)Voided\s*$/i.test(note.trim());
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
      lineId: str(line.Id) || undefined,
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
    voided: isVoidedNote(inv.PrivateNote) || str(inv.status) === "Voided" || str(inv.TxnStatus) === "Voided" || inv.void === true,
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
    const plain = itemName(line.name).replace(/^\w{1,3} ?- /, "");
    const byName = await prisma.product.findFirst({
      where: { name: { in: [...new Set([line.name, plain])] } },
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
      return isPhysicalLine(line.name)
        ? `${UNMATCHED}${name} (qty ${line.quantity}${line.itemId ? `, QuickBooks item ${line.itemId}` : ""})`
        : `Service line not in inventory: ${name}`;
    })
    .join("\n");
}

type Matched = { lineId?: string; productId: string; quantity: number; unitPrice: number; physical: boolean; name?: string };

async function matchedLines(invoice: QbInvoiceIn) {
  const matched: Matched[] = [];
  const unmatched: QbLineIn[] = [];
  for (const line of invoice.lines) {
    const product = await findProduct(line);
    if (!product) {
      unmatched.push(line);
      continue;
    }
    matched.push({
      lineId: line.lineId,
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

type Db = Prisma.TransactionClient | typeof prisma;

async function findExisting(invoice: QbInvoiceIn, db: Db = prisma) {
  if (invoice.realmId && invoice.id) {
    const byQb = await db.order.findUnique({
      where: { qbRealmId_qbInvoiceId: { qbRealmId: invoice.realmId, qbInvoiceId: invoice.id } },
      include: { lines: { orderBy: { id: "asc" } }, deliveries: true },
    });
    if (byQb) return byQb;
  }
  if (!invoice.docNumber) return null;
  const byDoc = await db.order.findUnique({
    where: { externalRef: invoice.docNumber },
    include: { lines: { orderBy: { id: "asc" } }, deliveries: true },
  });
  if (!byDoc) return null;
  if (invoice.id && byDoc.qbInvoiceId && byDoc.qbInvoiceId !== invoice.id) return null;
  if (invoice.realmId && byDoc.qbRealmId && byDoc.qbRealmId !== invoice.realmId) return null;
  return byDoc;
}

type ExistingLine = { id: string; productId: string; orderedQty: number; reservedQty: number; unitPrice: number; deliveredQty: number; qbLineId: string | null };

/**
 * Pairs QuickBooks lines with the invoice's lines: by QuickBooks line id first, then by product
 * for lines saved before ids were kept. Each line pairs once, so the same item on two lines stays
 * two lines. Leftovers are lines QuickBooks no longer has.
 */
export function pairLines<L extends ExistingLine>(existing: L[], matched: Matched[]) {
  const free = [...existing];
  const take = (test: (row: L) => boolean) => {
    const i = free.findIndex(test);
    return i < 0 ? undefined : free.splice(i, 1)[0];
  };
  const pairs: { line: Matched; current?: L }[] = matched.map((line) => ({
    line,
    current: line.lineId ? take((row) => row.qbLineId === line.lineId && row.productId === line.productId) : undefined,
  }));
  for (const pair of pairs) pair.current ??= take((row) => row.productId === pair.line.productId);
  return { pairs, leftovers: free };
}

/** Moves a product's reservation by `delta` units, under its lock. */
async function moveReserved(tx: Prisma.TransactionClient, productId: string, delta: number) {
  if (!delta) return;
  await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${productId} FOR UPDATE`;
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  const reserved = roundMoney(Math.max(0, product.reservedQty + delta));
  await tx.product.update({
    where: { id: productId },
    data: { reservedQty: reserved, availableQty: recomputeAvailable({ ...product, reservedQty: reserved }) },
  });
}

function lineData(line: Matched) {
  return {
    productId: line.productId,
    qbLineId: line.lineId ?? null,
    orderedQty: line.quantity,
    remainingQty: line.quantity,
    unitPrice: line.unitPrice,
    physical: line.physical,
  };
}

export async function ingestInvoice(raw: unknown, retried = false): Promise<IngestResult> {
  const invoice = parseQbInvoice(raw);
  if (!invoice) throw new Error("Not a QuickBooks invoice payload");
  if (invoice.rejected === "estimate") {
    return { skipped: true as const, reason: "estimate" };
  }

  invoice.realmId ||= (await qbSettings()).realmId || undefined;
  const found = await findExisting(invoice);
  const updatedAt = invoice.updatedAt ? new Date(invoice.updatedAt) : null;
  const voidedNow = Boolean(invoice.voided || invoice.deleted);
  // Same version, same void state and every item matched: nothing to do. An invoice with items
  // that had no product here goes again each time, so a product created or linked later joins it.
  if (found?.qbUpdatedAt && updatedAt && updatedAt <= found.qbUpdatedAt && found.voided === voidedNow && !unmatchedItems(found.issues).length) {
    return { skipped: true as const, reason: "unchanged", order: found };
  }
  // Only invoices dated from INVOICES_FROM become orders. A deleted or voided one we never had stays out.
  if (!found && (invoice.deleted || invoice.voided || !invoice.txnDate || invoice.txnDate < INVOICES_FROM)) {
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

  if (!found) {
    const taken = invoice.docNumber
      ? await prisma.order.findUnique({ where: { externalRef: invoice.docNumber } })
      : null;
    const externalRef = !invoice.docNumber || taken ? `qb:${invoice.realmId ?? "qb"}:${invoice.id}` : invoice.docNumber;
    try {
      const order = await prisma.order.create({
        data: {
          ...header,
          externalRef,
          status: ExitStatus.PENDING,
          onKanban: false,
          address: invoice.address ?? null,
          voided: Boolean(invoice.voided || invoice.deleted),
          issues,
          lines: { create: matched.map(lineData) },
        },
      });
      return { skipped: false as const, order, unmatched };
    } catch (error) {
      // Another run created it a moment ago: apply this version to that one instead.
      if (!retried && typeof error === "object" && error && "code" in error && error.code === "P2002") return ingestInvoice(raw, true);
      throw error;
    }
  }

  // Everything below happens under the invoice's lock, on a fresh read, so a second sync, the
  // webhook and the people working the invoice take turns instead of overwriting each other.
  return prisma.$transaction(async (tx): Promise<IngestResult> => {
    await tx.$queryRaw`SELECT 1 FROM "Order" WHERE id = ${found.id} FOR UPDATE`;
    const existing = (await tx.order.findUniqueOrThrow({
      where: { id: found.id },
      include: { lines: { orderBy: { id: "asc" } }, deliveries: true },
    }));
    if (existing.qbUpdatedAt && updatedAt && updatedAt <= existing.qbUpdatedAt && existing.voided === voidedNow && !unmatchedItems(existing.issues).length) {
      return { skipped: true as const, reason: "unchanged", order: existing };
    }

    // The invoice always follows QuickBooks. Stock only moves with what physically happens:
    // reservations follow the deliveries that haven't left; units that already left stay out.
    const voided = Boolean(invoice.deleted || invoice.voided);
    const { pairs, leftovers } = pairLines(existing.lines, voided ? [] : matched);
    const before = new Map(existing.lines.map((line) => [line.id, line.orderedQty]));
    const changed: string[] = [];

    for (const { line, current } of pairs) {
      const data = { ...lineData(line), remainingQty: Math.max(0, line.quantity - (current?.deliveredQty ?? 0)) };
      if (!current) {
        await tx.orderLine.create({ data: { ...data, orderId: existing.id } });
        changed.push(`${line.name ?? "item"} added (${line.quantity})`);
        continue;
      }
      await tx.orderLine.update({ where: { id: current.id }, data });
      if (before.get(current.id) !== line.quantity) changed.push(`${line.name ?? "item"} ${before.get(current.id)} → ${line.quantity}`);
      // Prices don't move stock. The product's last sold price follows when this invoice set it.
      if (current.deliveredQty > 0 && line.unitPrice && current.unitPrice !== line.unitPrice) {
        await tx.product.updateMany({
          where: { id: line.productId, lastSoldPrice: current.unitPrice },
          data: { lastSoldPrice: line.unitPrice },
        });
      }
    }
    for (const current of leftovers) {
      changed.push(`a line of ${current.orderedQty} removed`);
      if (current.deliveredQty > 0) {
        // Units already left for it: the line stays, at 0, so what was delivered stays on record.
        await tx.orderLine.update({ where: { id: current.id }, data: { orderedQty: 0, remainingQty: 0 } });
      } else {
        await moveReserved(tx, current.productId, -current.reservedQty);
        await tx.orderLine.delete({ where: { id: current.id } });
      }
    }

    // Deliveries follow the new quantities; reservations follow the deliveries.
    const fit = existing.onKanban ? await fitDeliveries(tx, existing.id) : { reopened: [], created: null };
    const deliveries = await tx.delivery.count({ where: { orderId: existing.id } });
    if (existing.onKanban && !deliveries) {
      await tx.order.update({ where: { id: existing.id }, data: { onKanban: false, status: ExitStatus.PENDING, completedAt: null } });
    }
    await reserveOpenDeliveries(tx, existing.id);
    if (deliveries) await syncOrder(tx, existing.id, await deliveryPrefs(tx));

    // What needs a person: lines QuickBooks has that aren't products here, stock reserved beyond
    // what there is, and units delivered beyond the invoice that should come back.
    const lines = await tx.orderLine.findMany({ where: { orderId: existing.id }, include: { product: { select: { name: true, availableQty: true } } } });
    const awaiting = lines
      .filter((line) => line.deliveredQty - line.returnedQty > line.orderedQty)
      .map((line) => `Awaiting return: ${line.product.name}, ${line.deliveredQty - line.returnedQty - line.orderedQty} delivered beyond the invoice`);
    const short = [...new Map(lines.filter((line) => line.product.availableQty < 0).map((line) => [line.productId, line.product])).values()]
      .map((p) => `Not enough stock: ${p.name} is short ${-p.availableQty}`);
    const notes = [voided ? "Voided in QuickBooks" : null, voided ? null : issues, ...short, ...awaiting].filter(Boolean);

    const address = existing.address && existing.address !== existing.qbAddress ? existing.address : invoice.address ?? existing.address;
    const order = await tx.order.update({
      where: { id: existing.id },
      data: { ...header, voided, issues: notes.join("\n") || null, address },
    });

    const say = (message: string) =>
      tx.orderEvent.create({ data: { orderId: existing.id, kind: "quickbooks", message, actor: "QuickBooks" } });
    if (voided && !existing.voided) await say("Voided in QuickBooks. Units that hadn't left were released.");
    else if (changed.length) await say(`QuickBooks changed the items: ${changed.join(", ")}.`);
    if (fit.created) await say(`Delivery ${fit.created} added for the units QuickBooks added.`);
    for (const number of fit.reopened) await say(`Delivery ${number} needs to be prepared again.`);
    return { skipped: false as const, order, unmatched };
  });
}

type IngestResult =
  | { skipped: true; reason: string; order?: Order }
  | { skipped: false; order: Order; unmatched?: QbLineIn[]; review?: true };

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
    // A number another product has gets the next free one, written back so QuickBooks shows it.
    // Without a number it joins the secondary line (23A…), which never touches plain numbers.
    const codeTaken = preferred
      ? await prisma.product.findUnique({ where: { code: preferred } })
      : null;
    // The name is category + family + variant, so its first two words place the product.
    const productName = parts ? parts[2].trim() : name;
    const split = splitName(productName);
    try {
      const product = await createProduct({
        name: productName,
        category: split.category || null,
        model: split.model || null,
        sku,
        code: codeTaken ? await nextNumber() : preferred,
        secondarySku: `qb:${id}`,
        initialQty: Math.max(0, num(item.QtyOnHand ?? item.qtyOnHand)),
        notes: "Imported from QuickBooks (qty is owned here after this)",
        userId: "quickbooks",
      });
      if (codeTaken) await pushQuickBooksItem(product).catch(() => undefined);
      created.push(sku);
    } catch {
      skipped.push(sku);
    }
  }
  return { created, skipped };
}
