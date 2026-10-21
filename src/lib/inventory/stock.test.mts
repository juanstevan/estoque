/**
 * Stock and cost integrity, end to end on a throwaway database:
 *   DATABASE_URL=postgres://…@localhost:<port>/… npx tsx src/lib/inventory/stock.test.mts
 * It wipes and fills that database, so it refuses anything that isn't local.
 */
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { ImportStatus, PrismaClient, TransactionType } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Refusing: set DATABASE_URL to a local throwaway database");
// One connection: `prisma dev` takes a single one.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
(globalThis as { prisma?: PrismaClient }).prisma = db;

const { adjustCost, changeQuantity, createProduct, setImportStatus, upsertImportation } = await import("./service");
const { addToWorkflow } = await import("./orders");
const { ingestInvoice, pairLines } = await import("../quickbooks/ingest");

const ME = "tester";
const actor = { id: ME, name: "Tester" };

async function wipe() {
  await db.$executeRawUnsafe(
    `TRUNCATE "CostHistory", "InventoryTransaction", "ImportationLine", "Importation", "DeliveryLine", "Delivery", "OrderEvent", "OrderProof", "OrderLine", "Order", "QbSyncEvent", "Product", "AppSettings" CASCADE`,
  );
  await db.appSettings.create({ data: { id: "default", qbRealmId: "realm" } });
}

const product = (id: string) => db.product.findUniqueOrThrow({ where: { id } });
const rejects = async (run: () => Promise<unknown>, pattern: RegExp) => assert.rejects(run, pattern);

/** Every product's stored numbers agree with its movements and reservations. */
async function invariants() {
  for (const p of await db.product.findMany({ include: { transactions: true, orderLines: true } })) {
    const moved = p.transactions.reduce((sum, t) => sum + t.quantity, 0);
    assert.equal(p.physicalQty, moved, `${p.name}: physical = Σ movements`);
    assert.equal(p.reservedQty, p.orderLines.reduce((sum, l) => sum + l.reservedQty, 0), `${p.name}: reserved = Σ invoice lines`);
    assert.equal(p.availableQty, p.physicalQty - p.reservedQty, `${p.name}: available = physical − reserved`);
    assert.ok(p.physicalQty >= 0, `${p.name}: physical ≥ 0`);
    assert.ok(Math.abs(p.inventoryValue - p.physicalQty * p.avgCost) < 0.01, `${p.name}: value = units × average`);
  }
}

async function importation(lines: { productId: string; quantity: number; purchaseUnitCost: number }[], extra: { freight?: number; historical?: boolean; receivedAt?: Date } = {}) {
  const saved = await upsertImportation({ lines, userId: ME, ...extra });
  return saved!.id;
}

await wipe();

// ── Importation: receive, receive again, reopen, reconfirm ────────────────────────────────────
{
  const p = await createProduct({ name: "Grill A", sku: "A", initialQty: 10, initialUnitCost: 50 });
  const id = await importation([{ productId: p.id, quantity: 10, purchaseUnitCost: 100 }], { receivedAt: new Date("2026-10-10T12:00:00Z") });

  await setImportStatus(id, ImportStatus.COMPLETED, ME);
  await setImportStatus(id, ImportStatus.COMPLETED, ME); // a second click: no second receipt
  let a = await product(p.id);
  assert.equal(a.physicalQty, 20);
  assert.equal(a.avgCost, 75);
  assert.equal(a.cifCost, 100);
  const receipt = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: p.id, type: TransactionType.IMPORTATION } });
  assert.equal(receipt.occurredAt.toISOString(), "2026-10-10T12:00:00.000Z", "units recorded on the received day");
  assert.equal(receipt.userId, ME);

  // Reopening restores the product exactly, and keeps the history.
  await setImportStatus(id, ImportStatus.IN_TRANSIT, ME);
  await setImportStatus(id, ImportStatus.IN_TRANSIT, ME); // again: only a status change
  a = await product(p.id);
  assert.deepEqual([a.physicalQty, a.avgCost, a.inventoryValue, a.cifCost], [10, 50, 500, 50]);
  assert.equal(await db.inventoryTransaction.count({ where: { productId: p.id, type: TransactionType.IMPORTATION } }), 2);

  // Freight arrives: 10 × (100 + 10) on top of 10 × 50 → average 80, not 92.50.
  await upsertImportation({ id, lines: [{ productId: p.id, quantity: 10, purchaseUnitCost: 100 }], freight: 100, userId: ME });
  await setImportStatus(id, ImportStatus.COMPLETED, ME);
  a = await product(p.id);
  assert.deepEqual([a.physicalQty, a.avgCost], [20, 80]);

  // Once units moved, reopening would guess; it refuses and points to adjustments.
  await changeQuantity({ productId: p.id, mode: "remove", quantity: 1, reason: "Correction", userId: ME });
  await rejects(() => setImportStatus(id, ImportStatus.PENDING, ME), /has moved since/);
  assert.equal((await db.importation.findUniqueOrThrow({ where: { id } })).status, ImportStatus.COMPLETED);

  // A save can't complete an importation (no units would come in).
  const other = await importation([{ productId: p.id, quantity: 1, purchaseUnitCost: 1 }]);
  await upsertImportation({ id: other, status: ImportStatus.COMPLETED, lines: [{ productId: p.id, quantity: 1, purchaseUnitCost: 1 }], userId: ME });
  assert.notEqual((await db.importation.findUniqueOrThrow({ where: { id: other } })).status, ImportStatus.COMPLETED);
  await rejects(() => importation([{ productId: p.id, quantity: -3, purchaseUnitCost: 1 }]), /quantity above 0/);
  await invariants();
}

// ── Historical importations set the cost basis and never add units ────────────────────────────
{
  const p = await createProduct({ name: "Burner B", sku: "B", initialQty: 5 }); // cost unknown
  assert.equal((await product(p.id)).avgCost, 0);
  assert.equal(await db.costHistory.count({ where: { productId: p.id } }), 0, "no $0 cost entry");

  const h1 = await importation([{ productId: p.id, quantity: 4, purchaseUnitCost: 20 }], { historical: true });
  const h2 = await importation([{ productId: p.id, quantity: 6, purchaseUnitCost: 30 }], { historical: true });
  await setImportStatus(h1, ImportStatus.COMPLETED, ME);
  await setImportStatus(h2, ImportStatus.COMPLETED, ME);
  let b = await product(p.id);
  assert.deepEqual([b.physicalQty, b.avgCost, b.inventoryValue], [5, 26, 130]); // (4·20 + 6·30) / 10

  await setImportStatus(h2, ImportStatus.PENDING, ME); // without it: 20
  b = await product(p.id);
  assert.deepEqual([b.physicalQty, b.avgCost], [5, 20]);
  await setImportStatus(h1, ImportStatus.PENDING, ME); // none left: back to before
  assert.equal((await product(p.id)).avgCost, 0);
  await rejects(() => upsertImportation({ historical: true, lines: [{ quantity: 1, purchaseUnitCost: 1, draftName: "New" }], userId: ME }), /already in stock/);
  await invariants();
}

// ── Quantity and cost corrections stay apart ──────────────────────────────────────────────────
{
  const p = await createProduct({ name: "Door C", sku: "C", initialQty: 4, initialUnitCost: 10 });
  await changeQuantity({ productId: p.id, mode: "add", quantity: 2, reason: "Correction", userId: ME, requestId: "r1" });
  await changeQuantity({ productId: p.id, mode: "add", quantity: 2, reason: "Correction", userId: ME, requestId: "r1" }); // retry
  let c = await product(p.id);
  assert.deepEqual([c.physicalQty, c.avgCost, c.cifCost], [6, 10, 10]);
  const adjust = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: p.id, type: TransactionType.ADJUSTMENT } });
  assert.equal(adjust.userId, ME);
  assert.deepEqual(JSON.parse(adjust.metadata!).before.physicalQty, 4);

  await adjustCost({ productId: p.id, avgCost: 12.5, reason: "Supplier invoice", userId: ME });
  c = await product(p.id);
  assert.deepEqual([c.physicalQty, c.avgCost, c.inventoryValue], [6, 12.5, 75]);
  assert.equal(await db.costHistory.count({ where: { productId: p.id, eventType: TransactionType.COST_ADJUSTMENT } }), 1);

  await rejects(() => changeQuantity({ productId: p.id, mode: "add", quantity: Number.NaN, reason: "x", userId: ME }), /greater than 0/);
  await rejects(() => adjustCost({ productId: p.id, avgCost: -1, reason: "x", userId: ME }), /0 or more/);
  await invariants();
}

// ── Invoices: no reservation beyond what's available; same item on two lines ──────────────────
{
  const p = await createProduct({ name: "Grill D", sku: "D", initialQty: 3, initialUnitCost: 10 });
  const invoice = (lines: { id: string; qty: number }[], updated: string) => ({
    Invoice: {
      Id: "77",
      DocNumber: "1077",
      TxnDate: "2026-10-15",
      Balance: 0,
      TotalAmt: 100,
      MetaData: { LastUpdatedTime: updated },
      Line: lines.map((line) => ({
        Id: line.id,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: { ItemRef: { name: "Grill D" }, Qty: line.qty, UnitPrice: 10, Sku: "D" },
      })),
    },
  });

  await ingestInvoice(invoice([{ id: "1", qty: 2 }, { id: "2", qty: 2 }], "2026-10-15T10:00:00Z"));
  const order = await db.order.findUniqueOrThrow({ where: { externalRef: "1077" }, include: { lines: true } });
  assert.equal(order.lines.length, 2);
  await rejects(() => addToWorkflow(order.id, actor), /Not enough stock.*needs 4, 3 available/);

  await ingestInvoice(invoice([{ id: "1", qty: 2 }, { id: "2", qty: 1 }], "2026-10-15T11:00:00Z"));
  await addToWorkflow(order.id, actor);
  assert.equal((await product(p.id)).reservedQty, 3);

  // QuickBooks lowers line 2 only: line 1 keeps 2, line 2 has 0 → removed; one unit released.
  await ingestInvoice(invoice([{ id: "1", qty: 2 }], "2026-10-15T12:00:00Z"));
  await ingestInvoice(invoice([{ id: "1", qty: 2 }], "2026-10-15T12:00:00Z")); // same version again: skipped
  const lines = await db.orderLine.findMany({ where: { orderId: order.id } });
  assert.deepEqual(lines.map((l) => [l.qbLineId, l.orderedQty, l.reservedQty]), [["1", 2, 2]]);
  assert.equal((await product(p.id)).reservedQty, 2);

  // A removal can't take reserved units.
  await rejects(() => changeQuantity({ productId: p.id, mode: "remove", quantity: 2, reason: "Correction", userId: ME }), /reserved for invoices/);
  await invariants();
}

// ── Pairing on its own ────────────────────────────────────────────────────────────────────────
{
  const row = (id: string, productId: string, qbLineId: string | null) => ({ id, productId, qbLineId, orderedQty: 1, reservedQty: 0, unitPrice: 0, deliveredQty: 0 });
  const line = (productId: string, lineId?: string) => ({ productId, lineId, quantity: 1, unitPrice: 0, physical: true });
  const { pairs, leftovers } = pairLines([row("a", "P", "1"), row("b", "P", "2"), row("c", "Q", null)], [line("P", "2"), line("P", "1"), line("Q", "9")]);
  assert.deepEqual(pairs.map((p) => p.current?.id), ["b", "a", "c"]);
  assert.equal(leftovers.length, 0);
}

await db.$disconnect();
console.log("stock.test: ok");
