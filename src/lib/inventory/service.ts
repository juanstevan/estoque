import {
  ExitStatus,
  ImportKind,
  ImportStatus,
  Prisma,
  TransactionType,
  type Product,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";
import {
  additionalImportCosts,
  allocateAdditionalCosts,
  calcWeightedAverageCost,
  packageCbmM3,
  recomputeAvailable,
  roundMoney,
} from "@/lib/inventory/math";

type Tx = Prisma.TransactionClient;

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
    affectsPhysical?: boolean;
    affectsCost?: boolean;
    reason?: string | null;
  },
) {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: input.productId },
  });

  const quantity = input.quantity;
  const unitCost = roundMoney(input.unitCost ?? product.avgCost);
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

  const availableQty = recomputeAvailable({
    physicalQty: nextPhysical,
    reservedQty: product.reservedQty,
  });

  const txn = await tx.inventoryTransaction.create({
    data: {
      productId: product.id,
      type: input.type,
      quantity,
      unitCost,
      totalValue: roundMoney(Math.abs(quantity) * unitCost),
      reference: input.reference ?? null,
      notes: input.notes ?? input.reason ?? null,
      clientName: input.clientName ?? null,
      userId: currentUserId(),
      occurredAt: input.occurredAt ?? new Date(),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  await tx.product.update({
    where: { id: product.id },
    data: {
      physicalQty: nextPhysical,
      inventoryValue: nextValue,
      avgCost: nextAvg,
      availableQty,
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

function nextCode() {
  return `CDO${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

export async function createProduct(input: {
  name: string;
  sku: string;
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
  initialQty?: number;
  initialUnitCost?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: input.name,
        sku: input.sku,
        code: input.code?.trim() || nextCode(),
        secondarySku: input.secondarySku || null,
        ean: input.ean || null,
        amazonUrl: input.amazonUrl || null,
        imageUrl: input.imageUrl || null,
        b2bPrice: input.b2bPrice ?? 0,
        b2cPrice: input.b2cPrice ?? 0,
        fobCost: input.fobCost ?? input.initialUnitCost ?? 0,
        suppliers: input.suppliers || null,
        weight: input.weight ?? null,
        length: input.length ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        packageLength: input.packageLength ?? null,
        packageWidth: input.packageWidth ?? null,
        packageHeight: input.packageHeight ?? null,
        packageWeight: input.packageWeight ?? null,
        cutoutLength: input.cutoutLength ?? null,
        cutoutWidth: input.cutoutWidth ?? null,
        cutoutHeight: input.cutoutHeight ?? null,
        notes: input.notes || null,
      },
    });

    const qty = input.initialQty ?? 0;
    if (qty > 0) {
      await appendTransaction(tx, {
        productId: product.id,
        type: TransactionType.RECEIVED,
        quantity: qty,
        unitCost: input.initialUnitCost ?? 0,
        reference: "INITIAL",
        notes: "Initial stock",
        affectsPhysical: true,
        affectsCost: true,
      });
    }

    return tx.product.findUniqueOrThrow({ where: { id: product.id } });
  });
}

export async function updateProduct(
  id: string,
  input: Prisma.ProductUpdateInput,
) {
  return prisma.product.update({ where: { id }, data: input });
}

export async function listProducts(search?: string) {
  const q = search?.trim();
  if (!q) return prisma.product.findMany({ orderBy: { name: "asc" } });
  return prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { sku: { contains: q } },
        { secondarySku: { contains: q } },
        { ean: { contains: q } },
        { code: { contains: q } },
        { id: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
  });
}

export async function getProductDetail(id: string) {
  return prisma.product.findUnique({
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
    },
  });
}

export async function changeQuantity(input: {
  productId: string;
  mode: "add" | "remove";
  quantity: number;
  price: number;
  reason: string;
}) {
  if (!input.reason?.trim()) throw new Error("Reason is required");
  if (input.quantity <= 0) throw new Error("Quantity must be greater than 0");
  const delta = input.mode === "add" ? input.quantity : -input.quantity;
  return prisma.$transaction(async (tx) => {
    const type =
      input.reason.toLowerCase() === "return"
        ? TransactionType.RETURNED
        : input.mode === "add"
          ? TransactionType.ADJUSTMENT
          : TransactionType.ADJUSTMENT;
    return appendTransaction(tx, {
      productId: input.productId,
      type,
      quantity: delta,
      unitCost: input.price,
      reason: input.reason,
      notes: input.reason,
      affectsPhysical: true,
      affectsCost: input.mode === "add",
      metadata: { reason: input.reason, mode: input.mode },
    });
  });
}

export async function adjustInventory(input: {
  productId: string;
  quantityDelta: number;
  reason: string;
  notes?: string | null;
  type?: "ADJUSTMENT" | "CORRECTION";
}) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: input.productId },
  });
  return changeQuantity({
    productId: input.productId,
    mode: input.quantityDelta >= 0 ? "add" : "remove",
    quantity: Math.abs(input.quantityDelta),
    price: product.avgCost,
    reason: input.reason || input.type || "Correction",
  });
}

export function previewQuantityChange(product: {
  physicalQty: number;
  inventoryValue: number;
  avgCost: number;
}, input: { mode: "add" | "remove"; quantity: number; price: number }) {
  const delta = input.mode === "add" ? input.quantity : -input.quantity;
  if (input.mode === "add") {
    return calcWeightedAverageCost({
      existingQty: product.physicalQty,
      existingValue: product.inventoryValue,
      incomingQty: input.quantity,
      incomingUnitCost: input.price,
    });
  }
  const newQty = product.physicalQty + delta;
  return {
    newQty,
    newValue: roundMoney(newQty * product.avgCost),
    newAvgCost: product.avgCost,
    incomingValue: roundMoney(input.quantity * input.price),
  };
}

export async function upsertImportation(input: {
  id?: string;
  reference?: string;
  kind?: ImportKind;
  status?: ImportStatus;
  supplierName?: string | null;
  expectedDate?: Date | null;
  notes?: string | null;
  transferFee?: number;
  freight?: number;
  delivery?: number;
  duties?: number;
  customs?: number;
  otherCosts?: number;
  lines: Array<{
    productId?: string | null;
    draftName?: string | null;
    draftSku?: string | null;
    quantity: number;
    purchaseUnitCost: number;
    notes?: string | null;
  }>;
}) {
  const costs = {
    transferFee: input.transferFee ?? 0,
    freight: input.freight ?? 0,
    delivery: input.delivery ?? 0,
    duties: input.duties ?? 0,
    customs: input.customs ?? 0,
    otherCosts: input.otherCosts ?? 0,
  };
  const totalAdditional = additionalImportCosts(costs);
  const productSubtotal = roundMoney(
    input.lines.reduce((s, l) => s + l.quantity * l.purchaseUnitCost, 0),
  );
  const allocated = allocateAdditionalCosts(
    input.lines.map((l, i) => ({
      id: String(i),
      quantity: l.quantity,
      purchaseUnitCost: l.purchaseUnitCost,
    })),
    totalAdditional,
  );
  const coefficient =
    productSubtotal > 0
      ? roundMoney((productSubtotal + totalAdditional) / productSubtotal, 3)
      : 1;

  return prisma.$transaction(async (tx) => {
    let importationId = input.id;
    const reference =
      input.reference?.trim() || `IMP-${Date.now().toString(36).toUpperCase()}`;
    const data = {
      reference,
      kind: input.kind ?? ImportKind.INTERNATIONAL,
      status: input.status ?? ImportStatus.PENDING,
      supplierName: input.supplierName ?? null,
      expectedDate: input.expectedDate ?? null,
      notes: input.notes ?? null,
      ...costs,
      productSubtotal,
      totalAdditionalCosts: totalAdditional,
      coefficient,
    };

    if (importationId) {
      const existing = await tx.importation.findUniqueOrThrow({
        where: { id: importationId },
      });
      if (existing.status === ImportStatus.COMPLETED) {
        throw new Error("Completed importations cannot be edited");
      }
      await tx.importationLine.deleteMany({ where: { importationId } });
      await tx.importation.update({ where: { id: importationId }, data });
    } else {
      const created = await tx.importation.create({
        data: { ...data, createdBy: currentUserId() },
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
          allocatedAdditionalCost: alloc.allocatedAdditionalCost,
          landedUnitCost: alloc.landedUnitCost,
          notes: line.notes || null,
        },
      });
    }

    return tx.importation.findUniqueOrThrow({
      where: { id: importationId! },
      include: { lines: { include: { product: true } } },
    });
  });
}

export async function setImportStatus(id: string, status: ImportStatus) {
  const current = await prisma.importation.findUniqueOrThrow({ where: { id } });
  if (current.status === ImportStatus.COMPLETED) {
    throw new Error("Importation already completed");
  }
  if (status === ImportStatus.COMPLETED) {
    return confirmImportation(id);
  }
  return prisma.importation.update({
    where: { id },
    data: { status },
    include: { lines: { include: { product: true } } },
  });
}

export async function confirmImportation(importationId: string) {
  return prisma.$transaction(async (tx) => {
    const importation = await tx.importation.findUniqueOrThrow({
      where: { id: importationId },
      include: { lines: true },
    });
    if (importation.status === ImportStatus.COMPLETED) {
      throw new Error("Importation already received");
    }
    if (importation.lines.length === 0) throw new Error("Importation has no products");

    const totalAdditional = additionalImportCosts(importation);
    const allocated = allocateAdditionalCosts(
      importation.lines.map((l) => ({
        id: l.id,
        quantity: l.quantity,
        purchaseUnitCost: l.purchaseUnitCost,
      })),
      totalAdditional,
    );

    for (let i = 0; i < importation.lines.length; i++) {
      const line = importation.lines[i];
      const alloc = allocated[i];
      let productId = line.productId;
      if (!productId) {
        const sku =
          line.draftSku?.trim() ||
          `SKU-${Date.now().toString(36).toUpperCase()}-${i}`;
        const created = await tx.product.create({
          data: {
            name: line.draftName?.trim() || sku,
            sku,
            code: nextCode(),
          },
        });
        productId = created.id;
      }
      await tx.importationLine.update({
        where: { id: line.id },
        data: {
          productId,
          allocatedAdditionalCost: alloc.allocatedAdditionalCost,
          landedUnitCost: alloc.landedUnitCost,
        },
      });
      await appendTransaction(tx, {
        productId,
        type: TransactionType.IMPORTATION,
        quantity: line.quantity,
        unitCost: alloc.landedUnitCost,
        reference: importation.reference,
        notes: `Import ${importation.reference}`,
        affectsPhysical: true,
        affectsCost: true,
        metadata: {
          importationId: importation.id,
          purchaseUnitCost: line.purchaseUnitCost,
          allocatedAdditionalCost: alloc.allocatedAdditionalCost,
        },
      });
      await tx.product.update({
        where: { id: productId },
        data: {
          fobCost: line.purchaseUnitCost,
          cifCost: alloc.landedUnitCost,
        },
      });
    }

    const productSubtotal = roundMoney(
      importation.lines.reduce((s, l) => s + l.quantity * l.purchaseUnitCost, 0),
    );
    return tx.importation.update({
      where: { id: importation.id },
      data: {
        status: ImportStatus.COMPLETED,
        receivedAt: new Date(),
        totalAdditionalCosts: totalAdditional,
        productSubtotal,
        coefficient:
          productSubtotal > 0
            ? roundMoney((productSubtotal + totalAdditional) / productSubtotal, 3)
            : 1,
      },
      include: { lines: { include: { product: true } } },
    });
  });
}

export async function listImportations() {
  return prisma.importation.findMany({
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { product: true } } },
  });
}

export async function getImportation(id: string) {
  return prisma.importation.findUnique({
    where: { id },
    include: { lines: { include: { product: true } } },
  });
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
