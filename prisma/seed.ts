import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  ImportationStatus,
  OrderStatus,
  PrismaClient,
  TransactionType,
} from "@prisma/client";
import path from "path";
import {
  allocateAdditionalCosts,
  calcWeightedAverageCost,
  recomputeAvailable,
  roundMoney,
} from "../src/lib/inventory/math";

const url =
  process.env.DATABASE_URL ??
  `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function receive(
  productId: string,
  qty: number,
  unitCost: number,
  reference: string,
  occurredAt: Date,
  type: TransactionType = TransactionType.RECEIVED,
) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
  });
  const calc = calcWeightedAverageCost({
    existingQty: product.physicalQty,
    existingValue: product.inventoryValue,
    incomingQty: qty,
    incomingUnitCost: unitCost,
  });
  const txn = await prisma.inventoryTransaction.create({
    data: {
      productId,
      type,
      quantity: qty,
      unitCost,
      totalValue: roundMoney(qty * unitCost),
      reference,
      userId: "demo",
      occurredAt,
      notes: `Recebimento ${reference}`,
    },
  });
  await prisma.costHistory.create({
    data: {
      productId,
      transactionId: txn.id,
      eventType: type,
      quantityDelta: qty,
      unitCost,
      resultingAvgCost: calc.newAvgCost,
      resultingQty: calc.newQty,
      resultingValue: calc.newValue,
      occurredAt,
    },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      physicalQty: calc.newQty,
      inventoryValue: calc.newValue,
      avgCost: calc.newAvgCost,
      availableQty: recomputeAvailable({
        ...product,
        physicalQty: calc.newQty,
      }),
    },
  });
}

async function main() {
  await prisma.qbSyncEvent.deleteMany();
  await prisma.orderLine.deleteMany();
  await prisma.order.deleteMany();
  await prisma.importationLine.deleteMany();
  await prisma.importation.deleteMany();
  await prisma.costHistory.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.product.deleteMany();

  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Parafuso Sextavado M8",
        sku: "PAR-M8-50",
        secondarySku: "HX-M8",
        ean: "7891000100011",
        b2bPrice: 0.45,
        b2cPrice: 0.79,
        weight: 0.012,
        length: 5,
        width: 1.2,
        height: 1.2,
        notes: "Caixa com 100 und.",
      },
    }),
    prisma.product.create({
      data: {
        name: "Porca Travante M8",
        sku: "POR-M8-T",
        ean: "7891000100028",
        b2bPrice: 0.22,
        b2cPrice: 0.39,
        weight: 0.008,
      },
    }),
    prisma.product.create({
      data: {
        name: "Arruela Lisa M8",
        sku: "ARR-M8-L",
        ean: "7891000100035",
        b2bPrice: 0.08,
        b2cPrice: 0.15,
        weight: 0.003,
      },
    }),
    prisma.product.create({
      data: {
        name: "Cabo HDMI 2.0 2m",
        sku: "CAB-HDMI-2M",
        secondarySku: "HDMI20-2",
        ean: "7891000100042",
        b2bPrice: 28,
        b2cPrice: 49.9,
        weight: 0.15,
        length: 20,
        width: 15,
        height: 3,
      },
    }),
    prisma.product.create({
      data: {
        name: "Fonte 12V 5A",
        sku: "FON-12V-5A",
        ean: "7891000100059",
        b2bPrice: 42,
        b2cPrice: 69.9,
        weight: 0.35,
      },
    }),
    prisma.product.create({
      data: {
        name: "Switch Gigabit 8 Portas",
        sku: "SW-GB-8P",
        ean: "7891000100066",
        b2bPrice: 180,
        b2cPrice: 249,
        weight: 0.6,
      },
    }),
    prisma.product.create({
      data: {
        name: "Fita Isolante 19mm",
        sku: "FIT-ISO-19",
        ean: "7891000100073",
        b2bPrice: 3.5,
        b2cPrice: 6.9,
        weight: 0.08,
      },
    }),
    prisma.product.create({
      data: {
        name: "Multímetro Digital",
        sku: "MUL-DIG-01",
        secondarySku: "MD-BASIC",
        ean: "7891000100080",
        b2bPrice: 55,
        b2cPrice: 89.9,
        weight: 0.28,
      },
    }),
    prisma.product.create({
      data: {
        name: "Conector RJ45 Cat6 (100un)",
        sku: "CON-RJ45-C6",
        ean: "7891000100097",
        b2bPrice: 38,
        b2cPrice: 59.9,
        weight: 0.2,
      },
    }),
    prisma.product.create({
      data: {
        name: "Alicate de Crimpar",
        sku: "ALI-CRIMP-01",
        ean: "7891000100103",
        b2bPrice: 48,
        b2cPrice: 79.9,
        weight: 0.4,
      },
    }),
  ]);

  const [parafuso, porca, arruela, hdmi, fonte, sw, fita, multi, rj45, alicate] =
    products;

  await receive(parafuso.id, 10, 10, "IMP-001", new Date("2026-01-10"));
  await receive(parafuso.id, 10, 20, "IMP-002", new Date("2026-02-05"));
  await receive(parafuso.id, 20, 20, "IMP-003", new Date("2026-03-01"));

  await receive(porca.id, 200, 0.12, "IMP-001", new Date("2026-01-10"));
  await receive(arruela.id, 500, 0.04, "IMP-001", new Date("2026-01-10"));
  await receive(hdmi.id, 40, 18, "IMP-004", new Date("2026-02-20"));
  await receive(fonte.id, 25, 28, "IMP-004", new Date("2026-02-20"));
  await receive(sw.id, 12, 140, "IMP-005", new Date("2026-03-05"));
  await receive(fita.id, 80, 2.1, "IMP-005", new Date("2026-03-05"));
  await receive(multi.id, 15, 35, "IMP-006", new Date("2026-03-12"));
  await receive(rj45.id, 30, 24, "IMP-006", new Date("2026-03-12"));
  await receive(alicate.id, 18, 30, "IMP-006", new Date("2026-03-12"));

  // Draft importation
  const draftLines = [
    { productId: hdmi.id, quantity: 20, purchaseUnitCost: 17 },
    { productId: fonte.id, quantity: 10, purchaseUnitCost: 30 },
  ];
  const additional = 500;
  const allocated = allocateAdditionalCosts(
    draftLines.map((l, i) => ({ id: String(i), ...l })),
    additional,
  );
  await prisma.importation.create({
    data: {
      reference: "IMP-DRAFT-010",
      status: ImportationStatus.IN_TRANSIT,
      expectedDate: new Date("2026-04-01"),
      notes: "Carga em trânsito — exemplo",
      freightIntl: 300,
      customs: 100,
      freightDomestic: 100,
      productSubtotal: draftLines.reduce(
        (s, l) => s + l.quantity * l.purchaseUnitCost,
        0,
      ),
      totalAdditionalCosts: additional,
      lines: {
        create: draftLines.map((l, i) => ({
          productId: l.productId,
          quantity: l.quantity,
          purchaseUnitCost: l.purchaseUnitCost,
          allocatedAdditionalCost: allocated[i].allocatedAdditionalCost,
          landedUnitCost: allocated[i].landedUnitCost,
        })),
      },
    },
  });

  // Sample order with reservation
  const orderProduct = await prisma.product.findUniqueOrThrow({
    where: { id: parafuso.id },
  });
  const reserveQty = 5;
  await prisma.product.update({
    where: { id: parafuso.id },
    data: {
      reservedQty: reserveQty,
      availableQty: recomputeAvailable({
        ...orderProduct,
        reservedQty: reserveQty,
      }),
    },
  });
  await prisma.inventoryTransaction.create({
    data: {
      productId: parafuso.id,
      type: TransactionType.RESERVED,
      quantity: 0,
      unitCost: orderProduct.avgCost,
      totalValue: 0,
      reference: "NF-1024",
      notes: "Reservado via fatura QuickBooks NF-1024",
      userId: "demo",
      occurredAt: new Date("2026-03-10"),
      metadata: JSON.stringify({ orderedQty: reserveQty }),
    },
  });
  await prisma.order.create({
    data: {
      externalRef: "NF-1024",
      customerName: "Cliente Exemplo Ltda",
      status: OrderStatus.OPEN,
      source: "quickbooks",
      lines: {
        create: [
          {
            productId: parafuso.id,
            orderedQty: reserveQty,
            reservedQty: reserveQty,
            remainingQty: reserveQty,
          },
          {
            productId: hdmi.id,
            orderedQty: 2,
            reservedQty: 2,
            remainingQty: 2,
          },
        ],
      },
    },
  });
  const hdmiP = await prisma.product.findUniqueOrThrow({ where: { id: hdmi.id } });
  await prisma.product.update({
    where: { id: hdmi.id },
    data: {
      reservedQty: 2,
      availableQty: recomputeAvailable({ ...hdmiP, reservedQty: 2 }),
    },
  });

  await prisma.qbSyncEvent.create({
    data: {
      eventType: "invoice.created",
      externalId: "NF-1024",
      payload: JSON.stringify({
        id: "qb-inv-1024",
        docNumber: "NF-1024",
        customerName: "Cliente Exemplo Ltda",
        txnDate: "2026-03-10",
        lines: [
          { sku: "PAR-M8-50", quantity: 5 },
          { sku: "CAB-HDMI-2M", quantity: 2 },
        ],
      }),
      processed: true,
      processedAt: new Date("2026-03-10"),
      notes: "Evento de exemplo — fatura sincronizada",
    },
  });

  console.log("Seed concluído:", products.length, "produtos");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
