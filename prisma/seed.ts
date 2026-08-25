import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  ExitStatus,
  ImportKind,
  ImportStatus,
  PrismaClient,
  TransactionType,
} from "@prisma/client";
import path from "path";
import { createHash } from "crypto";
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

function hash(p: string) {
  return createHash("sha256").update(p).digest("hex");
}

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
      userId: "admin",
      occurredAt,
      notes: `Receipt ${reference}`,
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
      cifCost: unitCost,
      fobCost: product.fobCost || unitCost,
      availableQty: recomputeAvailable({
        physicalQty: calc.newQty,
        reservedQty: product.reservedQty,
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
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSettings.deleteMany();

  await prisma.appSettings.create({ data: { id: "default" } });
  await prisma.user.create({
    data: {
      username: "admin",
      name: "Juan Souza",
      passwordHash: hash("chaleur"),
      role: "admin",
    },
  });
  await prisma.supplier.createMany({
    data: [
      { name: "Chaleur Manufacturing Co." },
      { name: "GreenView Supply" },
      { name: "Pacific Imports" },
    ],
  });

  const grill = await prisma.product.create({
    data: {
      code: "034CDO",
      name: "Complete Name of the Product just for illustration",
      sku: "SKU-NEW",
      amazonUrl: "https://www.amazon.com",
      b2bPrice: 894.48,
      b2cPrice: 1034.75,
      fobCost: 128.96,
      cifCost: 128.96,
      lastSoldPrice: 894.48,
      suppliers: JSON.stringify(["Chaleur Manufacturing Co.", "Pacific Imports"]),
      weight: 41,
      packageWeight: 41,
      length: 80,
      width: 50,
      height: 40,
      packageLength: 90,
      packageWidth: 60,
      packageHeight: 50,
      notes: "Some notes just so you can understand, this is some notes got it? I hope you did =)",
      imageUrl: "/file.svg",
    },
  });
  const hood = await prisma.product.create({
    data: {
      code: "CDO34",
      name: "Outdoor Grill Hood 36in",
      sku: "HOOD-36",
      b2bPrice: 620,
      b2cPrice: 799,
      fobCost: 210,
      cifCost: 255,
      weight: 22,
      packageWeight: 24,
      packageLength: 100,
      packageWidth: 40,
      packageHeight: 30,
    },
  });
  const burner = await prisma.product.create({
    data: {
      code: "1239",
      name: "Side Burner Module",
      sku: "SBM-01",
      b2bPrice: 180,
      b2cPrice: 249,
      fobCost: 72,
      cifCost: 88,
      weight: 8,
      packageWeight: 9,
    },
  });

  await receive(grill.id, 123, 128.96, "IMP-001", new Date("2026-01-10"));
  await receive(hood.id, 40, 255, "IMP-001", new Date("2026-01-10"));
  await receive(burner.id, 80, 88, "IMP-002", new Date("2026-02-05"));

  const extra = [
    { transferFee: 400, freight: 1200, delivery: 250, duties: 380, customs: 226.08, otherCosts: 0 },
  ][0];
  const lines = [
    { productId: grill.id, quantity: 10, purchaseUnitCost: 120 },
    { productId: hood.id, quantity: 6, purchaseUnitCost: 210 },
  ];
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.purchaseUnitCost, 0);
  const add =
    extra.transferFee + extra.freight + extra.delivery + extra.duties + extra.customs;
  const allocated = allocateAdditionalCosts(
    lines.map((l, i) => ({ id: String(i), ...l })),
    add,
  );

  await prisma.importation.create({
    data: {
      reference: "IMP-4412",
      kind: ImportKind.INTERNATIONAL,
      status: ImportStatus.IN_TRANSIT,
      supplierName: "Chaleur Manufacturing Co.",
      expectedDate: new Date("2026-12-02"),
      ...extra,
      productSubtotal: subtotal,
      totalAdditionalCosts: add,
      coefficient: roundMoney((subtotal + add) / subtotal, 3),
      lines: {
        create: lines.map((l, i) => ({
          productId: l.productId,
          quantity: l.quantity,
          purchaseUnitCost: l.purchaseUnitCost,
          allocatedAdditionalCost: allocated[i].allocatedAdditionalCost,
          landedUnitCost: allocated[i].landedUnitCost,
        })),
      },
    },
  });

  await prisma.importation.create({
    data: {
      reference: "IMP-2201",
      kind: ImportKind.DOMESTIC,
      status: ImportStatus.PENDING,
      supplierName: "GreenView Supply",
      expectedDate: new Date("2026-04-18"),
      productSubtotal: 4200,
      totalAdditionalCosts: 0,
      coefficient: 1,
      lines: {
        create: {
          productId: burner.id,
          quantity: 20,
          purchaseUnitCost: 72,
          landedUnitCost: 72,
        },
      },
    },
  });

  await prisma.importation.create({
    data: {
      reference: "IMP-1090",
      kind: ImportKind.INTERNATIONAL,
      status: ImportStatus.DELAYED,
      supplierName: "Pacific Imports",
      expectedDate: new Date("2024-11-02"),
      freight: 800,
      customs: 400,
      productSubtotal: 9000,
      totalAdditionalCosts: 1200,
      coefficient: 1.133,
    },
  });

  await prisma.importation.create({
    data: {
      reference: "IMP-0888",
      kind: ImportKind.INTERNATIONAL,
      status: ImportStatus.COMPLETED,
      supplierName: "Chaleur Manufacturing Co.",
      expectedDate: new Date("2026-01-10"),
      receivedAt: new Date("2026-01-15"),
      productSubtotal: 15000,
      totalAdditionalCosts: 2456.08,
      coefficient: 1.164,
    },
  });

  const reservedOrder = await prisma.order.create({
    data: {
      externalRef: "INV-1024",
      customerName: "GreenView cliente apenas para exemplo",
      seller: "Juan Souza",
      assignedTo: "Juan Souza",
      address: "8432 English Laure Ct.",
      deliverBy: new Date("2026-12-02"),
      status: ExitStatus.PREPARING,
      onKanban: true,
      notes: "Call before delivery",
      totalAmount: 2684,
      lines: {
        create: [
          {
            productId: grill.id,
            orderedQty: 3,
            reservedQty: 3,
            remainingQty: 3,
            unitPrice: 894.48,
          },
        ],
      },
    },
  });

  const g = await prisma.product.findUniqueOrThrow({ where: { id: grill.id } });
  await prisma.product.update({
    where: { id: grill.id },
    data: {
      reservedQty: 3,
      availableQty: recomputeAvailable({
        physicalQty: g.physicalQty,
        reservedQty: 3,
      }),
    },
  });
  await prisma.inventoryTransaction.create({
    data: {
      productId: grill.id,
      type: TransactionType.RESERVED,
      quantity: 0,
      unitCost: g.avgCost,
      reference: reservedOrder.externalRef,
      clientName: reservedOrder.customerName,
      notes: "Reserved for invoice INV-1024",
      userId: "admin",
    },
  });

  await prisma.order.create({
    data: {
      externalRef: "INV-0881",
      customerName: "Someone Clients Just LLC",
      seller: "Juan Souza",
      assignedTo: "Juan Souza",
      address: "8432 English Laure Ct.",
      deliverBy: new Date("2026-12-02"),
      status: ExitStatus.PENDING,
      onKanban: true,
      totalAmount: 1790,
      lines: {
        create: {
          productId: hood.id,
          orderedQty: 2,
          reservedQty: 2,
          unitPrice: 620,
        },
      },
    },
  });
  const h = await prisma.product.findUniqueOrThrow({ where: { id: hood.id } });
  await prisma.product.update({
    where: { id: hood.id },
    data: {
      reservedQty: 2,
      availableQty: recomputeAvailable({
        physicalQty: h.physicalQty,
        reservedQty: 2,
      }),
    },
  });

  await prisma.order.create({
    data: {
      externalRef: "INV-3300",
      customerName: "Patio Living Co.",
      seller: "Maria Lima",
      status: ExitStatus.PENDING,
      onKanban: false,
      totalAmount: 2490,
      lines: {
        create: {
          productId: burner.id,
          orderedQty: 10,
          unitPrice: 249,
        },
      },
    },
  });

  console.log("Seed complete. Login: admin / chaleur");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
