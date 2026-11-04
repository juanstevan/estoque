import assert from "node:assert/strict";
import { quickBooksName, splitName } from "../photos/name";
import { isVoidedNote, parseQbInvoice } from "./ingest";
import { readAuthCode } from "./qbo";
import { changedFields, planPush } from "./sync";

assert.deepEqual(readAuthCode(" https://x.m.pipedream.net/?code=AB12&state=estoque&realmId=9341 "), { code: "AB12", realmId: "9341" });
assert.deepEqual(readAuthCode("code=AB12&realmId=9341"), { code: "AB12", realmId: "9341" });
assert.deepEqual(readAuthCode("AB12"), { code: "AB12", realmId: "" });

assert.equal(quickBooksName("23C", "Door Double 26"), "23C - Door Double 26");
assert.equal(quickBooksName("23C", "x".repeat(200)).length, 100);

// A name is category + family + variant; stored ones win only while the name starts with them.
assert.deepEqual(splitName("Burner Power 16 NG", "Burners", null), { category: "Burner", model: "Power", variation: "16 NG" });
assert.deepEqual(splitName("Burner Power 16 NG", "Grill", "Legend"), { category: "Burner", model: "Power", variation: "16 NG" });
assert.deepEqual(splitName("Side Burner Power 16", "Side Burner", "Power"), { category: "Side Burner", model: "Power", variation: "16" });
assert.deepEqual(splitName("Grill Legend5 LP", "Grill", "Legend"), { category: "Grill", model: "Legend5", variation: "LP" });
// A QuickBooks rename brings its category and family along.
const seen = (name: string) => ({ name, sku: "", price: 0 });
const burner = { code: "132", name: "Grill Old 16 NG", sku: "S", b2bPrice: 0, category: "Grill", model: "Old" };
assert.deepEqual(changedFields(seen("132 - Burner Power 16 NG"), seen("x"), burner, new Set(), new Set()), {
  name: "Burner Power 16 NG",
  category: "Burner",
  model: "Power",
});
const side = { ...burner, name: "Side Burner Power 16", category: "Side Burner", model: "Power" };
assert.deepEqual(changedFields(seen("Side Burner Power 18"), seen("x"), side, new Set(), new Set()), { name: "Side Burner Power 18" });

const estimate = parseQbInvoice({ Estimate: { Id: "1", DocNumber: "E-1" } });
assert.equal(estimate?.rejected, "estimate");

const invoice = parseQbInvoice({
  Invoice: {
    Id: "9",
    DocNumber: "1009",
    TxnDate: "2026-01-02",
    CustomerRef: { name: "Ada" },
    TotalAmt: 10,
    Line: [{ DetailType: "SalesItemLineDetail", SalesItemLineDetail: { Qty: 1, ItemRef: { name: "Grill" } } }],
  },
});
assert.equal(invoice?.docNumber, "1009");
assert.equal(invoice?.rejected, undefined);
assert.equal(invoice?.lines.length, 1);

// QuickBooks voids an invoice by zeroing it and adding "Voided" to the private note.
const voided = parseQbInvoice({
  Invoice: { Id: "829", DocNumber: "1539", TxnDate: "2026-10-06", TotalAmt: 0, Balance: 0, PrivateNote: "Voided", Line: [] },
});
assert.equal(voided?.voided, true);
assert.equal(isVoidedNote("Call before delivery Voided"), true, "appended to an existing note");
assert.equal(isVoidedNote("Voided  "), true);
assert.equal(isVoidedNote("Voided check was replaced last week"), false, "the word alone in a note isn't a void");
assert.equal(isVoidedNote(undefined), false);
assert.equal(parseQbInvoice({ Invoice: { Id: "1", DocNumber: "2", PrivateNote: "Gate code 12" } })?.voided, false);
// Lines keep QuickBooks' item id and line id; there's no SKU on an invoice line.
const real = parseQbInvoice({
  Invoice: {
    Id: "873",
    DocNumber: "1553",
    Line: [
      { Id: "1", LineNum: 1, Amount: 1580, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "77", name: "Grill:38 - Grill GA01 4B (32'' NG) - Legend Line" }, Qty: 1, UnitPrice: 1580 } },
      { Amount: 1580, DetailType: "SubTotalLineDetail", SubTotalLineDetail: {} },
    ],
  },
});
assert.deepEqual(real?.lines, [{ lineId: "1", sku: undefined, quantity: 1, itemId: "77", name: "Grill:38 - Grill GA01 4B (32'' NG) - Legend Line", unitPrice: 1580 }]);

// App → QuickBooks: app names win, QuickBooks shows physical − reserved, new products get an item
// with the accounts of their category, a stand-in SKU ("QB-7") isn't a difference.
{
  const base = { b2bPrice: 0, avgCost: 0, model: null, physicalQty: 0, reservedQty: 0 };
  const acc = { IncomeAccountRef: { value: "1" }, ExpenseAccountRef: { value: "2" }, AssetAccountRef: { value: "3" } };
  const items = [
    { Id: "7", Name: "Door old name", Sku: "", Type: "Inventory", TrackQtyOnHand: true, QtyOnHand: 1, ...acc },
    { Id: "8", Name: "12 - Grill", Sku: "G", Type: "Inventory", TrackQtyOnHand: true, QtyOnHand: 3, ...acc, AssetAccountRef: { value: "9" } },
    { Id: "9", Name: "Loose", Sku: "L", Type: "Inventory", TrackQtyOnHand: true, QtyOnHand: 0, ...acc },
  ];
  const plan = planPush(
    [
      { ...base, id: "a", code: "11", name: "Door New", sku: "QB-7", secondarySku: "qb:7", category: "Door", physicalQty: 5, reservedQty: 2 },
      { ...base, id: "b", code: "12", name: "Grill", sku: "G", secondarySku: "qb:8", category: "Grill", physicalQty: 3 },
      { ...base, id: "c", code: "13", name: "Grill Two", sku: "G2", secondarySku: null, category: "Grill", physicalQty: 4 },
      { ...base, id: "d", code: "14", name: "Loose", sku: "L", secondarySku: null, category: null, physicalQty: 2 },
    ],
    items,
  );
  assert.deepEqual(plan.update.map((u) => u.product.id), ["a", "d"]);
  assert.deepEqual(plan.adjust, [{ itemId: "7", diff: 2 }, { itemId: "9", diff: 2 }]);
  assert.deepEqual(plan.create.map((c) => [c.product.id, c.qty, c.template.AssetAccountRef?.value]), [["c", 4, "9"]]);
  assert.deepEqual(plan.link.map((l) => [l.product.id, l.item.Id]), [["d", "9"]]);
}

console.log("invoice parse ok");
