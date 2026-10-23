/**
 * Stock, receipts, deliveries and returns, end to end on a throwaway database:
 *   DATABASE_URL=postgres://…@localhost:<port>/… npx tsx src/lib/inventory/stock.test.mts
 * It wipes and fills that database, so it refuses anything that isn't local.
 */
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { ExitStatus, ImportStatus, PrismaClient, TransactionType } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Refusing: set DATABASE_URL to a local throwaway database");
// `prisma dev` takes one connection, so "simultaneous" requests below queue on it.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
(globalThis as { prisma?: PrismaClient }).prisma = db;

const { adjustCost, changeQuantity, correctFob, createProduct, receiveImportation, resolveSetAside, reviseImportation, setImportStatus, upsertImportation } =
  await import("./service");
const { addProof, addToWorkflow, completeDelivery, moveDelivery, recordReturn, removeFromWorkflow, setPrepared } = await import("./orders");
const { editLogEntry, removeLogEntry } = await import("./service");
const { ownedProofUrl } = await import("./proof-file");
const { ingestInvoice, pairLines } = await import("../quickbooks/ingest");

const ME = "tester";
const actor = { id: ME, name: "Tester" };
const PHOTO = "https://store.public.blob.vercel-storage.com/proofs/import-x/a.jpg";

await db.$executeRawUnsafe(
  `TRUNCATE "CostHistory", "InventoryTransaction", "ImportationEvent", "ImportationProof", "ImportationLine", "Importation", "DeliveryLine", "Delivery", "OrderEvent", "OrderProof", "OrderLine", "Order", "QbSyncEvent", "Product", "AppSettings" CASCADE`,
);
await db.appSettings.create({ data: { id: "default", qbRealmId: "realm" } });

const roundTo = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const product = (id: string) => db.product.findUniqueOrThrow({ where: { id } });
const rejects = (run: () => Promise<unknown>, pattern: RegExp) => assert.rejects(run, pattern);
const count = (productId: string, type: TransactionType) => db.inventoryTransaction.count({ where: { productId, type } });

/** Every product's stored numbers agree with its movements and reservations. */
async function invariants() {
  for (const p of await db.product.findMany({ include: { transactions: true, orderLines: true } })) {
    const moved = p.transactions.reduce((sum, t) => sum + t.quantity, 0);
    assert.equal(p.physicalQty, moved, `${p.name}: physical = Σ movements`);
    assert.equal(p.reservedQty, p.orderLines.reduce((sum, l) => sum + l.reservedQty, 0), `${p.name}: reserved = Σ invoice lines`);
    assert.equal(p.availableQty, p.physicalQty - p.reservedQty - p.unavailableQty, `${p.name}: available = physical − reserved − set aside`);
    assert.ok(p.physicalQty >= 0 && p.unavailableQty >= 0 && p.unavailableQty <= p.physicalQty, `${p.name}: quantities in range`);
    assert.ok(Math.abs(p.inventoryValue - p.physicalQty * p.avgCost) < 0.01, `${p.name}: value = units × average`);
  }
}

const importation = async (lines: { productId: string; quantity: number; purchaseUnitCost: number; taxRate?: number }[], extra: { freight?: number; duties?: number; historical?: boolean; expectedDate?: Date } = {}) =>
  (await upsertImportation({ lines, userId: ME, ...extra }))!.id;
const receive = (id: string, day = "2026-10-10", photos = [PHOTO]) =>
  receiveImportation(id, { receivedAt: new Date(`${day}T12:00:00Z`), photos, actor });

/** A paid QuickBooks invoice; `version` moves its last-updated time forward. */
function qbInvoice(id: string, lines: { line: string; sku: string; name: string; qty: number }[], version: number, extra: object = {}) {
  return {
    Invoice: {
      Id: id,
      DocNumber: `D${id}`,
      TxnDate: "2026-10-15",
      Balance: 0,
      TotalAmt: 100,
      MetaData: { LastUpdatedTime: new Date(Date.UTC(2026, 9, 15, 10, version)).toISOString() },
      Line: lines.map((l) => ({ Id: l.line, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { name: l.name }, Qty: l.qty, UnitPrice: 10, Sku: l.sku } })),
      ...extra,
    },
  };
}
/** Takes an invoice through the workflow until its first delivery is completed. */
async function deliverAll(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { deliveries: { include: { lines: true }, orderBy: { number: "asc" } } } });
  const d = order.deliveries.find((x) => x.status !== ExitStatus.COMPLETED)!;
  await setPrepared(d.id, Object.fromEntries(d.lines.map((l) => [l.id, l.qty])), actor);
  await moveDelivery(d.id, ExitStatus.TO_DELIVER, actor);
  await addProof(d.id, "local:test/photo.jpg", "delivery", actor);
  return completeDelivery(d.id, {}, actor);
}

// 1–5, 12: receiving ────────────────────────────────────────────────────────────────────────────
{
  const p = await createProduct({ name: "Grill A", sku: "A", initialQty: 10, initialUnitCost: 50 });
  const eta = new Date("2026-10-05T12:00:00Z");
  const id = await importation([{ productId: p.id, quantity: 10, purchaseUnitCost: 100 }], { expectedDate: eta });

  // 3. No photo (the upload failed): nothing happens.
  await rejects(() => receive(id, "2026-10-10", []), /photo/);
  assert.equal((await product(p.id)).physicalQty, 10);
  // Its expected date passed: delayed, never received just because of that.
  assert.equal((await db.importation.findUniqueOrThrow({ where: { id } })).status, ImportStatus.DELAYED);
  // …and a status change can't skip the photo.
  await rejects(() => setImportStatus(id, ImportStatus.COMPLETED, ME), /photo/);
  assert.equal(ownedProofUrl(PHOTO, "import-x"), true);
  assert.equal(ownedProofUrl("https://evil.example.com/proofs/import-x/a.jpg", "import-x"), false);
  assert.equal(ownedProofUrl("https://s.public.blob.vercel-storage.com/proofs/import-y/a.jpg", "import-x"), false);

  // 1, 2, 15. Received (twice at once, then again): units added once.
  await Promise.all([receive(id), receive(id)]);
  await receive(id);
  const a = await product(p.id);
  assert.deepEqual([a.physicalQty, a.avgCost, a.cifCost], [20, 75, 100]);
  assert.equal(await count(p.id, TransactionType.IMPORTATION), 1);
  const imp = await db.importation.findUniqueOrThrow({ where: { id }, include: { proofs: true } });
  // 4, 5. The expected date stays; the arrival day is its own field and dates the units.
  assert.equal(imp.expectedDate?.toISOString(), eta.toISOString());
  assert.equal(imp.receivedAt?.toISOString(), "2026-10-10T12:00:00.000Z");
  assert.equal(imp.proofs.length, 1);
  const receipt = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: p.id, type: TransactionType.IMPORTATION } });
  assert.equal(receipt.occurredAt.toISOString(), "2026-10-10T12:00:00.000Z");
  assert.equal(receipt.userId, ME);

  // 12. A completed importation can't be edited; reopening is an explicit reversal kept in history.
  await rejects(() => upsertImportation({ id, lines: [{ productId: p.id, quantity: 99, purchaseUnitCost: 1 }], userId: ME }), /cannot be edited/);
  await setImportStatus(id, ImportStatus.IN_TRANSIT, ME);
  await setImportStatus(id, ImportStatus.IN_TRANSIT, ME);
  const reopened = await db.importation.findUniqueOrThrow({ where: { id } });
  assert.equal(reopened.receivedAt, null);
  assert.equal(reopened.expectedDate?.toISOString(), eta.toISOString());
  assert.deepEqual(Object.values(await product(p.id)).length > 0 && [(await product(p.id)).physicalQty, (await product(p.id)).avgCost], [10, 50]);
  assert.equal(await count(p.id, TransactionType.IMPORTATION), 2, "receipt and its reversal both kept");

  // Corrected freight, received again: average from the real costs (10×50 + 10×110) / 20.
  await upsertImportation({ id, lines: [{ productId: p.id, quantity: 10, purchaseUnitCost: 100 }], freight: 100, expectedDate: eta, userId: ME });
  await receive(id, "2026-10-11");
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).avgCost], [20, 80]);

  // Once units moved, reopening refuses instead of guessing.
  await changeQuantity({ productId: p.id, mode: "remove", quantity: 1, reason: "Correction", userId: ME });
  await rejects(() => setImportStatus(id, ImportStatus.PENDING, ME), /has moved since/);
  await rejects(() => importation([{ productId: p.id, quantity: -3, purchaseUnitCost: 1 }]), /quantity above 0/);
  await invariants();
}

// Historical importations: cost only, no photo needed ────────────────────────────────────────────
{
  const p = await createProduct({ name: "Burner B", sku: "B", initialQty: 5 });
  const h1 = await importation([{ productId: p.id, quantity: 4, purchaseUnitCost: 20 }], { historical: true });
  const h2 = await importation([{ productId: p.id, quantity: 6, purchaseUnitCost: 30 }], { historical: true });
  await receive(h1, "2025-03-01", []);
  await setImportStatus(h2, ImportStatus.COMPLETED, ME);
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).avgCost], [5, 26]);
  await setImportStatus(h2, ImportStatus.PENDING, ME);
  assert.equal((await product(p.id)).avgCost, 20);
  await invariants();
}

// Quantity and cost corrections stay apart ────────────────────────────────────────────────────────
{
  const p = await createProduct({ name: "Door C", sku: "C", initialQty: 4, initialUnitCost: 10 });
  await changeQuantity({ productId: p.id, mode: "add", quantity: 2, reason: "Correction", userId: ME, requestId: "r1" });
  await changeQuantity({ productId: p.id, mode: "add", quantity: 2, reason: "Correction", userId: ME, requestId: "r1" });
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).avgCost], [6, 10]);
  await adjustCost({ productId: p.id, avgCost: 12.5, reason: "Supplier invoice", userId: ME });
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).avgCost], [6, 12.5]);
  await rejects(() => changeQuantity({ productId: p.id, mode: "add", quantity: Number.NaN, reason: "x", userId: ME }), /greater than 0/);
  await invariants();
}

// 6–9, 12, 14, 15: deliveries ──────────────────────────────────────────────────────────────────────
{
  const p = await createProduct({ name: "Grill D", sku: "D", initialQty: 3, initialUnitCost: 10 });
  const q = await createProduct({ name: "Cover E", sku: "E", initialQty: 5, initialUnitCost: 2 });

  // The invoice asks for more than there is: it can't enter the workflow.
  await ingestInvoice(qbInvoice("1", [{ line: "1", sku: "D", name: "Grill D", qty: 4 }], 1));
  const big = await db.order.findUniqueOrThrow({ where: { externalRef: "D1" } });
  await rejects(() => addToWorkflow(big.id, actor), /Not enough stock.*needs 4, 3 available/);

  // 8, 9. Reserving, then cancelling before anything left: only the reservation moves.
  await ingestInvoice(qbInvoice("1", [{ line: "1", sku: "D", name: "Grill D", qty: 2 }], 2));
  await Promise.all([addToWorkflow(big.id, actor), addToWorkflow(big.id, actor)]);
  assert.deepEqual([(await product(p.id)).reservedQty, (await product(p.id)).physicalQty], [2, 3]);
  await removeFromWorkflow(big.id, actor);
  assert.deepEqual([(await product(p.id)).reservedQty, (await product(p.id)).physicalQty], [0, 3]);
  assert.equal(await db.inventoryTransaction.count({ where: { productId: p.id, quantity: { gt: 0 }, type: { not: TransactionType.RECEIVED } } }), 0);

  // 6, 7, 15. Completed (twice at once, then again): units leave once.
  await addToWorkflow(big.id, actor);
  const order = await db.order.findUniqueOrThrow({ where: { id: big.id }, include: { deliveries: true } });
  const d = order.deliveries[0]!;
  await rejects(() => completeDelivery(d.id, {}, actor), /Preparation|processing/);
  await setPrepared(d.id, Object.fromEntries((await db.deliveryLine.findMany({ where: { deliveryId: d.id } })).map((l) => [l.id, l.qty])), actor);
  await moveDelivery(d.id, ExitStatus.TO_DELIVER, actor);
  // The photo didn't upload: it can't be completed, and nothing leaves.
  await rejects(() => completeDelivery(d.id, {}, actor), /photo/);
  assert.equal((await product(p.id)).physicalQty, 3);
  await addProof(d.id, "local:test/photo.jpg", "delivery", actor);
  await Promise.all([completeDelivery(d.id, {}, actor), completeDelivery(d.id, {}, actor)]);
  await completeDelivery(d.id, {}, actor);
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).reservedQty], [1, 0]);
  assert.equal(await count(p.id, TransactionType.SOLD), 1);
  // 12. A completed delivery can't be reopened or moved; nothing leaves again.
  await rejects(() => moveDelivery(d.id, ExitStatus.PREPARING, actor), /already completed/);
  await rejects(() => removeFromWorkflow(big.id, actor), /already left/);

  // 14. A failure halfway (the second product falls short) leaves everything as it was.
  await ingestInvoice(qbInvoice("2", [{ line: "1", sku: "E", name: "Cover E", qty: 2 }, { line: "2", sku: "D", name: "Grill D", qty: 1 }], 1));
  const two = await db.order.findUniqueOrThrow({ where: { externalRef: "D2" } });
  await addToWorkflow(two.id, actor);
  await db.product.update({ where: { id: p.id }, data: { physicalQty: 0 } }); // damaged data, for the test
  await rejects(() => deliverAll(two.id), /Insufficient/);
  assert.equal((await product(q.id)).physicalQty, 5, "first product untouched");
  assert.notEqual((await db.delivery.findFirstOrThrow({ where: { orderId: two.id } })).status, ExitStatus.COMPLETED);
  await db.product.update({ where: { id: p.id }, data: { physicalQty: 1 } });
  await completeDelivery((await db.delivery.findFirstOrThrow({ where: { orderId: two.id } })).id, {}, actor);
  await invariants();
}

// 10, 11: QuickBooks changes after delivery, and returns ───────────────────────────────────────────
{
  const p = await createProduct({ name: "Smoker F", sku: "F", initialQty: 10, initialUnitCost: 40 });
  await ingestInvoice(qbInvoice("3", [{ line: "1", sku: "F", name: "Smoker F", qty: 3 }], 1));
  const o = await db.order.findUniqueOrThrow({ where: { externalRef: "D3" } });
  await addToWorkflow(o.id, actor);
  await deliverAll(o.id);
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).reservedQty], [7, 0]);

  // QuickBooks adds 2: the invoice follows, and a new delivery reserves them. No stock moves.
  await ingestInvoice(qbInvoice("3", [{ line: "1", sku: "F", name: "Smoker F", qty: 5 }], 2));
  let line = await db.orderLine.findFirstOrThrow({ where: { orderId: o.id } });
  assert.deepEqual([line.orderedQty, line.deliveredQty, line.reservedQty], [5, 3, 2]);
  assert.equal(await db.delivery.count({ where: { orderId: o.id } }), 2);
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).reservedQty], [7, 2]);

  // QuickBooks lowers it to 1: the open delivery goes, 2 delivered units await a return.
  await ingestInvoice(qbInvoice("3", [{ line: "1", sku: "F", name: "Smoker F", qty: 1 }], 3));
  line = await db.orderLine.findFirstOrThrow({ where: { orderId: o.id } });
  assert.deepEqual([line.orderedQty, line.deliveredQty, line.reservedQty], [1, 3, 0]);
  assert.equal(await db.delivery.count({ where: { orderId: o.id } }), 1);
  assert.equal((await product(p.id)).physicalQty, 7, "a lower invoice doesn't bring units back by itself");
  assert.match((await db.order.findUniqueOrThrow({ where: { id: o.id } })).issues ?? "", /Awaiting return: Smoker F, 2/);

  // 11. One comes back damaged: on hand, not available. One comes back good: available.
  await recordReturn(o.id, { lines: { [line.id]: 1 }, condition: "damaged", reason: "Dented lid", date: "2026-10-16", requestId: "ret-1" }, actor);
  await recordReturn(o.id, { lines: { [line.id]: 1 }, condition: "damaged", reason: "Dented lid", date: "2026-10-16", requestId: "ret-1" }, actor); // retry
  let f = await product(p.id);
  assert.deepEqual([f.physicalQty, f.unavailableQty, f.availableQty, f.avgCost], [8, 1, 7, 40]);
  await recordReturn(o.id, { lines: { [line.id]: 1 }, condition: "good", reason: "Wrong model", date: "2026-10-16" }, actor);
  f = await product(p.id);
  assert.deepEqual([f.physicalQty, f.unavailableQty, f.availableQty], [9, 1, 8]);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).issues, null, "nothing awaits a return any more");
  // 10. Returns can't exceed what the customer kept.
  await rejects(() => recordReturn(o.id, { lines: { [line.id]: 2 }, condition: "good", reason: "x", date: "2026-10-16" }, actor), /between 0 and 1/);
  const ret = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: p.id, type: TransactionType.RETURNED } });
  assert.deepEqual([ret.userId, ret.occurredAt.toISOString(), JSON.parse(ret.metadata!).orderLineId], [ME, "2026-10-16T12:00:00.000Z", line.id]);

  // The set-aside unit: a normal removal can't take it; release or write off can.
  await rejects(() => changeQuantity({ productId: p.id, mode: "remove", quantity: 9, reason: "Correction", userId: ME }), /set aside/);
  await resolveSetAside({ productId: p.id, mode: "write-off", quantity: 1, reason: "Scrapped", userId: ME });
  f = await product(p.id);
  assert.deepEqual([f.physicalQty, f.unavailableQty, f.availableQty], [8, 0, 8]);
  await rejects(() => resolveSetAside({ productId: p.id, mode: "release", quantity: 1, reason: "x", userId: ME }), /set aside/);

  // Voided after delivery: the invoice follows (voided, line at 0), stock stays, the unit awaits a return.
  await ingestInvoice(qbInvoice("3", [], 4, { status: "Voided" }));
  const voided = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { lines: true } });
  assert.equal(voided.voided, true);
  assert.deepEqual(voided.lines.map((l) => [l.orderedQty, l.deliveredQty, l.returnedQty]), [[0, 3, 2]]);
  assert.match(voided.issues ?? "", /Awaiting return: Smoker F, 1/);
  assert.equal((await product(p.id)).physicalQty, 8);
  await invariants();
}

// Same item on two invoice lines ─────────────────────────────────────────────────────────────────
{
  const row = (id: string, productId: string, qbLineId: string | null) => ({ id, productId, qbLineId, orderedQty: 1, reservedQty: 0, unitPrice: 0, deliveredQty: 0 });
  const line = (productId: string, lineId?: string) => ({ productId, lineId, quantity: 1, unitPrice: 0, physical: true });
  const { pairs, leftovers } = pairLines([row("a", "P", "1"), row("b", "P", "2"), row("c", "Q", null)], [line("P", "2"), line("P", "1"), line("Q", "9")]);
  assert.deepEqual(pairs.map((p) => p.current?.id), ["b", "a", "c"]);
  assert.equal(leftovers.length, 0);

  const g = await createProduct({ name: "Grill G", sku: "G", initialQty: 5, initialUnitCost: 1 });
  await ingestInvoice(qbInvoice("4", [{ line: "1", sku: "G", name: "Grill G", qty: 2 }, { line: "2", sku: "G", name: "Grill G", qty: 2 }], 1));
  const o = await db.order.findUniqueOrThrow({ where: { externalRef: "D4" } });
  await addToWorkflow(o.id, actor);
  await ingestInvoice(qbInvoice("4", [{ line: "1", sku: "G", name: "Grill G", qty: 2 }], 2));
  await ingestInvoice(qbInvoice("4", [{ line: "1", sku: "G", name: "Grill G", qty: 2 }], 2)); // same version: skipped
  const lines = await db.orderLine.findMany({ where: { orderId: o.id } });
  assert.deepEqual(lines.map((l) => [l.qbLineId, l.orderedQty, l.reservedQty]), [["1", 2, 2]]);
  assert.equal((await product(g.id)).reservedQty, 2);
  await invariants();
}

// Phase 3: costs ───────────────────────────────────────────────────────────────────────────────────
{
  const avg = async (id: string) => (await product(id)).avgCost;

  // 1, 2, 3. Two historical lots: 13.33 on the units counted; none added, and twice is once.
  const h = await createProduct({ name: "Lot H", sku: "H", initialQty: 40 });
  const a = await importation([{ productId: h.id, quantity: 100, purchaseUnitCost: 10 }], { historical: true });
  const b = await importation([{ productId: h.id, quantity: 200, purchaseUnitCost: 15 }], { historical: true });
  await receive(a, "2025-01-10", []);
  await Promise.all([receive(b, "2025-06-10", []), receive(b, "2025-06-10", [])]);
  await setImportStatus(b, ImportStatus.COMPLETED, ME);
  assert.equal((await product(h.id)).physicalQty, 40, "historical lots add no units");
  assert.equal(await avg(h.id), 13.3333);
  assert.equal(await db.inventoryTransaction.count({ where: { productId: h.id, type: TransactionType.COST_ADJUSTMENT } }), 2, "one cost basis per lot");
  assert.equal(await count(h.id, TransactionType.IMPORTATION), 0);

  // 4. Historical and current together: the basis weighs every received lot; a later normal
  // receipt moves the average from that basis (moving average), adding its own units.
  const n = await importation([{ productId: h.id, quantity: 10, purchaseUnitCost: 30 }]);
  await receive(n, "2026-10-20");
  // 40 units at 13.3333 (533.33) + 10 at 30 → 50 units, 833.33 → 16.67
  assert.deepEqual([(await product(h.id)).physicalQty, roundTo(await avg(h.id), 2)], [50, 16.67]);

  // 13. Correcting a historical lot recomputes the basis from all lots, with no units.
  await reviseImportation(a, { lines: [{ id: (await db.importationLine.findFirstOrThrow({ where: { importationId: a } })).id, purchaseUnitCost: 13 }], reason: "Supplier invoice" }, actor);
  // (100·13 + 200·15 + 10·30) / 310 = 14.84 on 50 units
  assert.deepEqual([(await product(h.id)).physicalQty, roundTo(await avg(h.id), 2)], [50, 14.84]);

  // 8, 9. Tax stays on its own line; what's stored is what the shared formula gives the screen.
  const t = await createProduct({ name: "Taxed T", sku: "T" });
  const u = await createProduct({ name: "Untaxed U", sku: "U" });
  const ti = await importation(
    [
      { productId: t.id, quantity: 10, purchaseUnitCost: 100, taxRate: 25 },
      { productId: u.id, quantity: 10, purchaseUnitCost: 100 },
    ],
    { duties: 200 },
  );
  await receive(ti, "2026-10-20");
  const stored = await db.importationLine.findMany({ where: { importationId: ti }, orderBy: { landedUnitCost: "desc" } });
  assert.deepEqual(stored.map((l) => [l.taxRate, l.landedUnitCost]), [[25, 135], [0, 110]]);
  assert.equal((await db.importation.findUniqueOrThrow({ where: { id: ti } })).coefficient, 1.225);
  assert.deepEqual([(await product(t.id)).cifCost, (await product(t.id)).fobCost, await avg(t.id)], [135, 100, 135]);

  // 7, 11. A received importation's costs change (main user): no units move, the change is
  // logged with before and after, CIF follows, and sending it again changes nothing.
  const line = stored[0]!;
  const revised = () => reviseImportation(ti, { costs: { freight: 100.5 }, lines: [{ id: line.id, purchaseUnitCost: 110.25 }], reason: "Freight invoice arrived" }, actor);
  await revised();
  await revised();
  assert.deepEqual([(await product(t.id)).physicalQty, (await product(u.id)).physicalQty], [10, 10]);
  assert.equal(await count(t.id, TransactionType.IMPORTATION), 1, "no second receipt");
  const events = await db.importationEvent.findMany({ where: { importationId: ti } });
  assert.equal(events.length, 1);
  const meta = JSON.parse(events[0]!.meta!);
  assert.deepEqual([meta.reason, meta.before.costs.freight, meta.after.costs.freight, meta.before.lines[line.id].cost, meta.after.lines[line.id].cost], ["Freight invoice arrived", 0, 100.5, 100, 110.25]);
  const tLine = await db.importationLine.findUniqueOrThrow({ where: { id: line.id } });
  assert.equal((await product(t.id)).cifCost, tLine.landedUnitCost, "CIF follows the latest received lot");
  assert.equal(await avg(t.id), tLine.landedUnitCost, "only lot of the product: its CIF is the average");
  await rejects(() => reviseImportation(ti, { costs: { freight: -1 }, reason: "x" }, actor), /0 or more/);
  await rejects(() => reviseImportation(a + "x", { reason: "x" }, actor), /./);

  // 5, 6, 10, 11. FOB correction: only FOB, cents kept, logged before → after; again is nothing.
  const before = await product(t.id);
  await correctFob({ productId: t.id, fobCost: 99.99, reason: "Supplier price list", userId: ME });
  await correctFob({ productId: t.id, fobCost: 99.99, reason: "Supplier price list", userId: ME });
  const after = await product(t.id);
  assert.deepEqual([after.fobCost, after.physicalQty, after.avgCost, after.cifCost], [99.99, before.physicalQty, before.avgCost, before.cifCost]);
  const fobLog = await db.inventoryTransaction.findMany({ where: { productId: t.id, metadata: { contains: '"field":"fobCost"' } } });
  assert.equal(fobLog.length, 1);
  assert.deepEqual([fobLog[0]!.quantity, fobLog[0]!.userId, JSON.parse(fobLog[0]!.metadata!).before.fobCost, JSON.parse(fobLog[0]!.metadata!).after.fobCost, JSON.parse(fobLog[0]!.metadata!).reason], [0, ME, before.fobCost, 99.99, "Supplier price list"]);
  await rejects(() => correctFob({ productId: t.id, fobCost: Number.NaN, reason: "x", userId: ME }), /0 or more/);

  // 14. No importations: nothing makes an average up. FOB doesn't become a cost.
  const z = await createProduct({ name: "Unknown Z", sku: "Z", initialQty: 3 });
  await correctFob({ productId: z.id, fobCost: 50, reason: "Price list", userId: ME });
  assert.deepEqual([(await product(z.id)).avgCost, (await product(z.id)).inventoryValue], [0, 0]);
  await invariants();
}

// Hotfix ─────────────────────────────────────────────────────────────────────────────────────────
{
  const MAIN = { id: ME, name: "Tester", main: true };
  const CLERK = { id: "clerk", name: "Clerk", main: false };

  // Quantity corrections record no price and leave every cost alone; the stock value follows.
  const q = await createProduct({ name: "Qty Q", sku: "Q", initialQty: 4, initialUnitCost: 25 });
  await db.product.update({ where: { id: q.id }, data: { fobCost: 20, cifCost: 25, lastSoldPrice: 99 } });
  await changeQuantity({ productId: q.id, mode: "add", quantity: 2, reason: "Correction", userId: ME });
  await changeQuantity({ productId: q.id, mode: "remove", quantity: 1, reason: "Correction", userId: ME, occurredAt: new Date("2026-10-01T12:00:00Z") });
  let p = await product(q.id);
  assert.deepEqual([p.physicalQty, p.avgCost, p.fobCost, p.cifCost, p.lastSoldPrice, p.inventoryValue], [5, 25, 20, 25, 99, 125]);
  const corrections = await db.inventoryTransaction.findMany({ where: { productId: q.id, type: TransactionType.ADJUSTMENT }, orderBy: { occurredAt: "asc" } });
  assert.deepEqual(corrections.map((t) => [t.quantity, t.unitCost, t.totalValue]), [[-1, 0, 0], [2, 0, 0]]);
  assert.equal(corrections[0]!.occurredAt.toISOString(), "2026-10-01T12:00:00.000Z", "an entry added after the fact keeps its date");
  assert.equal(await db.costHistory.count({ where: { productId: q.id, eventType: { not: "RECEIVED" } } }), 0);

  // Log edits: anyone with stock access edits the note; date, units and removal are the main
  // user's, through linked entries that keep the balance exact and the change on record.
  const added = corrections[1]!;
  await editLogEntry({ id: added.id, notes: "Found in the back", reason: "Clearer note" }, CLERK);
  await rejects(() => editLogEntry({ id: added.id, quantity: 5, reason: "Counted again" }, CLERK), /main user/);
  await editLogEntry({ id: added.id, quantity: 5, reason: "Counted again" }, MAIN);
  await editLogEntry({ id: added.id, quantity: 5, reason: "Counted again" }, MAIN); // same value: nothing
  p = await product(q.id);
  assert.equal(p.physicalQty, 8, "4 + 5 − 1");
  const edited = await db.inventoryTransaction.findUniqueOrThrow({ where: { id: added.id } });
  const history = JSON.parse(edited.metadata!).edits;
  assert.deepEqual([edited.quantity, edited.notes, history.length, history[1].changes[0]], [2, "Found in the back", 2, { field: "quantity", before: 2, after: 5 }]);
  await rejects(() => editLogEntry({ id: added.id, quantity: -5, reason: "x" }, MAIN), /direction/);
  await rejects(() => removeLogEntry({ id: added.id, reason: "Wrong product" }, CLERK), /main user/);
  await removeLogEntry({ id: added.id, reason: "Wrong product" }, MAIN);
  await removeLogEntry({ id: added.id, reason: "Wrong product" }, MAIN); // again: nothing
  p = await product(q.id);
  assert.deepEqual([p.physicalQty, p.avgCost], [3, 25]);
  assert.ok(JSON.parse((await db.inventoryTransaction.findUniqueOrThrow({ where: { id: added.id } })).metadata!).removed);

  // Reopening a received importation is the main user's.
  const r = await importation([{ productId: q.id, quantity: 1, purchaseUnitCost: 25 }]);
  await receive(r);
  // Units and dates from an importation are corrected there, not from the log.
  const fromImport = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: q.id, type: TransactionType.IMPORTATION } });
  await rejects(() => editLogEntry({ id: fromImport.id, quantity: 9 }, MAIN), /Correct them there/);
  await rejects(() => editLogEntry({ id: fromImport.id, occurredAt: new Date("2026-10-01T12:00:00Z") }, MAIN), /Correct it there/);
  await rejects(() => setImportStatus(r, ImportStatus.IN_TRANSIT, "clerk", { canReopen: false }), /main user/);
  assert.equal((await db.importation.findUniqueOrThrow({ where: { id: r } })).status, ImportStatus.COMPLETED);
  await invariants();
}

// QuickBooks payloads as the API sends them: no SKU on lines, items by id, sub-item names.
{
  const qbReal = (id: string, doc: string, lines: { line: string; item: string; name: string; qty: number }[], minute: number, extra: object = {}) => ({
    Invoice: {
      Id: id,
      DocNumber: doc,
      TxnDate: "2026-10-15",
      Balance: 0,
      TotalAmt: lines.reduce((sum, l) => sum + l.qty * 100, 0),
      MetaData: { LastUpdatedTime: `2026-10-20T06:${String(minute).padStart(2, "0")}:00-07:00` },
      Line: [
        ...lines.map((l) => ({
          Id: l.line,
          LineNum: Number(l.line),
          Amount: l.qty * 100,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: { ItemRef: { value: l.item, name: l.name }, Qty: l.qty, UnitPrice: 100 },
        })),
        { Amount: 0, DetailType: "SubTotalLineDetail", SubTotalLineDetail: {} },
      ],
      ...extra,
    },
  });
  const hood = await createProduct({ name: "Hood Line 36\" - Single Motor", sku: "CH-H-HOO-36", code: "3", initialQty: 5, initialUnitCost: 10 });
  await db.product.update({ where: { id: hood.id }, data: { secondarySku: "qb:107" } });
  const hoodLine = { line: "5", item: "107", name: "Hood:3 - Hood Line 36\" - Single Motor", qty: 1 };
  const grillLine = { line: "1", item: "77", name: "Grill:38 - Grill GA01 4B (32'' NG) - Legend Line", qty: 1 };

  // 10. A line whose QuickBooks item has no product here: listed, and the invoice can't be ready.
  await ingestInvoice(qbReal("873", "1553", [hoodLine], 0));
  const o = await db.order.findUniqueOrThrow({ where: { externalRef: "1553" } });
  await addToWorkflow(o.id, actor);
  await ingestInvoice(qbReal("873", "1553", [grillLine, hoodLine], 16));
  let order = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { lines: true, deliveries: { include: { lines: true } } } });
  assert.match(order.issues ?? "", /Unmatched product: Grill:38 - Grill GA01 4B \(32'' NG\) - Legend Line \(qty 1, QuickBooks item 77\)/);
  assert.equal(order.lines.length, 1);
  const d = (await db.delivery.findFirstOrThrow({ where: { orderId: o.id }, include: { lines: true } }));
  await setPrepared(d.id, Object.fromEntries(d.lines.map((l) => [l.id, l.qty])), actor);
  await rejects(() => moveDelivery(d.id, ExitStatus.TO_DELIVER, actor), /no product here/);

  // The QuickBooks name carries the product's ID after its category: "Grill:38 - …" finds ID 38.
  const grill = await createProduct({ name: "Grill Legend 4 (32'') - NG", sku: "CH-G-LEG4-NG", code: "38", initialQty: 4, initialUnitCost: 900 });
  // 9, 11. Once it matches, the next QuickBooks version brings it in once, reserved, on the open delivery.
  await ingestInvoice(qbReal("873", "1553", [grillLine, hoodLine], 17));
  await ingestInvoice(qbReal("873", "1553", [grillLine, hoodLine], 17)); // same version again
  await ingestInvoice(qbReal("873", "1553", [grillLine, hoodLine], 18)); // a later sync, nothing changed
  order = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { lines: true, deliveries: { include: { lines: true } } } });
  assert.equal(order.issues, null);
  assert.deepEqual(order.lines.map((l) => [l.productId, l.qbLineId, l.orderedQty, l.reservedQty]).sort(), [[grill.id, "1", 1, 1], [hood.id, "5", 1, 1]].sort());
  assert.equal(order.deliveries.length, 1);
  assert.equal(order.deliveries[0]!.lines.length, 2, "the grill joins the open delivery once");
  assert.equal((await product(grill.id)).reservedQty, 1);

  // 8. Voided in QuickBooks (private note "Voided", zeroed lines) before it went out: off the board.
  await ingestInvoice(qbReal("873", "1553", [{ ...grillLine, qty: 0 }, { ...hoodLine, qty: 0 }], 19, { PrivateNote: "Voided", TotalAmt: 0 }));
  order = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { lines: true, deliveries: { include: { lines: true } } } });
  assert.deepEqual([order.voided, order.onKanban, order.deliveries.length, order.lines.length], [true, false, 0, 0]);
  assert.deepEqual([(await product(grill.id)).reservedQty, (await product(hood.id)).reservedQty, (await product(grill.id)).physicalQty], [0, 0, 4]);

  // An invoice voided before voids were read: same version, still open here. The void alone brings it back once.
  await ingestInvoice(qbReal("829", "1539", [hoodLine], 30));
  const stuck = await db.order.findUniqueOrThrow({ where: { externalRef: "1539" } });
  await ingestInvoice(qbReal("829", "1539", [{ ...hoodLine, qty: 0 }], 30, { PrivateNote: "Voided", TotalAmt: 0 }));
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: stuck.id } })).voided, true);
  await invariants();
}

// Corrections without a typed reason: still recorded with who, when, before and after.
{
  const MAIN = { id: ME, name: "Tester", main: true };
  const p = await createProduct({ name: "Audit P", sku: "AP", initialQty: 6, initialUnitCost: 10 });
  await adjustCost({ productId: p.id, avgCost: 12, userId: ME });
  const cost = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: p.id, type: TransactionType.COST_ADJUSTMENT } });
  const costMeta = JSON.parse(cost.metadata!);
  assert.deepEqual([cost.userId, costMeta.before.avgCost, costMeta.after.avgCost, costMeta.reason], [ME, 10, 12, undefined]);
  assert.deepEqual([(await product(p.id)).physicalQty, (await product(p.id)).fobCost, (await product(p.id)).cifCost], [6, 10, 10]);

  // Initial stock counts as a manual entry: its units are corrected from the log.
  const initial = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: p.id, reference: "INITIAL" } });
  await editLogEntry({ id: initial.id, quantity: 5 }, MAIN);
  assert.equal((await product(p.id)).physicalQty, 5);
  const audit = JSON.parse((await db.inventoryTransaction.findUniqueOrThrow({ where: { id: initial.id } })).metadata!).edits[0];
  assert.deepEqual([audit.by, audit.changes[0], audit.reason], ["Tester", { field: "quantity", before: 6, after: 5 }, undefined]);

  // A reservation's log entry: its date can be corrected (it moves nothing); its units follow the invoice.
  await ingestInvoice({
    Invoice: {
      Id: "77001",
      DocNumber: "1549",
      TxnDate: "2026-10-14",
      Balance: 0,
      TotalAmt: 100,
      MetaData: { LastUpdatedTime: "2026-10-14T10:00:00-07:00" },
      Line: [{ Id: "1", DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "1", name: "Audit P" }, Qty: 1, UnitPrice: 100 } }],
    },
  });
  const o = await db.order.findUniqueOrThrow({ where: { externalRef: "1549" } });
  await addToWorkflow(o.id, actor);
  const reserved = await db.inventoryTransaction.findFirstOrThrow({ where: { productId: p.id, type: TransactionType.RESERVED } });
  await editLogEntry({ id: reserved.id, occurredAt: new Date("2026-10-14T12:00:00Z") }, MAIN);
  assert.equal((await db.inventoryTransaction.findUniqueOrThrow({ where: { id: reserved.id } })).occurredAt.toISOString(), "2026-10-14T12:00:00.000Z");
  await rejects(() => editLogEntry({ id: reserved.id, quantity: 3 }, MAIN), /Correct them there/);
  assert.equal((await product(p.id)).reservedQty, 1, "the reservation still follows the invoice");

  // Removing without a reason: the entry is marked removed with who and when; its units come back.
  const added = await changeQuantity({ productId: p.id, mode: "add", quantity: 2, reason: "Correction", userId: ME });
  await removeLogEntry({ id: added.id }, MAIN);
  assert.equal((await product(p.id)).physicalQty, 5);
  assert.equal(JSON.parse((await db.inventoryTransaction.findUniqueOrThrow({ where: { id: added.id } })).metadata!).removed.by, "Tester");
  await invariants();
}

await db.$disconnect();
console.log("stock.test: ok");
