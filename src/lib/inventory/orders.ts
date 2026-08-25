import { ExitStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recomputeAvailable, roundMoney } from "@/lib/inventory/math";
import { currentUserId } from "@/lib/user";
import { appendTransaction } from "@/lib/inventory/service";

export async function listOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { product: true } } },
  });
}

export async function getOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: { lines: { include: { product: true } } },
  });
}

export async function updateOrder(
  id: string,
  data: {
    customerName?: string | null;
    assignedTo?: string | null;
    address?: string | null;
    deliverBy?: Date | null;
    notes?: string | null;
    photos?: string | null;
    seller?: string | null;
  },
) {
  return prisma.order.update({
    where: { id },
    data,
    include: { lines: { include: { product: true } } },
  });
}

export async function placeOnKanban(id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    if (order.onKanban) {
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: { lines: { include: { product: true } } },
      });
    }
    for (const line of order.lines) {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: line.productId },
      });
      const reserved = roundMoney(product.reservedQty + line.orderedQty);
      await tx.product.update({
        where: { id: product.id },
        data: {
          reservedQty: reserved,
          availableQty: recomputeAvailable({
            physicalQty: product.physicalQty,
            reservedQty: reserved,
          }),
        },
      });
      await tx.orderLine.update({
        where: { id: line.id },
        data: { reservedQty: line.orderedQty, remainingQty: line.orderedQty },
      });
      await tx.inventoryTransaction.create({
        data: {
          productId: product.id,
          type: TransactionType.RESERVED,
          quantity: 0,
          unitCost: product.avgCost,
          totalValue: 0,
          reference: order.externalRef,
          clientName: order.customerName,
          notes: `Reserved for invoice ${order.externalRef}`,
          userId: currentUserId(),
        },
      });
    }
    return tx.order.update({
      where: { id },
      data: { onKanban: true, status: ExitStatus.PENDING },
      include: { lines: { include: { product: true } } },
    });
  });
}

export async function setExitStatus(id: string, status: ExitStatus) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id } });
  if (order.status === ExitStatus.COMPLETED) {
    throw new Error("Exit already completed");
  }
  if (status === ExitStatus.COMPLETED) {
    return completeExit(id);
  }
  return prisma.order.update({
    where: { id },
    data: { status, onKanban: true },
    include: { lines: { include: { product: true } } },
  });
}

async function completeExit(id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    for (const line of order.lines) {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: line.productId },
      });
      const qty = line.reservedQty || line.orderedQty;
      await appendTransaction(tx, {
        productId: product.id,
        type: TransactionType.SOLD,
        quantity: -qty,
        unitCost: product.avgCost,
        reference: order.externalRef,
        clientName: order.customerName,
        notes: "Delivered",
        affectsPhysical: true,
        affectsCost: false,
      });
      const after = await tx.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      const reserved = roundMoney(Math.max(0, after.reservedQty - qty));
      await tx.product.update({
        where: { id: product.id },
        data: {
          reservedQty: reserved,
          availableQty: recomputeAvailable({
            physicalQty: after.physicalQty,
            reservedQty: reserved,
          }),
          lastSoldPrice: line.unitPrice || after.lastSoldPrice,
        },
      });
      await tx.orderLine.update({
        where: { id: line.id },
        data: { reservedQty: 0, deliveredQty: qty },
      });
    }
    return tx.order.update({
      where: { id },
      data: { status: ExitStatus.COMPLETED, onKanban: false },
      include: { lines: { include: { product: true } } },
    });
  });
}
