import { randomBytes } from "crypto";
import { ExitStatus, TransactionType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, parseAccess } from "@/lib/access";
import { recomputeAvailable, roundMoney } from "@/lib/inventory/math";
import { appendTransaction } from "@/lib/inventory/service";
import {
  DEFAULT_PREFS,
  PREP_INCOMPLETE,
  matchScan,
  modeError,
  moveError,
  preparationDone,
  stageOf,
  stockShouldBeOut,
  workflowError,
  type DeliveryPrefs,
} from "@/lib/inventory/delivery-rules";

/**
 * Invoices (Order) and their deliveries.
 * - Add to workflow reserves every physical line and opens delivery 1 with all of it.
 * - A split moves units to a new delivery; they stay reserved until that one goes.
 * - Each delivery's units leave stock at the stage set in Preferences (completed by default).
 * - Delays never move stock. Back to New releases the reservation if nothing left yet.
 */

export type Actor = { id: string; name: string };
type Tx = Prisma.TransactionClient;

const DAY = 24 * 60 * 60 * 1000;
const PRODUCT = { id: true, name: true, sku: true, code: true, ean: true, secondarySku: true } as const;
const PROOF = { id: true, kind: true, createdAt: true, actor: true, deliveryId: true, public: true } as const;

const listInclude = {
  lines: { include: { product: { select: PRODUCT } }, orderBy: { id: "asc" as const } },
  deliveries: {
    orderBy: { number: "asc" as const },
    include: { lines: true, assignee: { select: { id: true, name: true } } },
  },
} satisfies Prisma.OrderInclude;

const detailInclude = {
  lines: listInclude.lines,
  deliveries: {
    orderBy: { number: "asc" as const },
    include: {
      lines: true,
      assignee: { select: { id: true, name: true } },
      proofs: { select: PROOF, orderBy: { createdAt: "asc" as const } },
    },
  },
  events: { orderBy: { createdAt: "desc" as const } },
  proofs: { select: PROOF, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

const DELAY_REASONS: Record<string, string> = {
  payment: "Waiting for payment",
  stock: "Unavailable stock",
  reschedule: "Customer reschedule",
  transport: "Transportation issue",
};

export async function deliveryPrefs(db: Tx = prisma): Promise<DeliveryPrefs> {
  const s = await db.appSettings.findUnique({ where: { id: "default" } });
  if (!s) return DEFAULT_PREFS;
  return {
    stockStage: s.stockStage === "ready" || s.stockStage === "out" ? s.stockStage : "completed",
    allowPaid: s.allowPaid,
    allowUnpaid: s.allowUnpaid,
    collectUnpaid: s.collectUnpaid,
    prepMethod: s.prepMethod === "scan" ? "scan" : "manual",
    trackingDays: s.trackingDays,
  };
}

async function log(
  tx: Tx,
  orderId: string,
  actor: Actor,
  kind: string,
  message: string,
  opts?: { public?: boolean; meta?: string },
) {
  await tx.orderEvent.create({
    data: { orderId, kind, message, actor: actor.name || actor.id, public: opts?.public ?? false, meta: opts?.meta },
  });
}

async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "Order" WHERE id = ${id} FOR UPDATE`;
}

async function lockProduct(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${id} FOR UPDATE`;
}

function detail(tx: Tx, orderId: string) {
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: detailInclude });
}

/** Locks the invoice, then reads the delivery with its lines, products and invoice. */
async function lockedDelivery(tx: Tx, deliveryId: string) {
  const ref = await tx.delivery.findUnique({ where: { id: deliveryId }, select: { orderId: true } });
  if (!ref) throw new Error("This delivery no longer exists.");
  await lockOrder(tx, ref.orderId);
  const delivery = await tx.delivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: {
      lines: { include: { orderLine: { include: { product: { select: PRODUCT } } } }, orderBy: { id: "asc" } },
      order: true,
      proofs: { select: PROOF },
    },
  });
  if (delivery.order.voided) throw new Error("This invoice is voided in QuickBooks.");
  return delivery;
}

function assertWhole(lines: { physical: boolean; orderedQty: number }[]) {
  if (lines.some((line) => line.physical && Math.abs(line.orderedQty - Math.round(line.orderedQty)) > 0.001)) {
    throw new Error("This invoice has a fractional quantity of a product. Fix it in QuickBooks first.");
  }
}

function units(n: number) {
  return `${n} ${n === 1 ? "unit" : "units"}`;
}

/** "Thu, Oct 8" in New York time. */
function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" }).format(date);
}

/** A YYYY-MM-DD day, stored at noon UTC so it is the same day in New York. */
function parseDay(day: string | null | undefined) {
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Pick a valid date");
  return new Date(`${day}T12:00:00.000Z`);
}

/** "9:00 AM" from "09:00". */
function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Times look like 09:00");
  return value;
}

async function changeReserved(tx: Tx, productId: string, delta: number) {
  await lockProduct(tx, productId);
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  const reserved = roundMoney(Math.max(0, product.reservedQty + delta));
  await tx.product.update({
    where: { id: productId },
    data: { reservedQty: reserved, availableQty: recomputeAvailable({ physicalQty: product.physicalQty, reservedQty: reserved }) },
  });
  return product;
}

async function reserveOrder(
  tx: Tx,
  order: { id: string; externalRef: string; customerName: string | null; lines: { id: string; productId: string; orderedQty: number; reservedQty: number; physical: boolean }[] },
  actor: Actor,
) {
  let total = 0;
  for (const line of order.lines) {
    if (!line.physical || line.reservedQty > 0) continue;
    const product = await changeReserved(tx, line.productId, line.orderedQty);
    await tx.orderLine.update({ where: { id: line.id }, data: { reservedQty: line.orderedQty, remainingQty: line.orderedQty } });
    await tx.inventoryTransaction.create({
      data: {
        productId: line.productId,
        type: TransactionType.RESERVED,
        quantity: 0,
        unitCost: product.avgCost,
        totalValue: 0,
        reference: order.externalRef,
        clientName: order.customerName,
        notes: `Reserved for invoice ${order.externalRef}`,
        userId: actor.id,
        metadata: JSON.stringify({ orderId: order.id, action: "reserve" }),
      },
    });
    total += line.orderedQty;
  }
  return total;
}

/** Gives back what's still reserved for the invoice. */
export async function releaseOrder(tx: Tx, orderId: string, actorId: string, note: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
  for (const line of order.lines) {
    if (line.reservedQty <= 0) continue;
    const product = await changeReserved(tx, line.productId, -line.reservedQty);
    await tx.orderLine.update({ where: { id: line.id }, data: { reservedQty: 0 } });
    await tx.inventoryTransaction.create({
      data: {
        productId: line.productId,
        type: TransactionType.RESERVED,
        quantity: 0,
        unitCost: product.avgCost,
        totalValue: 0,
        reference: order.externalRef,
        notes: `${note} ${order.externalRef}`,
        userId: actorId,
        metadata: JSON.stringify({ orderId, action: "release" }),
      },
    });
  }
}

/** Takes one delivery's units out of stock, once. Returns how many left. */
async function stockOut(tx: Tx, deliveryId: string, actor: Actor) {
  const delivery = await tx.delivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: { lines: { include: { orderLine: true } }, order: true },
  });
  if (delivery.stockOutAt) return 0;
  let total = 0;
  for (const row of delivery.lines) {
    const line = row.orderLine;
    if (!line.physical || row.qty <= 0) continue;
    await appendTransaction(tx, {
      productId: line.productId,
      type: TransactionType.SOLD,
      quantity: -row.qty,
      reference: delivery.order.externalRef,
      clientName: delivery.order.customerName,
      notes: `${delivery.mode === "PICKUP" ? "Collected" : "Delivered"} · invoice ${delivery.order.externalRef}, delivery ${delivery.number}`,
      affectsPhysical: true,
      affectsCost: false,
      userId: actor.id,
      metadata: { orderId: delivery.orderId, deliveryId, action: "stock-out" },
    });
    const fromReserved = Math.min(row.qty, line.reservedQty);
    const after = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
    const reserved = roundMoney(Math.max(0, after.reservedQty - fromReserved));
    await tx.product.update({
      where: { id: after.id },
      data: {
        reservedQty: reserved,
        availableQty: recomputeAvailable({ physicalQty: after.physicalQty, reservedQty: reserved }),
        lastSoldPrice: line.unitPrice || after.lastSoldPrice,
      },
    });
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        reservedQty: roundMoney(line.reservedQty - fromReserved),
        deliveredQty: roundMoney(line.deliveredQty + row.qty),
        remainingQty: roundMoney(Math.max(0, line.remainingQty - row.qty)),
      },
    });
    total += row.qty;
  }
  await tx.delivery.update({ where: { id: deliveryId }, data: { stockOutAt: new Date() } });
  return total;
}

async function stockOutIfDue(tx: Tx, deliveryId: string, prefs: DeliveryPrefs, actor: Actor) {
  const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (delivery.stockOutAt || !stockShouldBeOut(prefs.stockStage, delivery.mode, stageOf(delivery))) return;
  const out = await stockOut(tx, deliveryId, actor);
  if (out) await log(tx, delivery.orderId, actor, "stock", `${units(out)} taken out of stock${await deliveryTag(tx, delivery)}`);
}

/** " (delivery 2)" when the invoice has more than one. */
async function deliveryTag(tx: Tx, delivery: { orderId: string; number: number }) {
  const count = await tx.delivery.count({ where: { orderId: delivery.orderId } });
  return count > 1 ? ` (delivery ${delivery.number})` : "";
}

const RANK: Record<string, number> = { PENDING: 0, PREPARING: 1, TO_DELIVER: 2, IN_TRANSIT: 3, COMPLETED: 4 };

/** The invoice sums up its deliveries: completed once all are, else the one furthest behind. */
async function syncOrder(tx: Tx, orderId: string, prefs: DeliveryPrefs) {
  const deliveries = await tx.delivery.findMany({ where: { orderId } });
  if (!deliveries.length) return;
  const open = deliveries.filter((d) => d.status !== ExitStatus.COMPLETED);
  if (!open.length) {
    const doneAt = new Date(Math.max(...deliveries.map((d) => (d.completedAt ?? new Date()).getTime())));
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: ExitStatus.COMPLETED,
        completedAt: doneAt,
        trackingExpiresAt: new Date(doneAt.getTime() + prefs.trackingDays * DAY),
      },
    });
    return;
  }
  const behind = open.map((d) => stageOf(d) as ExitStatus).sort((a, b) => RANK[a]! - RANK[b]!)[0]!;
  await tx.order.update({ where: { id: orderId }, data: { status: behind, completedAt: null, trackingExpiresAt: null } });
}

/**
 * After QuickBooks changes an invoice's items: open deliveries take the difference (the last
 * one first), so together they still cover each physical line. Returns the numbers of
 * processing deliveries that are now short and went back to Preparing.
 */
export async function fitDeliveries(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true, deliveries: { include: { lines: true }, orderBy: { number: "asc" } } },
  });
  const open = order.deliveries.filter((d) => !d.stockOutAt && d.status !== ExitStatus.COMPLETED);
  if (!open.length) return [];
  for (const line of order.lines) {
    const rows = order.deliveries.flatMap((d) => d.lines.filter((row) => row.orderLineId === line.id));
    let delta = (line.physical ? line.orderedQty : 0) - rows.reduce((sum, row) => sum + row.qty, 0);
    if (delta > 0) {
      const target = open.at(-1)!;
      const row = target.lines.find((r) => r.orderLineId === line.id);
      if (row) await tx.deliveryLine.update({ where: { id: row.id }, data: { qty: row.qty + delta } });
      else await tx.deliveryLine.create({ data: { deliveryId: target.id, orderLineId: line.id, qty: delta } });
    }
    for (const d of [...open].reverse()) {
      if (delta >= 0) break;
      const row = d.lines.find((r) => r.orderLineId === line.id);
      if (!row) continue;
      const cut = Math.min(row.qty, -delta);
      delta += cut;
      if (row.qty - cut <= 0) await tx.deliveryLine.delete({ where: { id: row.id } });
      else {
        await tx.deliveryLine.update({
          where: { id: row.id },
          data: { qty: row.qty - cut, preparedQty: Math.min(row.preparedQty, row.qty - cut) },
        });
      }
    }
  }
  const reopened: number[] = [];
  for (const d of open) {
    const lines = await tx.deliveryLine.findMany({ where: { deliveryId: d.id } });
    if (stageOf(d) !== ExitStatus.TO_DELIVER || d.dispatchedAt || preparationDone(lines)) continue;
    await tx.delivery.update({
      where: { id: d.id },
      data: d.status === ExitStatus.DELAYED ? { priorStatus: ExitStatus.PREPARING } : { status: ExitStatus.PREPARING },
    });
    reopened.push(d.number);
  }
  return reopened;
}

// ---------------------------------------------------------------- reads

export async function listOrders() {
  return prisma.order.findMany({
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    include: listInclude,
  });
}

export async function getOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, include: detailInclude });
}

/** People a delivery can go to: active, with edit access to Delivery. */
async function assignable() {
  const users = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true, access: { select: { main: true, access: true } } },
    orderBy: { name: "asc" },
  });
  return users
    .filter((user) => user.access && (user.access.main || can(parseAccess(user.access.access), "delivery", "edit")))
    .map(({ id, name }) => ({ id, name }));
}

export async function deliveryMeta() {
  const [users, settings, prefs] = await Promise.all([
    assignable(),
    prisma.appSettings.findUnique({ where: { id: "default" }, select: { qbSyncedAt: true, qbSyncError: true } }),
    deliveryPrefs(),
  ]);
  return { users, lastSync: settings?.qbSyncedAt ?? null, syncError: settings?.qbSyncError ?? null, prefs };
}

// ---------------------------------------------------------------- invoice

export async function addToWorkflow(orderId: string, actor: Actor) {
  const prefs = await deliveryPrefs();
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true, deliveries: true } });
    if (order.deliveries.length) return detail(tx, orderId);
    if (order.status === ExitStatus.COMPLETED) throw new Error("Completed invoices stay in history.");
    const blocked = workflowError(order, prefs);
    if (blocked) throw new Error(blocked);
    assertWhole(order.lines);
    const reserved = await reserveOrder(tx, order, actor);
    // Unpaid with unpaid deliveries off: it can only be collected.
    const mode = order.paymentStatus !== "Paid" && !prefs.allowUnpaid ? "PICKUP" : "DELIVERY";
    await tx.delivery.create({
      data: {
        orderId,
        number: 1,
        mode,
        lines: { create: order.lines.filter((line) => line.physical).map((line) => ({ orderLineId: line.id, qty: line.orderedQty })) },
      },
    });
    await log(tx, orderId, actor, "stage", `Added to the workflow · ${units(reserved)} reserved`);
    await tx.order.update({ where: { id: orderId }, data: { onKanban: true, status: ExitStatus.PENDING } });
    return detail(tx, orderId);
  });
}

export async function removeFromWorkflow(orderId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { deliveries: true } });
    if (order.deliveries.some((d) => d.stockOutAt || d.dispatchedAt || d.status === ExitStatus.COMPLETED)) {
      throw new Error("Units of this invoice already left the warehouse.");
    }
    if (!order.onKanban && !order.deliveries.length) return detail(tx, orderId);
    await releaseOrder(tx, orderId, actor.id, "Released reservation for invoice");
    await tx.delivery.deleteMany({ where: { orderId } });
    await log(tx, orderId, actor, "stage", "Back to New · reservation released");
    await tx.order.update({ where: { id: orderId }, data: { onKanban: false, status: ExitStatus.PENDING, completedAt: null } });
    return detail(tx, orderId);
  });
}

export async function updateOrder(
  orderId: string,
  input: { address?: string | null; customerPhone?: string | null; notes?: string | null },
) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      address: input.address === undefined ? undefined : input.address?.trim() || null,
      customerPhone: input.customerPhone === undefined ? undefined : input.customerPhone?.trim() || null,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    },
  });
  return getOrder(orderId);
}

export async function addNote(orderId: string, text: string, isPublic: boolean, actor: Actor) {
  const message = text.trim();
  if (!message) throw new Error("Write a note first.");
  return prisma.$transaction(async (tx) => {
    await log(tx, orderId, actor, "note", message, { public: isPublic });
    return detail(tx, orderId);
  });
}

// ---------------------------------------------------------------- deliveries

export async function moveDelivery(deliveryId: string, to: ExitStatus, actor: Actor, opts: { mode?: string } = {}) {
  const prefs = await deliveryPrefs();
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    const mode = opts.mode ?? d.mode;
    if (mode !== "DELIVERY" && mode !== "PICKUP") throw new Error("Choose Delivery or Collect.");
    if (mode !== d.mode && d.dispatchedAt) throw new Error("It's already out for delivery.");
    const from = stageOf(d);
    const prepared = preparationDone(d.lines);
    const error = moveError({ from, to, mode, prepared, dispatched: Boolean(d.dispatchedAt), stockedOut: Boolean(d.stockOutAt) });
    if (error) throw new Error(error);
    if (to === ExitStatus.TO_DELIVER || to === ExitStatus.IN_TRANSIT) {
      const unpaid = modeError(d.order, prefs, mode);
      if (unpaid) throw new Error(unpaid);
    }
    if (to === d.status && mode === d.mode) return detail(tx, d.orderId);
    await tx.delivery.update({
      where: { id: d.id },
      data: {
        status: to,
        mode,
        priorStatus: null,
        delayReason: null,
        dispatchedAt: to === ExitStatus.IN_TRANSIT ? new Date() : d.dispatchedAt,
      },
    });
    const done = d.lines.reduce((sum, line) => sum + Math.min(line.preparedQty, line.qty), 0);
    const all = d.lines.reduce((sum, line) => sum + line.qty, 0);
    const message =
      to === from
        ? d.status === ExitStatus.DELAYED
          ? "Back on schedule"
          : `Changed to ${mode === "PICKUP" ? "Collect" : "Delivery"}`
        : RANK[to]! < RANK[from]!
          ? `Moved back to ${to === ExitStatus.PENDING ? "Pending" : to === ExitStatus.PREPARING ? "Preparing" : "Processing"}`
          : to === ExitStatus.PREPARING
            ? "Started preparing"
            : to === ExitStatus.TO_DELIVER
              ? mode === "PICKUP"
                ? `Ready to collect · ${done} of ${all} prepared`
                : `Moved to processing (Delivery) · ${done} of ${all} prepared`
              : "Out for delivery";
    await log(tx, d.orderId, actor, "stage", `${message}${await deliveryTag(tx, d)}`, {
      public: to === ExitStatus.IN_TRANSIT,
      meta: to,
    });
    await stockOutIfDue(tx, d.id, prefs, actor);
    await syncOrder(tx, d.orderId, prefs);
    return detail(tx, d.orderId);
  });
}

export async function delayDelivery(
  deliveryId: string,
  input: { reason: string; date?: string | null; note?: string | null },
  actor: Actor,
) {
  const label = DELAY_REASONS[input.reason];
  if (!label) throw new Error("Choose a delay reason.");
  const date = input.date === undefined ? undefined : parseDay(input.date);
  const prefs = await deliveryPrefs();
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    if (d.status === ExitStatus.COMPLETED) throw new Error("This delivery is already completed.");
    const prior = d.status === ExitStatus.DELAYED ? d.priorStatus : d.status;
    await tx.delivery.update({
      where: { id: d.id },
      data: {
        status: ExitStatus.DELAYED,
        priorStatus: prior,
        delayReason: input.reason,
        deliverBy: date === undefined ? undefined : date,
      },
    });
    const tag = await deliveryTag(tx, d);
    if (date !== undefined && date?.getTime() !== d.deliverBy?.getTime()) {
      await log(tx, d.orderId, actor, "schedule", date ? `New date: ${dayLabel(date)}${tag}` : `Date cleared${tag}`, {
        meta: JSON.stringify({ from: d.deliverBy, to: date }),
      });
    }
    await log(tx, d.orderId, actor, "delay", `Delayed: ${label}${tag}`, { meta: prior ?? undefined });
    if (input.note?.trim()) await log(tx, d.orderId, actor, "note", input.note.trim(), { public: true });
    await syncOrder(tx, d.orderId, prefs);
    return detail(tx, d.orderId);
  });
}

export async function scheduleDelivery(
  deliveryId: string,
  input: { date: string | null; windowStart?: string | null; windowEnd?: string | null },
  actor: Actor,
) {
  const date = parseDay(input.date);
  const start = date ? parseTime(input.windowStart) : null;
  const end = date ? parseTime(input.windowEnd) : null;
  if (start && end && end <= start) throw new Error("The window ends before it starts");
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    if (d.status === ExitStatus.COMPLETED) throw new Error("This delivery is already completed.");
    await tx.delivery.update({ where: { id: d.id }, data: { deliverBy: date, windowStart: start, windowEnd: end } });
    const window = start && end ? ` · ${clock(start)}–${clock(end)}` : start ? ` · after ${clock(start)}` : end ? ` · before ${clock(end)}` : "";
    await log(tx, d.orderId, actor, "schedule", date ? `Scheduled for ${dayLabel(date)}${window}${await deliveryTag(tx, d)}` : "Date cleared", {
      meta: JSON.stringify({ from: d.deliverBy, to: date }),
    });
    return detail(tx, d.orderId);
  });
}

export async function updateDelivery(deliveryId: string, input: { assigneeId?: string | null; mode?: string }, actor: Actor) {
  const prefs = await deliveryPrefs();
  const people = input.assigneeId ? await assignable() : [];
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    if (d.status === ExitStatus.COMPLETED) throw new Error("This delivery is already completed.");
    const data: { assigneeId?: string | null; mode?: string } = {};
    if (input.assigneeId !== undefined && input.assigneeId !== d.assigneeId) {
      const person = people.find((p) => p.id === input.assigneeId);
      if (input.assigneeId && !person) throw new Error("Assign someone whose role can edit Delivery.");
      data.assigneeId = input.assigneeId || null;
      await log(tx, d.orderId, actor, "assign", person ? `Assigned to ${person.name}` : "Unassigned");
    }
    if (input.mode !== undefined && input.mode !== d.mode) {
      if (input.mode !== "DELIVERY" && input.mode !== "PICKUP") throw new Error("Choose Delivery or Collect.");
      if (d.dispatchedAt) throw new Error("It's already out for delivery.");
      if (RANK[stageOf(d)]! >= RANK.TO_DELIVER!) {
        const unpaid = modeError(d.order, prefs, input.mode);
        if (unpaid) throw new Error(unpaid);
      }
      data.mode = input.mode;
      await log(tx, d.orderId, actor, "stage", `Changed to ${input.mode === "PICKUP" ? "Collect" : "Delivery"}${await deliveryTag(tx, d)}`);
    }
    if (Object.keys(data).length) await tx.delivery.update({ where: { id: d.id }, data });
    await stockOutIfDue(tx, d.id, prefs, actor);
    return detail(tx, d.orderId);
  });
}

function assertPreparing(d: { status: string; priorStatus: string | null; stockOutAt: Date | null }) {
  const stage = stageOf(d);
  if ((stage !== ExitStatus.PENDING && stage !== ExitStatus.PREPARING) || d.stockOutAt) {
    throw new Error("Preparation is closed. Move it back to Preparing to change counts.");
  }
}

async function startPreparing(tx: Tx, d: { id: string; orderId: string; number: number; status: string }, actor: Actor) {
  if (d.status !== ExitStatus.PENDING) return;
  await tx.delivery.update({ where: { id: d.id }, data: { status: ExitStatus.PREPARING } });
  await log(tx, d.orderId, actor, "stage", `Started preparing${await deliveryTag(tx, d)}`, { meta: ExitStatus.PREPARING });
}

/** Manual preparation: the units of each line taken from the shelf. */
export async function setPrepared(deliveryId: string, counts: Record<string, number>, actor: Actor) {
  const prefs = await deliveryPrefs();
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    assertPreparing(d);
    let changed = false;
    for (const line of d.lines) {
      const raw = counts[line.id];
      if (raw === undefined) continue;
      const qty = Math.round(Number(raw));
      if (!Number.isFinite(qty) || qty < 0 || qty > line.qty) {
        throw new Error(`${line.orderLine.product.name}: count between 0 and ${line.qty}`);
      }
      if (qty === line.preparedQty) continue;
      await tx.deliveryLine.update({ where: { id: line.id }, data: { preparedQty: qty } });
      changed = true;
    }
    if (!changed) return detail(tx, d.orderId);
    await startPreparing(tx, d, actor);
    const after = await tx.deliveryLine.findMany({ where: { deliveryId } });
    const done = after.reduce((sum, line) => sum + line.preparedQty, 0);
    const all = after.reduce((sum, line) => sum + line.qty, 0);
    await log(tx, d.orderId, actor, "prepare", `Counted ${done} of ${all} units${await deliveryTag(tx, d)}`);
    await syncOrder(tx, d.orderId, prefs);
    return detail(tx, d.orderId);
  });
}

/** Scanning preparation: one unit per scan. A repeated scanId (a retry) counts once. */
export async function scanCode(deliveryId: string, code: string, scanId: string, actor: Actor) {
  const prefs = await deliveryPrefs();
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    assertPreparing(d);
    if (scanId && (await tx.orderEvent.findFirst({ where: { orderId: d.orderId, kind: "scan", meta: scanId } }))) {
      return detail(tx, d.orderId);
    }
    const hit = matchScan(code, d.lines.map((line) => line.orderLine.product));
    if (hit.error || !hit.productId) throw new Error(hit.error || "Unknown code");
    const line = d.lines.find((row) => row.orderLine.productId === hit.productId)!;
    if (line.preparedQty >= line.qty) throw new Error(`${line.orderLine.product.name} is already complete.`);
    await tx.deliveryLine.update({ where: { id: line.id }, data: { preparedQty: line.preparedQty + 1 } });
    await startPreparing(tx, d, actor);
    await log(tx, d.orderId, actor, "scan", `Scanned ${line.orderLine.product.name} · ${line.preparedQty + 1} of ${line.qty}`, {
      meta: scanId || undefined,
    });
    await syncOrder(tx, d.orderId, prefs);
    return detail(tx, d.orderId);
  });
}

export async function undoScan(deliveryId: string, lineId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    assertPreparing(d);
    const line = d.lines.find((row) => row.id === lineId);
    if (!line || line.preparedQty <= 0) throw new Error("There is no scan to undo.");
    await tx.deliveryLine.update({ where: { id: line.id }, data: { preparedQty: line.preparedQty - 1 } });
    await log(tx, d.orderId, actor, "unscan", `Removed a scan of ${line.orderLine.product.name}`);
    return detail(tx, d.orderId);
  });
}

/**
 * Keeps `keep` units of each line on this delivery; the rest becomes the next delivery,
 * still reserved, optionally scheduled.
 */
export async function splitDelivery(
  deliveryId: string,
  input: { keep: Record<string, number>; date?: string | null },
  actor: Actor,
) {
  const date = parseDay(input.date ?? null);
  const prefs = await deliveryPrefs();
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    if (d.status === ExitStatus.COMPLETED || d.stockOutAt || d.dispatchedAt) {
      throw new Error("This delivery already left. Split the next one instead.");
    }
    const plan = d.lines.map((line) => {
      const keep = Math.round(Number(input.keep[line.id] ?? line.qty));
      if (!Number.isFinite(keep) || keep < 0 || keep > line.qty) throw new Error(`${line.orderLine.product.name}: keep between 0 and ${line.qty}`);
      return { line, keep, move: line.qty - keep };
    });
    const kept = plan.reduce((sum, row) => sum + row.keep, 0);
    const moved = plan.reduce((sum, row) => sum + row.move, 0);
    if (!kept) throw new Error("Keep at least one unit on this delivery.");
    if (!moved) throw new Error("Choose at least one unit for the next delivery.");
    const last = await tx.delivery.findFirst({ where: { orderId: d.orderId }, orderBy: { number: "desc" } });
    const next = await tx.delivery.create({
      data: {
        orderId: d.orderId,
        number: (last?.number ?? d.number) + 1,
        mode: d.mode,
        assigneeId: d.assigneeId,
        deliverBy: date,
        lines: {
          create: plan
            .filter((row) => row.move > 0)
            .map((row) => ({
              orderLineId: row.line.orderLineId,
              qty: row.move,
              preparedQty: Math.max(0, row.line.preparedQty - row.keep),
            })),
        },
      },
    });
    for (const row of plan) {
      if (row.keep === 0) await tx.deliveryLine.delete({ where: { id: row.line.id } });
      else if (row.move > 0) {
        await tx.deliveryLine.update({
          where: { id: row.line.id },
          data: { qty: row.keep, preparedQty: Math.min(row.line.preparedQty, row.keep) },
        });
      }
    }
    await log(
      tx,
      d.orderId,
      actor,
      "split",
      `Split: delivery ${d.number} takes ${units(kept)}, delivery ${next.number} has ${units(moved)} that stay reserved` +
        (date ? ` for ${dayLabel(date)}` : ""),
    );
    await syncOrder(tx, d.orderId, prefs);
    return detail(tx, d.orderId);
  });
}

export async function addProof(deliveryId: string, url: string, kind: "delivery" | "signed", actor: Actor) {
  if (!url) throw new Error("The photo didn't upload.");
  const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (delivery.status === ExitStatus.COMPLETED) throw new Error("This delivery is already completed.");
  await prisma.orderProof.create({
    data: {
      orderId: delivery.orderId,
      deliveryId,
      url,
      kind,
      // The signed invoice stays internal; door photos show on the tracking page.
      public: kind === "delivery",
      actor: actor.name || actor.id,
    },
  });
  return getOrder(delivery.orderId);
}

export async function removeProof(proofId: string) {
  const proof = await prisma.orderProof.findUniqueOrThrow({ where: { id: proofId }, include: { delivery: true } });
  if (proof.delivery?.status === ExitStatus.COMPLETED) throw new Error("Photos of a completed delivery stay.");
  await prisma.orderProof.delete({ where: { id: proofId } });
  return getOrder(proof.orderId);
}

export async function completeDelivery(deliveryId: string, input: { note?: string | null }, actor: Actor) {
  const prefs = await deliveryPrefs();
  return prisma.$transaction(async (tx) => {
    const d = await lockedDelivery(tx, deliveryId);
    if (d.status === ExitStatus.COMPLETED) return detail(tx, d.orderId);
    if (!preparationDone(d.lines)) throw new Error(PREP_INCOMPLETE);
    const stage = stageOf(d);
    const pickup = d.mode === "PICKUP";
    if (stage !== ExitStatus.TO_DELIVER && stage !== ExitStatus.IN_TRANSIT) throw new Error("Move it to processing first.");
    if (pickup && !d.proofs.some((proof) => proof.kind === "signed")) throw new Error("Add a photo of the signed invoice first.");
    if (!pickup && !d.proofs.some((proof) => proof.kind === "delivery")) throw new Error("Add at least one delivery photo first.");
    if (pickup) {
      const unpaid = modeError(d.order, prefs, d.mode);
      if (unpaid) throw new Error(unpaid);
    }
    const out = await stockOut(tx, d.id, actor);
    const now = new Date();
    await tx.delivery.update({
      where: { id: d.id },
      data: {
        status: ExitStatus.COMPLETED,
        completedAt: now,
        completedBy: actor.name || actor.id,
        dispatchedAt: d.dispatchedAt ?? (pickup ? null : now),
        priorStatus: null,
        delayReason: null,
      },
    });
    const tag = await deliveryTag(tx, d);
    await log(tx, d.orderId, actor, "complete", `${pickup ? "Collected" : "Delivered"}${tag}`, { public: true, meta: ExitStatus.COMPLETED });
    if (out) await log(tx, d.orderId, actor, "stock", `${units(out)} taken out of stock${tag}`);
    if (input.note?.trim()) await log(tx, d.orderId, actor, "note", input.note.trim(), { public: true });
    await syncOrder(tx, d.orderId, prefs);
    return detail(tx, d.orderId);
  });
}

// ---------------------------------------------------------------- tracking

/** One link per invoice. It stops working the set number of days after the last delivery. */
export async function ensureTracking(orderId: string, actor: Actor) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.trackingExpiresAt && order.trackingExpiresAt < new Date()) {
    throw new Error("This invoice's tracking link expired after its delivery.");
  }
  if (order.trackingToken) return { token: order.trackingToken, expiresAt: order.trackingExpiresAt };
  const token = randomBytes(24).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { trackingToken: token } });
    await log(tx, orderId, actor, "track", "Tracking link created");
  });
  return { token, expiresAt: order.trackingExpiresAt };
}

/** Deletes links whose time is up. Also runs from the daily cron. */
export async function purgeExpiredTracking() {
  const { count } = await prisma.order.updateMany({
    where: { trackingToken: { not: null }, trackingExpiresAt: { lt: new Date() } },
    data: { trackingToken: null },
  });
  return count;
}

export async function trackingView(token: string) {
  if (!token) return null;
  const order = await prisma.order.findUnique({ where: { trackingToken: token }, include: detailInclude });
  if (!order) return null;
  if (order.trackingExpiresAt && order.trackingExpiresAt < new Date()) {
    await prisma.order.update({ where: { id: order.id }, data: { trackingToken: null } });
    return null;
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return {
    reference: order.externalRef,
    customerName: order.customerName,
    address: order.address || order.qbAddress,
    invoiceDate: order.invoiceDate,
    status: order.status,
    completedAt: order.completedAt,
    total: order.totalAmount,
    tax: order.taxAmount,
    paid: order.amountPaid,
    paymentStatus: order.paymentStatus,
    items: order.lines.map((line) => ({
      id: line.id,
      name: line.product.name,
      qty: line.orderedQty,
      amount: roundMoney(line.orderedQty * line.unitPrice, 2),
      delivered: line.deliveredQty,
      physical: line.physical,
    })),
    deliveries: order.deliveries.map((d) => ({
      number: d.number,
      mode: d.mode,
      status: d.status,
      priorStatus: d.priorStatus,
      delayReason: d.delayReason ? DELAY_REASONS[d.delayReason] ?? null : null,
      deliverBy: d.deliverBy,
      windowStart: d.windowStart,
      windowEnd: d.windowEnd,
      dispatchedAt: d.dispatchedAt,
      completedAt: d.completedAt,
      units: d.lines.reduce((sum, line) => sum + line.qty, 0),
      lines: d.lines.map((line) => ({ orderLineId: line.orderLineId, qty: line.qty })),
      photos: d.proofs.filter((proof) => proof.public).map((proof) => proof.id),
    })),
    events: order.events
      .filter((event) => event.public)
      .map((event) => ({ kind: event.kind, message: event.message, createdAt: event.createdAt })),
    company: { name: settings?.companyName ?? "Chaleur", phone: settings?.companyPhone ?? null, logoUrl: settings?.logoUrl ?? null },
  };
}

export async function proofForActor(proofId: string) {
  return prisma.orderProof.findUnique({ where: { id: proofId } });
}

export async function publicProof(token: string, proofId: string) {
  return prisma.orderProof.findFirst({
    where: {
      id: proofId,
      public: true,
      order: { trackingToken: token, OR: [{ trackingExpiresAt: null }, { trackingExpiresAt: { gt: new Date() } }] },
    },
  });
}
