import assert from "node:assert/strict";
import { quickBooksName, splitName } from "../photos/name";
import { parseQbInvoice } from "./ingest";
import { readAuthCode } from "./qbo";
import { changedFields } from "./sync";

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

console.log("invoice parse ok");
