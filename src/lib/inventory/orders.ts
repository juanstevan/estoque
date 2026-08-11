import { OrderStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recomputeAvailable, roundMoney } from "@/lib/inventory/math";
import { currentUserId } from "@/lib/user";

export async function listOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { product: true } } },
  });
}

export async function getOrderByRef(externalRef: string) {
  return prisma.order.findUnique({
    where: { externalRef },
    include: { lines: { include: { product: true } } },
  });
}

export async function getOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: { lines: { include: { product: true } } },
  });
}

/** Reserve inventory for an invoiced order without removing physical stock. */
export async function createOrUpdateOrderFromInvoice(input: {
  externalRef: string;
  customerName?: string | null;
  source?: string;
  lines: Array<{ productId: string; quantity: number }>;
  notes?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    let order = await tx.order.findUnique({
      where: { externalRef: input.externalRef },
      include: { lines: true },
    });

    if (!order) {
      order = await tx.order.create({
        data: {
          externalRef: input.externalRef,
          customerName: input.customerName ?? null,
          source: input.source ?? "quickbooks",
          notes: input.notes ?? null,
          status: OrderStatus.OPEN,
        },
        include: { lines: true },
      });

      for (const line of input.lines) {
        const product = await tx.product.findUniqueOrThrow({
          where: { id: line.productId },
        });
        if (product.availableQty < line.quantity) {
          throw new Error(
            `Estoque disponível insuficiente para ${product.sku}`,
          );
        }

        await tx.orderLine.create({
          data: {
            orderId: order.id,
            productId: line.productId,
            orderedQty: line.quantity,
            reservedQty: line.quantity,
            remainingQty: line.quantity,
            pickedQty: 0,
            waitingPickupQty: 0,
            deliveredQty: 0,
          },
        });

        await tx.product.update({
          where: { id: line.productId },
          data: {
            reservedQty: roundMoney(product.reservedQty + line.quantity),
            availableQty: recomputeAvailable({
              ...product,
              reservedQty: product.reservedQty + line.quantity,
            }),
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            productId: line.productId,
            type: TransactionType.RESERVED,
            quantity: 0,
            unitCost: product.avgCost,
            totalValue: 0,
            reference: input.externalRef,
            notes: `Reservado para fatura ${input.externalRef}`,
            userId: currentUserId(),
            metadata: JSON.stringify({ orderedQty: line.quantity }),
          },
        });
      }
    }

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: { include: { product: true } } },
    });
  });
}

export async function pickOrderLine(input: {
  orderId: string;
  productId: string;
  quantity: number;
}) {
  if (input.quantity <= 0) throw new Error("Quantidade inválida");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { lines: true },
    });
    const line = order.lines.find((l) => l.productId === input.productId);
    if (!line) throw new Error("Produto não pertence ao pedido");

    const remaining = line.orderedQty - line.pickedQty;
    if (input.quantity > remaining) {
      throw new Error("Quantidade excede o restante do pedido");
    }

    const product = await tx.product.findUniqueOrThrow({
      where: { id: input.productId },
    });

    const newPicked = roundMoney(line.pickedQty + input.quantity);
    const newWaiting = roundMoney(line.waitingPickupQty + input.quantity);
    const newReserved = roundMoney(Math.max(0, line.reservedQty - input.quantity));
    const newRemaining = roundMoney(line.orderedQty - newPicked);

    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        pickedQty: newPicked,
        waitingPickupQty: newWaiting,
        reservedQty: newReserved,
        remainingQty: newRemaining,
      },
    });

    await tx.product.update({
      where: { id: product.id },
      data: {
        reservedQty: roundMoney(Math.max(0, product.reservedQty - input.quantity)),
        waitingPickupQty: roundMoney(product.waitingPickupQty + input.quantity),
        availableQty: recomputeAvailable({
          ...product,
          reservedQty: Math.max(0, product.reservedQty - input.quantity),
          waitingPickupQty: product.waitingPickupQty + input.quantity,
        }),
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        productId: product.id,
        type: TransactionType.RESERVED,
        quantity: 0,
        unitCost: product.avgCost,
        totalValue: 0,
        reference: order.externalRef,
        notes: `Separado ${input.quantity} und. — aguardando retirada`,
        userId: currentUserId(),
        metadata: JSON.stringify({ pickedQty: input.quantity }),
      },
    });

    const updatedLines = await tx.orderLine.findMany({
      where: { orderId: order.id },
    });
    const allPicked = updatedLines.every((l) => l.pickedQty >= l.orderedQty);
    const anyPicked = updatedLines.some((l) => l.pickedQty > 0);
    const status = allPicked
      ? OrderStatus.READY_PICKUP
      : anyPicked
        ? OrderStatus.PARTIALLY_PICKED
        : OrderStatus.OPEN;

    await tx.order.update({ where: { id: order.id }, data: { status } });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: { include: { product: true } } },
    });
  });
}

export async function confirmPickup(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: true },
    });

    for (const line of order.lines) {
      if (line.waitingPickupQty <= 0) continue;
      const product = await tx.product.findUniqueOrThrow({
        where: { id: line.productId },
      });
      const qty = line.waitingPickupQty;

      await tx.product.update({
        where: { id: product.id },
        data: {
          physicalQty: roundMoney(product.physicalQty - qty),
          waitingPickupQty: roundMoney(product.waitingPickupQty - qty),
          inventoryValue: roundMoney(
            (product.physicalQty - qty) * product.avgCost,
          ),
          availableQty: recomputeAvailable({
            ...product,
            physicalQty: product.physicalQty - qty,
            waitingPickupQty: product.waitingPickupQty - qty,
          }),
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: product.id,
          type: TransactionType.PICKED_UP,
          quantity: -qty,
          unitCost: product.avgCost,
          totalValue: roundMoney(qty * product.avgCost),
          reference: order.externalRef,
          notes: "Retirada pelo cliente",
          userId: currentUserId(),
        },
      });

      await tx.orderLine.update({
        where: { id: line.id },
        data: {
          waitingPickupQty: 0,
          deliveredQty: roundMoney(line.deliveredQty + qty),
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.COMPLETED },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: { include: { product: true } } },
    });
  });
}
