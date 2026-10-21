import {
  ExitStatus,
  ImportKind,
  ImportStatus,
  Prisma,
  TransactionType,
  type Product,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUserId, DEMO_USER } from "@/lib/user";
import { deleteProductFiles, syncPhotos } from "@/lib/photos/service";
import { mediaForProduct } from "@/lib/media/library";
import { roundMeasure } from "@/lib/measure";
import {
  additionalImportCosts,
  allocateAdditionalCosts,
  calcWeightedAverageCost,
  importCoefficient,
  packageCbmM3,
  recomputeAvailable,
  roundMoney,
} from "@/lib/inventory/math";

type Tx = Prisma.TransactionClient;

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shouldAutoDelay(
  expectedDate: Date | null | undefined,
  status: ImportStatus,
  overridden: boolean,
) {
  if (overridden || !expectedDate) return false;
  if (
    status === ImportStatus.COMPLETED ||
    status === ImportStatus.DELAYED
  ) {
    return false;
  }
  return ymd(expectedDate) < ymd(new Date());
}

function rethrowImportError(e: unknown): never {
  const code =
    typeof e === "object" && e && "code" in e
      ? String((e as { code: unknown }).code)
      : "";
  const msg = e instanceof Error ? e.message : "";
  if (code === "P2002" || /unique constraint/i.test(msg)) {
    throw new Error("This code has already been used.");
  }
  throw e;
}

async function applyOverdueDelays() {
  const startToday = new Date(`${ymd(new Date())}T00:00:00.000Z`);
  await prisma.importation.updateMany({
    where: {
      delayOverridden: false,
      expectedDate: { lt: startToday },
      status: { in: [ImportStatus.PENDING, ImportStatus.IN_TRANSIT] },
    },
    data: { status: ImportStatus.DELAYED },
  });
}

export async function appendTransaction(
  tx: Tx,
  input: {
    productId: string;
    type: TransactionType;
    quantity: number;
    unitCost?: number;
    reference?: string | null;
    notes?: string | null;
    clientName?: string | null;
    occurredAt?: Date;
    metadata?: Record<string, unknown> | null;
    userId?: string;
    affectsPhysical?: boolean;
    affectsCost?: boolean;
    reason?: string | null;
    /** A removal may not dip into units reserved for invoices or set aside as unavailable. */
    keepReserved?: boolean;
    /** Units that come in (or leave) as unavailable: damaged or awaiting evaluation. */
    unavailableDelta?: number;
    /**
     * Moves units only (corrections, returns, write-offs): no price is recorded on the movement.
     * The stock's value still follows at the average cost, which doesn't change.
     */
    quantityOnly?: boolean;
  },
) {
  await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${input.productId} FOR UPDATE`;
  const product = await tx.product.findUniqueOrThrow({
    where: { id: input.productId },
  });

  const quantity = input.quantity;
  const unitCost = roundMoney(input.unitCost ?? product.avgCost);
  if (!Number.isFinite(quantity)) throw new Error("The quantity isn't a number");
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("The cost must be 0 or more");
  const affectsPhysical = input.affectsPhysical ?? true;
  const affectsCost = input.affectsCost ?? false;

  let nextPhysical = product.physicalQty;
  let nextValue = product.inventoryValue;
  let nextAvg = product.avgCost;

  if (affectsPhysical) {
    nextPhysical = roundMoney(product.physicalQty + quantity);
    if (nextPhysical < 0) {
      throw new Error(`Insufficient quantity for ${product.sku}`);
    }
    const held = product.reservedQty + product.unavailableQty + Math.min(0, input.unavailableDelta ?? 0);
    if (input.keepReserved && quantity < 0 && nextPhysical < held) {
      throw new Error(
        `${product.name}: ${held} of its ${product.physicalQty} units are reserved for invoices or set aside, so only ${Math.max(0, roundMoney(product.physicalQty - held))} can be removed.`,
      );
    }
  }

  if (affectsCost && quantity > 0) {
    const calc = calcWeightedAverageCost({
      existingQty: product.physicalQty,
      existingValue: product.inventoryValue,
      incomingQty: quantity,
      incomingUnitCost: unitCost,
    });
    nextPhysical = calc.newQty;
    nextValue = calc.newValue;
    nextAvg = calc.newAvgCost;
  } else if (affectsPhysical && quantity < 0) {
    nextValue = roundMoney(nextPhysical * product.avgCost);
    nextAvg = product.avgCost;
  } else if (affectsPhysical && quantity > 0 && !affectsCost) {
    nextValue = roundMoney(product.inventoryValue + quantity * product.avgCost);
  }

  const unavailableQty = roundMoney(product.unavailableQty + (input.unavailableDelta ?? 0));
  if (unavailableQty < 0 || unavailableQty > nextPhysical) throw new Error(`${product.name}: that's more than the units set aside`);
  const availableQty = recomputeAvailable({
    physicalQty: nextPhysical,
    reservedQty: product.reservedQty,
    unavailableQty,
  });

  const txn = await tx.inventoryTransaction.create({
    data: {
      productId: product.id,
      type: input.type,
      quantity,
      unitCost: input.quantityOnly ? 0 : unitCost,
      totalValue: input.quantityOnly ? 0 : roundMoney(Math.abs(quantity) * unitCost),
      reference: input.reference ?? null,
      notes: input.notes ?? input.reason ?? null,
      clientName: input.clientName ?? null,
      userId: input.userId ?? currentUserId(),
      occurredAt: input.occurredAt ?? new Date(),
      metadata: JSON.stringify({
        ...input.metadata,
        ...(input.quantityOnly ? { quantityOnly: true } : {}),
        before: snapshot(product),
        after: { physicalQty: nextPhysical, avgCost: nextAvg, inventoryValue: nextValue, unavailableQty },
      }),
    },
  });

  await tx.product.update({
    where: { id: product.id },
    data: {
      physicalQty: nextPhysical,
      inventoryValue: nextValue,
      avgCost: nextAvg,
      availableQty,
      unavailableQty,
      cifCost: affectsCost && quantity > 0 ? unitCost : product.cifCost,
    },
  });

  if (affectsCost && quantity > 0) {
    await tx.costHistory.create({
      data: {
        productId: product.id,
        transactionId: txn.id,
        eventType: input.type,
        quantityDelta: quantity,
        unitCost,
        resultingAvgCost: nextAvg,
        resultingQty: nextPhysical,
        resultingValue: nextValue,
        occurredAt: txn.occurredAt,
      },
    });
  }

  return txn;
}

type Snapshot = { physicalQty: number; avgCost: number; inventoryValue: number; unavailableQty?: number; fobCost?: number; cifCost?: number };

/** What a movement found, so its log shows before and after and a reversal can put it back. */
function snapshot(p: Snapshot): Snapshot {
  return { physicalQty: p.physicalQty, avgCost: p.avgCost, inventoryValue: p.inventoryValue, unavailableQty: p.unavailableQty, fobCost: p.fobCost, cifCost: p.cifCost };
}

function readMeta(raw: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Sets a product's average cost without touching its quantity: the value becomes units × cost.
 * Logged as COST_ADJUSTMENT with the values before and after.
 */
async function setAverageCost(
  tx: Tx,
  input: { productId: string; avgCost: number; userId: string; notes: string; occurredAt?: Date; metadata?: Record<string, unknown> },
) {
  if (!Number.isFinite(input.avgCost) || input.avgCost < 0) throw new Error("The cost must be 0 or more");
  await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${input.productId} FOR UPDATE`;
  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
  const avgCost = roundMoney(input.avgCost);
  const inventoryValue = roundMoney(product.physicalQty * avgCost);
  const txn = await tx.inventoryTransaction.create({
    data: {
      productId: product.id,
      type: TransactionType.COST_ADJUSTMENT,
      quantity: 0,
      unitCost: avgCost,
      totalValue: roundMoney(inventoryValue - product.inventoryValue),
      notes: input.notes,
      userId: input.userId,
      occurredAt: input.occurredAt ?? new Date(),
      metadata: JSON.stringify({
        ...input.metadata,
        before: snapshot(product),
        after: { physicalQty: product.physicalQty, avgCost, inventoryValue },
      }),
    },
  });
  await tx.product.update({ where: { id: product.id }, data: { avgCost, inventoryValue } });
  await tx.costHistory.create({
    data: {
      productId: product.id,
      transactionId: txn.id,
      eventType: TransactionType.COST_ADJUSTMENT,
      quantityDelta: 0,
      unitCost: avgCost,
      resultingAvgCost: avgCost,
      resultingQty: product.physicalQty,
      resultingValue: inventoryValue,
      occurredAt: txn.occurredAt,
    },
  });
  return txn;
}

/** A manual cost correction: the quantity stays, the average cost and value change. */
export async function adjustCost(input: { productId: string; avgCost: number; reason: string; userId: string }) {
  if (!input.reason?.trim()) throw new Error("Reason is required");
  return prisma.$transaction((tx) =>
    setAverageCost(tx, {
      productId: input.productId,
      avgCost: input.avgCost,
      userId: input.userId,
      notes: input.reason.trim(),
      metadata: { reason: input.reason.trim(), mode: "cost" },
    }),
  );
}

/**
 * The cost basis from importations: every completed importation line of the product (historical
 * or not), weighted by quantity, applied to the units on hand. Products without any keep their cost,
 * unless `fallback` gives the one to go back to.
 */
async function applyCostBasis(
  tx: Tx,
  productId: string,
  opts: { userId: string; notes: string; importationId: string; fallback?: number },
) {
  const lines = await tx.importationLine.findMany({
    where: { productId, importation: { status: ImportStatus.COMPLETED } },
    select: { quantity: true, landedUnitCost: true },
  });
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const avgCost =
    units > 0 ? roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.landedUnitCost, 0) / units) : opts.fallback;
  if (avgCost === undefined) return;
  await setAverageCost(tx, {
    productId,
    avgCost,
    userId: opts.userId,
    notes: opts.notes,
    metadata: { importationId: opts.importationId, action: "cost-basis", importedUnits: units },
  });
}

/**
 * Log entries a person can change: manual quantity corrections (added from the product, not
 * from an invoice or importation) that weren't removed. Others change through where they came from.
 */
function manualEntry(txn: { type: TransactionType; metadata: string | null }) {
  const meta = readMeta(txn.metadata);
  return (
    (txn.type === TransactionType.ADJUSTMENT || txn.type === TransactionType.RETURNED || txn.type === TransactionType.CORRECTION) &&
    !meta.orderId &&
    !meta.importationId &&
    !meta.setAside &&
    !meta.removed &&
    !meta.editOf &&
    !meta.reversalOf
  );
}

type LogActor = { id: string; name: string; main: boolean };

/**
 * Edits a log entry. The note is plain text and changes in place (anyone who can correct stock).
 * The date and quantity of a manual correction change only by the main user: the date in place,
 * the quantity through a new linked entry for the difference, so the balance and history stay
 * exact. Every change keeps who, when, before, after and why on the entry.
 */
export async function editLogEntry(
  input: { id: string; notes?: string; occurredAt?: Date; quantity?: number; reason: string },
  actor: LogActor,
) {
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Write why it changes.");
  return prisma.$transaction(async (tx) => {
    const found = await tx.inventoryTransaction.findUnique({ where: { id: input.id }, select: { productId: true } });
    if (!found) throw new Error("That entry no longer exists.");
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${found.productId} FOR UPDATE`;
    const txn = await tx.inventoryTransaction.findUniqueOrThrow({ where: { id: input.id } });
    const meta = readMeta(txn.metadata);
    const changes: Array<{ field: string; before: unknown; after: unknown }> = [];

    const notes = input.notes?.trim();
    if (notes !== undefined && notes !== (txn.notes ?? "")) changes.push({ field: "notes", before: txn.notes, after: notes || null });

    const touchesStock = input.occurredAt !== undefined || input.quantity !== undefined;
    if (touchesStock) {
      if (!actor.main) throw new Error("Only the main user can change the date or quantity of an entry.");
      if (!manualEntry(txn)) throw new Error("This entry comes from an invoice, importation or cost change. Correct it there.");
    }
    if (input.occurredAt !== undefined) {
      if (Number.isNaN(input.occurredAt.getTime()) || input.occurredAt.getTime() > Date.now() + 86400e3) throw new Error("Pick a valid date, not in the future");
      if (input.occurredAt.getTime() !== txn.occurredAt.getTime()) changes.push({ field: "occurredAt", before: txn.occurredAt, after: input.occurredAt });
    }
    // The entry's quantity now: itself plus the edits already made to it.
    const edits = await tx.inventoryTransaction.findMany({ where: { productId: txn.productId, metadata: { contains: `"editOf":"${txn.id}"` } } });
    const current = roundMoney(txn.quantity + edits.reduce((sum, e) => sum + e.quantity, 0));
    if (input.quantity !== undefined) {
      if (!Number.isFinite(input.quantity) || input.quantity === 0) throw new Error("The quantity can't be 0. Remove the entry instead.");
      if (Math.sign(input.quantity) !== Math.sign(txn.quantity)) throw new Error("Keep the direction (in or out). Add a new entry for the other way.");
      const delta = roundMoney(input.quantity - current);
      if (delta) {
        changes.push({ field: "quantity", before: current, after: input.quantity });
        await appendTransaction(tx, {
          productId: txn.productId,
          type: txn.type,
          quantity: delta,
          affectsPhysical: true,
          affectsCost: false,
          keepReserved: true,
          quantityOnly: true,
          occurredAt: input.occurredAt ?? txn.occurredAt,
          userId: actor.id,
          notes: `Edit of the ${txn.occurredAt.toISOString().slice(0, 10)} entry · ${reason}`,
          metadata: { editOf: txn.id, reason },
        });
      }
    }
    if (!changes.length) return txn;
    const history = Array.isArray(meta.edits) ? meta.edits : [];
    return tx.inventoryTransaction.update({
      where: { id: txn.id },
      data: {
        notes: notes !== undefined ? notes || null : undefined,
        occurredAt: changes.some((c) => c.field === "occurredAt") ? input.occurredAt : undefined,
        metadata: JSON.stringify({ ...meta, edits: [...history, { at: new Date(), by: actor.name || actor.id, reason, changes }] }),
      },
    });
  });
}

/**
 * Removes a manual correction from the balance (main user only). Nothing is deleted: a linked
 * entry takes back its units (with its edits), and the entry is marked removed, with who, when and why.
 */
export async function removeLogEntry(input: { id: string; reason: string }, actor: LogActor) {
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Write why it's removed.");
  if (!actor.main) throw new Error("Only the main user can remove an entry.");
  return prisma.$transaction(async (tx) => {
    const found = await tx.inventoryTransaction.findUnique({ where: { id: input.id }, select: { productId: true } });
    if (!found) throw new Error("That entry no longer exists.");
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${found.productId} FOR UPDATE`;
    const txn = await tx.inventoryTransaction.findUniqueOrThrow({ where: { id: input.id } });
    const meta = readMeta(txn.metadata);
    if (meta.removed) return txn;
    if (!manualEntry(txn)) throw new Error("This entry comes from an invoice, importation or cost change. Correct it there.");
    const edits = await tx.inventoryTransaction.findMany({ where: { productId: txn.productId, metadata: { contains: `"editOf":"${txn.id}"` } } });
    const units = roundMoney(txn.quantity + edits.reduce((sum, e) => sum + e.quantity, 0));
    if (units) {
      await appendTransaction(tx, {
        productId: txn.productId,
        type: txn.type,
        quantity: -units,
        affectsPhysical: true,
        affectsCost: false,
        keepReserved: true,
        quantityOnly: true,
        userId: actor.id,
        notes: `Removed the ${txn.occurredAt.toISOString().slice(0, 10)} entry · ${reason}`,
        metadata: { reversalOf: txn.id, reason },
      });
    }
    return tx.inventoryTransaction.update({
      where: { id: txn.id },
      data: { metadata: JSON.stringify({ ...meta, removed: { at: new Date(), by: actor.name || actor.id, reason } }) },
    });
  });
}

/**
 * Units set aside (returned damaged or to evaluate) leave that state: released back to available
 * stock after evaluation, or written off (they leave stock at the current average cost).
 */
export async function resolveSetAside(input: {
  productId: string;
  mode: "release" | "write-off";
  quantity: number;
  reason: string;
  userId: string;
}) {
  if (!input.reason?.trim()) throw new Error("Reason is required");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be greater than 0");
  const release = input.mode === "release";
  if (!release && input.mode !== "write-off") throw new Error("Choose Release or Write off");
  return prisma.$transaction((tx) =>
    appendTransaction(tx, {
      productId: input.productId,
      type: TransactionType.ADJUSTMENT,
      quantity: release ? 0 : -input.quantity,
      affectsPhysical: !release,
      affectsCost: false,
      quantityOnly: true,
      unavailableDelta: -input.quantity,
      notes: input.reason.trim(),
      userId: input.userId,
      metadata: { reason: input.reason.trim(), mode: input.mode, setAside: input.quantity },
    }),
  );
}

/** IDs the app picks itself belong to the secondary line: three base-36 characters with at
 *  least one letter (23A, 24C…). Plain numbers are the main line, numbered in QuickBooks. */
async function nextCode(tx: Tx) {
  const used = new Set((await tx.product.findMany({ select: { code: true } })).map((row) => row.code));
  const lettered = (code: string) => /^[0-9A-Z]{3}$/.test(code) && /[A-Z]/.test(code);
  let n = Math.max(0, ...[...used].filter(lettered).map((code) => Number.parseInt(code, 36)));
  let code: string;
  do code = (++n).toString(36).toUpperCase().padStart(3, "0");
  while (!lettered(code) || used.has(code));
  return code;
}

/** The next main-line number, for a QuickBooks item whose own number another product has. */
export async function nextNumber() {
  const rows = await prisma.product.findMany({ select: { code: true } });
  // ponytail: IDs are 3 characters, so this stops at 999.
  return String(Math.max(0, ...rows.flatMap(({ code }) => (/^\d+$/.test(code) ? [Number(code)] : []))) + 1);
}

/** "ID 13 is already used by Grill Concept 3 (NG)" instead of a database error. */
async function assertCodeFree(code: string | undefined, selfId?: string) {
  if (!code) return;
  const holder = await prisma.product.findUnique({ where: { code }, select: { id: true, name: true } });
  if (holder && holder.id !== selfId) throw new Error(`ID ${code} is already used by ${holder.name}. Change that product's ID first.`);
}

export async function createProduct(input: {
  name: string;
  sku: string;
  type?: string | null;
  category?: string | null;
  model?: string | null;
  hsCode?: string | null;
  code?: string;
  secondarySku?: string | null;
  ean?: string | null;
  amazonUrl?: string | null;
  imageUrl?: string | null;
  b2bPrice?: number;
  b2cPrice?: number;
  fobCost?: number;
  suppliers?: string | null;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  packageLength?: number | null;
  packageWidth?: number | null;
  packageHeight?: number | null;
  packageWeight?: number | null;
  cutoutLength?: number | null;
  cutoutWidth?: number | null;
  cutoutHeight?: number | null;
  notes?: string | null;
  tagId?: string | null;
  initialQty?: number;
  initialUnitCost?: number;
  userId?: string;
}) {
  await assertCodeFree(input.code?.trim().toUpperCase().slice(0, 3));
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: input.name,
        sku: input.sku,
        type: input.type?.trim() || null,
        category: input.category?.trim() || null,
        model: input.model?.trim() || null,
        hsCode: input.hsCode?.trim() || null,
        code:
          input.code?.trim().toUpperCase().slice(0, 3) || (await nextCode(tx)),
        secondarySku: input.secondarySku || null,
        ean: input.ean || null,
        amazonUrl: input.amazonUrl || null,
        imageUrl: input.imageUrl || null,
        b2bPrice: input.b2bPrice ?? 0,
        b2cPrice: input.b2cPrice ?? 0,
        fobCost: input.fobCost ?? input.initialUnitCost ?? 0,
        suppliers: input.suppliers || null,
        weight: roundMeasure(input.weight),
        length: roundMeasure(input.length),
        width: roundMeasure(input.width),
        height: roundMeasure(input.height),
        packageLength: roundMeasure(input.packageLength),
        packageWidth: roundMeasure(input.packageWidth),
        packageHeight: roundMeasure(input.packageHeight),
        packageWeight: input.packageWeight ?? null,
        cutoutLength: roundMeasure(input.cutoutLength),
        cutoutWidth: roundMeasure(input.cutoutWidth),
        cutoutHeight: roundMeasure(input.cutoutHeight),
        notes: input.notes || null,
        tagId: input.tagId || null,
      },
    });

    const qty = input.initialQty ?? 0;
    if (qty > 0) {
      // Without a cost (QuickBooks items) the units come in at no cost instead of a $0 cost
      // that would drag every later average down; importations set the cost basis.
      const costed = input.initialUnitCost !== undefined;
      await appendTransaction(tx, {
        productId: product.id,
        type: TransactionType.RECEIVED,
        quantity: qty,
        unitCost: input.initialUnitCost ?? 0,
        reference: "INITIAL",
        notes: costed ? "Initial stock" : "Initial stock (cost unknown)",
        affectsPhysical: true,
        affectsCost: costed,
        userId: input.userId,
      });
    }

    return tx.product.findUniqueOrThrow({ where: { id: product.id } });
  });
}

/** `fromQuickBooks`: the change came from QuickBooks, so it is not pushed back. */
export async function updateProduct(
  id: string,
  input: Prisma.ProductUpdateInput,
  opts: { fromQuickBooks?: boolean } = {},
) {
  const data = { ...input };
  for (const key of [
    "physicalQty",
    "availableQty",
    "reservedQty",
    "waitingPickupQty",
    "waitingDeliveryQty",
    "unavailableQty",
    "avgCost",
    "inventoryValue",
    "cifCost",
    "fobCost",
    "lastSoldPrice",
    "qbUpdatedAt",
    "qbSeen",
  ] as const) {
    delete data[key];
  }
  const code =
    typeof data.code === "string"
      ? data.code.trim().toUpperCase().slice(0, 3)
      : data.code;
  if (typeof code === "string") await assertCodeFree(code, id);
  for (const key of [
    "weight",
    "length",
    "width",
    "height",
    "packageLength",
    "packageWidth",
    "packageHeight",
    "packageWeight",
    "cutoutLength",
    "cutoutWidth",
    "cutoutHeight",
  ] as const) {
    if (key in data && typeof data[key] === "number") data[key] = roundMeasure(data[key]);
  }
  const before = await prisma.product.findUnique({
    where: { id },
    select: { name: true, code: true, sku: true, b2bPrice: true },
  });
  const product = await prisma.product.update({ where: { id }, data: { ...data, code } });
  if ("name" in data || "type" in data || "category" in data || "model" in data) await syncPhotos(id);
  const pushed = ["name", "code", "sku", "b2bPrice"] as const;
  if (!opts.fromQuickBooks && before && pushed.some((key) => before[key] !== product[key])) {
    try {
      const { pushQuickBooksItem } = await import("@/lib/quickbooks/qbo");
      await pushQuickBooksItem(product);
    } catch (error) {
      const message = error instanceof Error ? error.message : "name update failed";
      throw new Error(`Saved here. QuickBooks was not updated: ${message}`);
    }
  }
  return product;
}

export async function deleteProduct(id: string) {
  const onOrder = await prisma.orderLine.count({ where: { productId: id } });
  if (onOrder) {
    throw new Error("This product is on an exit invoice and can't be deleted");
  }
  const dropFiles = await deleteProductFiles(id);
  await prisma.$transaction(async (tx) => {
    const lines = await tx.importationLine.findMany({
      where: { productId: id },
      include: { product: true },
    });
    for (const line of lines) {
      await tx.importationLine.update({
        where: { id: line.id },
        data: {
          productId: null,
          draftName: line.draftName || line.product?.name || null,
          draftSku: line.draftSku || line.product?.sku || null,
        },
      });
    }
    await tx.costHistory.deleteMany({ where: { productId: id } });
    await tx.inventoryTransaction.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });
  await dropFiles();
}

const productListInclude = { tag: { select: { id: true, name: true, color: true, catalogFields: true } } } as const;

export async function listProducts(search?: string) {
  const q = search?.trim();
  if (!q) return prisma.product.findMany({ include: productListInclude, orderBy: { name: "asc" } });
  return prisma.product.findMany({
    include: productListInclude,
    where: {
      OR: [
        { name: { contains: q } },
        { sku: { contains: q } },
        { type: { contains: q } },
        { code: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
  });
}

export async function getProductCard(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { tag: { select: { id: true, name: true, color: true } } },
  });
  if (!product) return null;
  const shown = await mediaForProduct(product);
  const cover =
    product.imageUrl && product.imageUrl !== "/file.svg"
      ? [
          {
            id: "cover",
            url: product.imageUrl,
            thumbUrl: product.imageUrl,
            tag: "",
            fileName: "",
            contentType: "image/jpeg",
            kind: "photo" as const,
          },
        ]
      : [];
  return {
    ...product,
    transactions: [],
    orderLines: [],
    photos: cover,
    shown,
  };
}

export async function getProductDetail(id: string) {
  const [product, users] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        transactions: { orderBy: { occurredAt: "desc" } },
        costHistory: { orderBy: { occurredAt: "desc" } },
        orderLines: {
          where: {
            reservedQty: { gt: 0 },
            order: { status: { not: ExitStatus.COMPLETED } },
          },
          include: { order: true },
        },
        photos: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        tag: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.user.findMany({ select: { id: true, username: true, name: true } }),
  ]);
  if (!product) return null;
  const names = new Map<string, string>([
    ["admin", DEMO_USER.name],
    ["demo", DEMO_USER.name],
  ]);
  for (const u of users) {
    names.set(u.id, u.name);
    names.set(u.username, u.name);
  }
  const shown = await mediaForProduct(product);
  return {
    ...product,
    shown,
    transactions: product.transactions.map((t) => ({
      ...t,
      userName: names.get(t.userId) ?? t.userId,
    })),
  };
}

/**
 * A quantity correction: units in or out at the current average cost, which stays as it is.
 * Costs change through importations or `adjustCost`. A repeated `requestId` (a retry) counts once.
 */
export async function changeQuantity(input: {
  productId: string;
  mode: "add" | "remove";
  quantity: number;
  reason: string;
  userId: string;
  requestId?: string;
  /** When it happened, for entries added to the log after the fact. Defaults to now. */
  occurredAt?: Date;
}) {
  if (!input.reason?.trim()) throw new Error("Reason is required");
  if (input.occurredAt && (Number.isNaN(input.occurredAt.getTime()) || input.occurredAt.getTime() > Date.now() + 86400e3)) {
    throw new Error("Pick a valid date, not in the future");
  }
  if (input.mode !== "add" && input.mode !== "remove") throw new Error("Choose Add or Remove");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be greater than 0");
  const delta = input.mode === "add" ? input.quantity : -input.quantity;
  return prisma.$transaction(async (tx) => {
    if (input.requestId) {
      await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${input.productId} FOR UPDATE`;
      const done = await tx.inventoryTransaction.findFirst({
        where: { productId: input.productId, metadata: { contains: `"requestId":${JSON.stringify(input.requestId)}` } },
      });
      if (done) return done;
    }
    const type = input.reason.toLowerCase() === "return" ? TransactionType.RETURNED : TransactionType.ADJUSTMENT;
    return appendTransaction(tx, {
      productId: input.productId,
      type,
      quantity: delta,
      reason: input.reason,
      notes: input.reason,
      affectsPhysical: true,
      affectsCost: false,
      keepReserved: true,
      quantityOnly: true,
      occurredAt: input.occurredAt,
      userId: input.userId,
      metadata: { reason: input.reason, mode: input.mode, requestId: input.requestId },
    });
  });
}

type ImportLineInput = {
  productId?: string | null;
  draftName?: string | null;
  draftSku?: string | null;
  quantity: number;
  purchaseUnitCost: number;
  taxRate?: number;
  notes?: string | null;
};

function checkImportLines(lines: ImportLineInput[], historical: boolean) {
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("Each line needs a quantity above 0");
    if (!Number.isFinite(line.purchaseUnitCost) || line.purchaseUnitCost < 0) throw new Error("Costs must be 0 or more");
    const tax = line.taxRate ?? 0;
    if (!Number.isFinite(tax) || tax < 0 || tax > 1000) throw new Error("Tax is a percent between 0 and 1000");
    if (historical && !line.productId) throw new Error("A historical importation only has products already in stock");
  }
}

/** Locks the importation row, so completing, reopening and saving it happen one at a time. */
async function lockImportation(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "Importation" WHERE id = ${id} FOR UPDATE`;
  return tx.importation.findUniqueOrThrow({ where: { id }, include: { lines: true } });
}

const importInclude = {
  lines: { include: { product: true } },
  events: { orderBy: { createdAt: "desc" as const } },
  proofs: { select: { id: true, actor: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
} as const;

export async function upsertImportation(input: {
  id?: string;
  reference?: string;
  kind?: ImportKind;
  status?: ImportStatus;
  supplierName?: string | null;
  expectedDate?: Date | null;
  historical?: boolean;
  notes?: string | null;
  transferFee?: number;
  freight?: number;
  delivery?: number;
  duties?: number;
  customs?: number;
  otherCosts?: number;
  lines: ImportLineInput[];
  userId: string;
}) {
  const costs = {
    transferFee: input.transferFee ?? 0,
    freight: input.freight ?? 0,
    delivery: input.delivery ?? 0,
    duties: input.duties ?? 0,
    customs: input.customs ?? 0,
    otherCosts: input.otherCosts ?? 0,
  };
  if (Object.values(costs).some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Costs must be 0 or more");
  const totalAdditional = additionalImportCosts(costs);
  const productSubtotal = roundMoney(
    input.lines.reduce((s, l) => s + l.quantity * l.purchaseUnitCost, 0),
  );
  const allocated = allocateAdditionalCosts(
    input.lines.map((l, i) => ({
      id: String(i),
      quantity: l.quantity,
      purchaseUnitCost: l.purchaseUnitCost,
      taxRate: l.taxRate ?? 0,
    })),
    totalAdditional,
  );
  const coefficient = importCoefficient(allocated);

  try {
    return await prisma.$transaction(async (tx) => {
    let importationId = input.id;
    const existing = importationId ? await lockImportation(tx, importationId) : null;
    if (existing?.status === ImportStatus.COMPLETED) {
      throw new Error("Completed importations cannot be edited");
    }
    const historical = input.historical ?? existing?.historical ?? false;
    checkImportLines(input.lines, historical);
    const dateChanged =
      (existing?.expectedDate?.getTime() ?? null) !==
      (input.expectedDate?.getTime() ?? null);
    const delayOverridden = dateChanged
      ? false
      : (existing?.delayOverridden ?? false);
    // Completing goes through setImportStatus, which adds the units; a save never does.
    const asked = input.status === ImportStatus.COMPLETED ? undefined : input.status;
    const nextStatus = asked ?? existing?.status ?? ImportStatus.PENDING;
    const status = shouldAutoDelay(
      input.expectedDate,
      nextStatus,
      delayOverridden,
    )
      ? ImportStatus.DELAYED
      : nextStatus;
    const reference =
      input.reference?.trim() || `IMP-${Date.now().toString(36).toUpperCase()}`;
    const taken = await tx.importation.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (taken && taken.id !== importationId) {
      throw new Error("This code has already been used.");
    }
    const data = {
      reference,
      kind: input.kind ?? existing?.kind ?? ImportKind.INTERNATIONAL,
      status,
      delayOverridden,
      historical,
      supplierName: input.supplierName ?? null,
      expectedDate: input.expectedDate ?? null,
      notes: input.notes ?? null,
      ...costs,
      productSubtotal,
      totalAdditionalCosts: totalAdditional,
      coefficient,
    };

    if (existing) {
      await tx.importationLine.deleteMany({ where: { importationId } });
      await tx.importation.update({ where: { id: importationId }, data });
    } else {
      const created = await tx.importation.create({
        data: { ...data, createdBy: input.userId },
      });
      importationId = created.id;
    }

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const alloc = allocated[i];
      await tx.importationLine.create({
        data: {
          importationId: importationId!,
          productId: line.productId || null,
          draftName: line.draftName || null,
          draftSku: line.draftSku || null,
          quantity: line.quantity,
          purchaseUnitCost: line.purchaseUnitCost,
          taxRate: line.taxRate ?? 0,
          allocatedAdditionalCost: alloc.allocatedAdditionalCost,
          landedUnitCost: alloc.landedUnitCost,
          notes: line.notes || null,
        },
      });
    }

    const supplier = input.supplierName?.trim();
    if (supplier) {
      await tx.supplier.upsert({
        where: { name: supplier },
        create: { name: supplier },
        update: {},
      });
    }

    return tx.importation.findUniqueOrThrow({
      where: { id: importationId! },
      include: importInclude,
    });
    });
  } catch (e) {
    rethrowImportError(e);
  }
}

/** Every status change, completing and reopening included, under the importation's lock. */
/** `canReopen`: only the main user may take a received importation back (it reverses its units). */
export async function setImportStatus(id: string, status: ImportStatus, userId: string, opts: { canReopen?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const current = await lockImportation(tx, id);
    if (current.status === ImportStatus.COMPLETED && status !== ImportStatus.COMPLETED && opts.canReopen === false) {
      throw new Error("Only the main user can reopen a received importation.");
    }
    if (status === ImportStatus.COMPLETED) {
      if (current.status !== ImportStatus.COMPLETED) {
        if (!current.historical) throw new Error(RECEIVE_WITH_PHOTO);
        await completeLocked(tx, current, userId, current.receivedAt ?? new Date());
      }
      return tx.importation.findUniqueOrThrow({ where: { id }, include: importInclude });
    }
    if (current.status === ImportStatus.COMPLETED) {
      await reopenLocked(tx, current, userId);
      // Not received any more. The expected date stays as it was; the receipt photos stay as history.
      return tx.importation.update({ where: { id }, data: { status, receivedAt: null }, include: importInclude });
    }
    const delayOverridden =
      current.status === ImportStatus.DELAYED && status !== ImportStatus.DELAYED;
    return tx.importation.update({
      where: { id },
      data: {
        status,
        ...(current.status === ImportStatus.DELAYED || status === ImportStatus.DELAYED
          ? { delayOverridden }
          : {}),
      },
      include: importInclude,
    });
  });
}

type LockedImportation = Awaited<ReturnType<typeof lockImportation>>;

/**
 * Takes back what completing added. A normal importation's units leave at the cost they came in
 * at, restoring the product exactly as it was; that's only possible while nothing else moved its
 * stock since. A historical one recomputes the cost basis without it. History stays: each
 * reversal is its own transaction.
 */
async function reopenLocked(tx: Tx, importation: LockedImportation, userId: string) {
  if (importation.historical) {
    const products = [...new Set(importation.lines.flatMap((line) => (line.productId ? [line.productId] : [])))];
    // Not completed any more, so the basis leaves it out.
    await tx.importation.update({ where: { id: importation.id }, data: { status: ImportStatus.PENDING } });
    for (const productId of products) {
      const set = await tx.inventoryTransaction.findFirst({
        where: { productId, type: TransactionType.COST_ADJUSTMENT, metadata: { contains: `"importationId":"${importation.id}"` } },
        orderBy: { createdAt: "asc" },
      });
      const before = readMeta(set?.metadata ?? null).before as Snapshot | undefined;
      await applyCostBasis(tx, productId, {
        userId,
        notes: `Reopened historical import ${importation.reference}`,
        importationId: importation.id,
        fallback: before?.avgCost,
      });
    }
    return;
  }

  const receipts = await tx.inventoryTransaction.findMany({
    where: {
      type: TransactionType.IMPORTATION,
      OR: [
        { metadata: { contains: `"importationId":"${importation.id}"` } },
        { reference: importation.reference },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { product: { select: { name: true } } },
  });
  const reversed = new Set(receipts.map((r) => readMeta(r.metadata).reversalOf).filter(Boolean));
  // Newest first, so each product steps back through its receipts in order.
  const open = receipts.filter((r) => r.quantity > 0 && !reversed.has(r.id)).reverse();
  const own = receipts.map((r) => r.id);

  for (const receipt of open) {
    const moved = await tx.inventoryTransaction.count({
      where: {
        productId: receipt.productId,
        createdAt: { gt: receipt.createdAt },
        id: { notIn: own },
        OR: [{ quantity: { not: 0 } }, { type: TransactionType.COST_ADJUSTMENT }],
      },
    });
    if (moved) {
      throw new Error(
        `${receipt.product.name} has moved since this import was received, so it can't be reopened. Correct the quantity or cost with an adjustment instead.`,
      );
    }
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${receipt.productId} FOR UPDATE`;
    const product = await tx.product.findUniqueOrThrow({ where: { id: receipt.productId } });
    const physicalQty = roundMoney(product.physicalQty - receipt.quantity);
    if (physicalQty < product.reservedQty) {
      throw new Error(`${product.name}: its units are reserved for invoices, so this import can't be reopened.`);
    }
    // Nothing moved since, so the product goes back to exactly what the receipt found.
    const before = readMeta(receipt.metadata).before as Snapshot | undefined;
    const inventoryValue = before ? before.inventoryValue : Math.max(0, roundMoney(product.inventoryValue - receipt.quantity * receipt.unitCost));
    const avgCost = before ? before.avgCost : physicalQty > 0 ? roundMoney(inventoryValue / physicalQty) : 0;
    const reversal = await tx.inventoryTransaction.create({
      data: {
        productId: product.id,
        type: TransactionType.IMPORTATION,
        quantity: -receipt.quantity,
        unitCost: receipt.unitCost,
        totalValue: roundMoney(receipt.quantity * receipt.unitCost),
        reference: importation.reference,
        notes: `Reopened import ${importation.reference}`,
        userId,
        metadata: JSON.stringify({
          importationId: importation.id,
          reversalOf: receipt.id,
          before: snapshot(product),
          after: { physicalQty, avgCost, inventoryValue },
        }),
      },
    });
    await tx.product.update({
      where: { id: product.id },
      data: {
        physicalQty,
        inventoryValue,
        avgCost,
        availableQty: recomputeAvailable({ ...product, physicalQty }),
        ...(before?.fobCost !== undefined ? { fobCost: before.fobCost } : {}),
        ...(before?.cifCost !== undefined ? { cifCost: before.cifCost } : {}),
      },
    });
    own.push(reversal.id);
  }
}

type CostFields = { transferFee: number; freight: number; delivery: number; duties: number; customs: number; otherCosts: number };
const COST_KEYS = ["transferFee", "freight", "delivery", "duties", "customs", "otherCosts"] as const;

/**
 * Corrects the costs of a received importation (main user only, checked by the route): its fees
 * and each line's cost and tax. Quantities and products can't change here, so no units move. The
 * lines get their new landed (CIF) cost, every product's average cost is recomputed from all its
 * received importations (the cost basis rule), and the change is logged with the values before
 * and after. Sending the same values again changes nothing.
 */
export async function reviseImportation(
  id: string,
  input: { costs?: Partial<CostFields>; lines?: Array<{ id: string; purchaseUnitCost?: number; taxRate?: number }>; reason: string },
  actor: { id: string; name: string },
) {
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Write why the costs change.");
  return prisma.$transaction(async (tx) => {
    const imp = await lockImportation(tx, id);
    if (imp.status !== ImportStatus.COMPLETED) throw new Error("It isn't received yet; edit it normally.");
    const costs = Object.fromEntries(COST_KEYS.map((key) => [key, input.costs?.[key] ?? imp[key]])) as CostFields;
    if (Object.values(costs).some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Costs must be 0 or more");
    for (const change of input.lines ?? []) {
      if (!imp.lines.some((line) => line.id === change.id)) throw new Error("That line isn't on this importation.");
    }
    const lines = imp.lines.map((line) => {
      const change = input.lines?.find((c) => c.id === line.id);
      return { ...line, purchaseUnitCost: change?.purchaseUnitCost ?? line.purchaseUnitCost, taxRate: change?.taxRate ?? line.taxRate };
    });
    checkImportLines(lines, imp.historical);

    const totalAdditional = additionalImportCosts(costs);
    const allocated = allocateAdditionalCosts(
      lines.map((l) => ({ id: l.id, quantity: l.quantity, purchaseUnitCost: l.purchaseUnitCost, taxRate: l.taxRate })),
      totalAdditional,
    );
    const changedCosts = COST_KEYS.filter((key) => costs[key] !== imp[key]);
    const changedLines = lines.filter((line, i) => {
      const was = imp.lines[i]!;
      return line.purchaseUnitCost !== was.purchaseUnitCost || line.taxRate !== was.taxRate || allocated[i]!.landedUnitCost !== was.landedUnitCost;
    });
    if (!changedCosts.length && !changedLines.length) return tx.importation.findUniqueOrThrow({ where: { id }, include: importInclude });

    for (let i = 0; i < lines.length; i++) {
      await tx.importationLine.update({
        where: { id: lines[i]!.id },
        data: {
          purchaseUnitCost: lines[i]!.purchaseUnitCost,
          taxRate: lines[i]!.taxRate,
          allocatedAdditionalCost: allocated[i]!.allocatedAdditionalCost,
          landedUnitCost: allocated[i]!.landedUnitCost,
        },
      });
    }
    await tx.importation.update({
      where: { id },
      data: {
        ...costs,
        totalAdditionalCosts: totalAdditional,
        productSubtotal: roundMoney(lines.reduce((sum, l) => sum + l.quantity * l.purchaseUnitCost, 0)),
        coefficient: importCoefficient(allocated),
      },
    });
    const pick = (row: { purchaseUnitCost: number; taxRate: number; landedUnitCost: number }) => ({
      cost: row.purchaseUnitCost,
      taxRate: row.taxRate,
      cif: row.landedUnitCost,
    });
    await tx.importationEvent.create({
      data: {
        importationId: id,
        actor: actor.name || actor.id,
        message: `Costs corrected: ${[...changedCosts, ...(changedLines.length ? [`${changedLines.length} line${changedLines.length === 1 ? "" : "s"}`] : [])].join(", ")} · ${reason}`,
        meta: JSON.stringify({
          reason,
          before: {
            costs: Object.fromEntries(changedCosts.map((key) => [key, imp[key]])),
            lines: Object.fromEntries(imp.lines.map((line) => [line.id, pick(line)])),
          },
          after: {
            costs: Object.fromEntries(changedCosts.map((key) => [key, costs[key]])),
            lines: Object.fromEntries(lines.map((line, i) => [line.id, pick({ ...line, landedUnitCost: allocated[i]!.landedUnitCost })])),
          },
        }),
      },
    });

    for (const productId of new Set(lines.flatMap((line) => (line.productId ? [line.productId] : [])))) {
      await applyCostBasis(tx, productId, {
        userId: actor.id,
        notes: `Costs of import ${imp.reference} corrected · ${reason}`,
        importationId: id,
      });
      // FOB and CIF are the latest received normal importation's; they follow when that's this one.
      const latest = await tx.importationLine.findFirst({
        where: { productId, importation: { status: ImportStatus.COMPLETED, historical: false } },
        orderBy: [{ importation: { receivedAt: "desc" } }, { importation: { createdAt: "desc" } }],
      });
      if (latest?.importationId === id) {
        await tx.product.update({ where: { id: productId }, data: { fobCost: roundMoney(latest.purchaseUnitCost), cifCost: latest.landedUnitCost } });
      }
    }
    return tx.importation.findUniqueOrThrow({ where: { id }, include: importInclude });
  });
}

/**
 * Corrects a product's FOB cost: what it costs to buy, used as the starting cost of new
 * importations. It doesn't feed the average cost or CIF, so neither changes, and no units move.
 * Logged as a cost correction with the value before and after; the same value again does nothing.
 */
export async function correctFob(input: { productId: string; fobCost: number; reason: string; userId: string }) {
  const reason = input.reason?.trim();
  if (!reason) throw new Error("Reason is required");
  if (!Number.isFinite(input.fobCost) || input.fobCost < 0) throw new Error("The cost must be 0 or more");
  const fobCost = roundMoney(input.fobCost, 2);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${input.productId} FOR UPDATE`;
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    if (product.fobCost === fobCost) return null;
    const txn = await tx.inventoryTransaction.create({
      data: {
        productId: product.id,
        type: TransactionType.COST_ADJUSTMENT,
        quantity: 0,
        unitCost: fobCost,
        totalValue: 0,
        notes: `FOB ${product.fobCost} → ${fobCost} · ${reason}`,
        userId: input.userId,
        metadata: JSON.stringify({ field: "fobCost", reason, mode: "fob", before: { fobCost: product.fobCost }, after: { fobCost } }),
      },
    });
    await tx.product.update({ where: { id: product.id }, data: { fobCost } });
    return txn;
  });
}

export async function deleteImportation(id: string) {
  await prisma.$transaction(async (tx) => {
    const current = await lockImportation(tx, id);
    if (current.status === ImportStatus.COMPLETED) {
      throw new Error("Completed importations cannot be deleted");
    }
    await tx.importation.delete({ where: { id } });
  });
}

export const RECEIVE_WITH_PHOTO = "Receive it with the arrival date and a photo of the products.";

/**
 * Receiving: the day it actually arrived (its expected date stays as it was) and at least one
 * photo of the products, saved with the units in one transaction, so either all of it happens or
 * none of it. Receiving again returns it as it is; nothing is added twice.
 */
export async function receiveImportation(
  importationId: string,
  input: { receivedAt: Date; photos: string[]; actor: { id: string; name: string } },
) {
  if (Number.isNaN(input.receivedAt.getTime())) throw new Error("Pick the day it arrived");
  if (input.receivedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new Error("The arrival date can't be in the future");
  return prisma.$transaction(async (tx) => {
    const importation = await lockImportation(tx, importationId);
    if (importation.status === ImportStatus.COMPLETED) {
      return tx.importation.findUniqueOrThrow({ where: { id: importationId }, include: importInclude });
    }
    if (!importation.historical && !input.photos.length) throw new Error("Add a photo of the products that arrived.");
    await completeLocked(tx, importation, input.actor.id, input.receivedAt);
    for (const url of input.photos) {
      await tx.importationProof.create({ data: { importationId, url, actor: input.actor.name || input.actor.id } });
    }
    return tx.importation.findUniqueOrThrow({ where: { id: importationId }, include: importInclude });
  });
}

/**
 * Receives a locked importation. A normal one adds its units at their landed (CIF) cost on the
 * received day. A historical one adds no units: it only feeds the cost basis of its products.
 */
async function completeLocked(tx: Tx, importation: LockedImportation, userId: string, receivedAt: Date) {
  if (importation.lines.length === 0) throw new Error("Importation has no products");
  checkImportLines(importation.lines, importation.historical);

  const totalAdditional = additionalImportCosts(importation);
  const productSubtotal = roundMoney(
    importation.lines.reduce((s, l) => s + l.quantity * l.purchaseUnitCost, 0),
  );
  const allocated = allocateAdditionalCosts(
    importation.lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      purchaseUnitCost: l.purchaseUnitCost,
      taxRate: l.taxRate,
    })),
    totalAdditional,
  );
  const coefficient = importCoefficient(allocated);

  for (let i = 0; i < importation.lines.length; i++) {
    const line = importation.lines[i];
    const alloc = allocated[i];
    const fobCost = roundMoney(line.purchaseUnitCost);
    const cifCost = alloc.landedUnitCost;
    let productId = line.productId;
    if (!productId) {
      const sku =
        line.draftSku?.trim() ||
        `SKU-${Date.now().toString(36).toUpperCase()}-${i}`;
      const created = await tx.product.create({
        data: {
          name: line.draftName?.trim() || sku,
          sku,
          code: await nextCode(tx),
        },
      });
      productId = created.id;
    }
    await tx.importationLine.update({
      where: { id: line.id },
      data: {
        productId,
        allocatedAdditionalCost: alloc.allocatedAdditionalCost,
        landedUnitCost: cifCost,
      },
    });
    if (importation.historical) continue;
    await appendTransaction(tx, {
      productId,
      type: TransactionType.IMPORTATION,
      quantity: line.quantity,
      unitCost: cifCost,
      reference: importation.reference,
      notes: `Import ${importation.reference}`,
      affectsPhysical: true,
      affectsCost: true,
      occurredAt: receivedAt,
      userId,
      metadata: {
        importationId: importation.id,
        purchaseUnitCost: line.purchaseUnitCost,
        coefficient,
        cifCost,
        fobCost,
      },
    });
    await tx.product.update({
      where: { id: productId },
      data: { cifCost, fobCost },
    });
  }

  await tx.importation.update({
    where: { id: importation.id },
    data: {
      status: ImportStatus.COMPLETED,
      receivedAt,
      totalAdditionalCosts: totalAdditional,
      productSubtotal,
      coefficient,
    },
  });

  if (importation.historical) {
    const products = [...new Set(importation.lines.map((line) => line.productId!))];
    for (const productId of products) {
      await applyCostBasis(tx, productId, {
        userId,
        notes: `Cost basis from historical import ${importation.reference}`,
        importationId: importation.id,
      });
    }
  }
}

export async function listImportations() {
  await applyOverdueDelays();
  return prisma.importation.findMany({
    orderBy: { createdAt: "desc" },
    include: importInclude,
  });
}

export async function getImportation(id: string) {
  return prisma.importation.findUnique({
    where: { id },
    include: importInclude,
  });
}

export async function importationProof(id: string) {
  return prisma.importationProof.findUnique({ where: { id } });
}

export function importationMetrics(imp: {
  lines: Array<{
    quantity: number;
    product?: {
      packageLength: number | null;
      packageWidth: number | null;
      packageHeight: number | null;
      packageWeight: number | null;
      weight: number | null;
    } | null;
  }>;
}) {
  let cbm = 0;
  let kg = 0;
  for (const line of imp.lines) {
    const p = line.product;
    cbm +=
      packageCbmM3(p?.packageLength, p?.packageWidth, p?.packageHeight) *
      line.quantity;
    kg += (p?.packageWeight ?? p?.weight ?? 0) * line.quantity;
  }
  return {
    cbm: roundMoney(cbm, 4),
    kg: roundMoney(kg, 2),
    lbs: roundMoney(kg * 2.20462, 2),
  };
}

export type ProductListItem = Product;
