import {
  ImportationStatus,
  Prisma,
  TransactionType,
  type Product,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";
import {
  allocateAdditionalCosts,
  calcWeightedAverageCost,
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
      throw new Error(
        `Quantidade física insuficiente para o produto ${product.sku}`,
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
    // Outbound: reduce inventory value at current average cost
    nextValue = roundMoney(nextPhysical * product.avgCost);
    nextAvg = product.avgCost;
  } else if (affectsPhysical && quantity > 0 && !affectsCost) {
    // Positive physical without cost change (e.g. found stock) — keep avg, add value at avg
    nextValue = roundMoney(product.inventoryValue + quantity * product.avgCost);
  }

  const availableQty = recomputeAvailable({
    ...product,
    physicalQty: nextPhysical,
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

export async function createProduct(input: {
  name: string;
  sku: string;
  secondarySku?: string | null;
  ean?: string | null;
  imageUrl?: string | null;
  b2bPrice?: number;
  b2cPrice?: number;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  notes?: string | null;
  initialQty?: number;
  initialUnitCost?: number;
}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: input.name,
        sku: input.sku,
        secondarySku: input.secondarySku || null,
        ean: input.ean || null,
        imageUrl: input.imageUrl || null,
        b2bPrice: input.b2bPrice ?? 0,
        b2cPrice: input.b2cPrice ?? 0,
        weight: input.weight ?? null,
        length: input.length ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
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
        reference: "ESTOQUE-INICIAL",
        notes: "Estoque inicial na criação do produto",
        affectsPhysical: true,
        affectsCost: true,
      });
    }

    return tx.product.findUniqueOrThrow({ where: { id: product.id } });
  });
}

export async function updateProduct(
  id: string,
  input: Partial<{
    name: string;
    sku: string;
    secondarySku: string | null;
    ean: string | null;
    imageUrl: string | null;
    b2bPrice: number;
    b2cPrice: number;
    weight: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    notes: string | null;
  }>,
) {
  return prisma.product.update({ where: { id }, data: input });
}

export async function listProducts(search?: string) {
  const q = search?.trim();
  if (!q) {
    return prisma.product.findMany({ orderBy: { name: "asc" } });
  }
  return prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { sku: { contains: q } },
        { secondarySku: { contains: q } },
        { ean: { contains: q } },
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
    },
  });
}

export async function adjustInventory(input: {
  productId: string;
  quantityDelta: number;
  reason: string;
  notes?: string | null;
  occurredAt?: Date;
  type?: "ADJUSTMENT" | "CORRECTION";
}) {
  if (!input.reason?.trim()) {
    throw new Error("Motivo é obrigatório para ajustes manuais");
  }
  if (input.quantityDelta === 0) {
    throw new Error("Quantidade do ajuste não pode ser zero");
  }

  return prisma.$transaction(async (tx) => {
    const type =
      input.type === "CORRECTION"
        ? TransactionType.CORRECTION
        : TransactionType.ADJUSTMENT;

    const txn = await appendTransaction(tx, {
      productId: input.productId,
      type,
      quantity: input.quantityDelta,
      notes: input.notes ?? null,
      reason: input.reason,
      occurredAt: input.occurredAt,
      affectsPhysical: true,
      affectsCost: input.quantityDelta > 0,
      unitCost:
        input.quantityDelta > 0
          ? (
              await tx.product.findUniqueOrThrow({
                where: { id: input.productId },
              })
            ).avgCost
          : undefined,
      metadata: { reason: input.reason },
    });

    return txn;
  });
}

export async function getCostAtDate(productId: string, at: Date) {
  const row = await prisma.costHistory.findFirst({
    where: { productId, occurredAt: { lte: at } },
    orderBy: { occurredAt: "desc" },
  });
  if (row) return row.resultingAvgCost;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  return product?.avgCost ?? 0;
}

function sumAdditional(imp: {
  freightIntl: number;
  customs: number;
  brokerFees: number;
  portFees: number;
  freightDomestic: number;
  otherCosts: number;
}) {
  return roundMoney(
    imp.freightIntl +
      imp.customs +
      imp.brokerFees +
      imp.portFees +
      imp.freightDomestic +
      imp.otherCosts,
  );
}

export async function upsertImportation(input: {
  id?: string;
  reference?: string;
  status?: ImportationStatus;
  expectedDate?: Date | null;
  notes?: string | null;
  freightIntl?: number;
  customs?: number;
  brokerFees?: number;
  portFees?: number;
  freightDomestic?: number;
  otherCosts?: number;
  lines: Array<{
    id?: string;
    productId?: string | null;
    draftName?: string | null;
    draftSku?: string | null;
    draftEan?: string | null;
    quantity: number;
    purchaseUnitCost: number;
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    notes?: string | null;
  }>;
}) {
  const costs = {
    freightIntl: input.freightIntl ?? 0,
    customs: input.customs ?? 0,
    brokerFees: input.brokerFees ?? 0,
    portFees: input.portFees ?? 0,
    freightDomestic: input.freightDomestic ?? 0,
    otherCosts: input.otherCosts ?? 0,
  };
  const totalAdditional = sumAdditional(costs);
  const productSubtotal = roundMoney(
    input.lines.reduce(
      (s, l) => s + l.quantity * l.purchaseUnitCost,
      0,
    ),
  );

  const allocated = allocateAdditionalCosts(
    input.lines.map((l, i) => ({
      id: l.id ?? String(i),
      quantity: l.quantity,
      purchaseUnitCost: l.purchaseUnitCost,
    })),
    totalAdditional,
  );

  const status = input.status ?? ImportationStatus.DRAFT;
  if (status === ImportationStatus.RECEIVED) {
    throw new Error("Use confirmImportation para receber o estoque");
  }

  return prisma.$transaction(async (tx) => {
    let importationId = input.id;
    const reference =
      input.reference?.trim() ||
      `IMP-${Date.now().toString(36).toUpperCase()}`;

    if (importationId) {
      const existing = await tx.importation.findUniqueOrThrow({
        where: { id: importationId },
      });
      if (existing.status === ImportationStatus.RECEIVED) {
        throw new Error("Importação já recebida não pode ser editada");
      }
      await tx.importationLine.deleteMany({ where: { importationId } });
      await tx.importation.update({
        where: { id: importationId },
        data: {
          reference,
          status,
          expectedDate: input.expectedDate ?? null,
          notes: input.notes ?? null,
          ...costs,
          productSubtotal,
          totalAdditionalCosts: totalAdditional,
        },
      });
    } else {
      const created = await tx.importation.create({
        data: {
          reference,
          status,
          expectedDate: input.expectedDate ?? null,
          notes: input.notes ?? null,
          ...costs,
          productSubtotal,
          totalAdditionalCosts: totalAdditional,
          createdBy: currentUserId(),
        },
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
          draftEan: line.draftEan || null,
          quantity: line.quantity,
          purchaseUnitCost: line.purchaseUnitCost,
          allocatedAdditionalCost: alloc.allocatedAdditionalCost,
          landedUnitCost: alloc.landedUnitCost,
          weight: line.weight ?? null,
          length: line.length ?? null,
          width: line.width ?? null,
          height: line.height ?? null,
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

export async function confirmImportation(importationId: string) {
  return prisma.$transaction(async (tx) => {
    const importation = await tx.importation.findUniqueOrThrow({
      where: { id: importationId },
      include: { lines: true },
    });

    if (importation.status === ImportationStatus.RECEIVED) {
      throw new Error("Importação já foi recebida");
    }
    if (importation.status === ImportationStatus.CANCELLED) {
      throw new Error("Importação cancelada");
    }
    if (importation.lines.length === 0) {
      throw new Error("Importação sem produtos");
    }

    const costs = {
      freightIntl: importation.freightIntl,
      customs: importation.customs,
      brokerFees: importation.brokerFees,
      portFees: importation.portFees,
      freightDomestic: importation.freightDomestic,
      otherCosts: importation.otherCosts,
    };
    const totalAdditional = sumAdditional(costs);
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
            ean: line.draftEan || null,
            weight: line.weight ?? null,
            length: line.length ?? null,
            width: line.width ?? null,
            height: line.height ?? null,
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
        notes: line.notes || `Recebimento ${importation.reference}`,
        affectsPhysical: true,
        affectsCost: true,
        metadata: {
          importationId: importation.id,
          purchaseUnitCost: line.purchaseUnitCost,
          allocatedAdditionalCost: alloc.allocatedAdditionalCost,
        },
      });
    }

    return tx.importation.update({
      where: { id: importation.id },
      data: {
        status: ImportationStatus.RECEIVED,
        receivedAt: new Date(),
        totalAdditionalCosts: totalAdditional,
        productSubtotal: roundMoney(
          importation.lines.reduce(
            (s, l) => s + l.quantity * l.purchaseUnitCost,
            0,
          ),
        ),
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

export type ProductListItem = Product;
