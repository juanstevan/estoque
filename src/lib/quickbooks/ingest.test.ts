import assert from "node:assert/strict";
import { quickBooksName } from "../photos/name";
import { parseQbInvoice } from "./ingest";
import { readAuthCode } from "./qbo";

assert.deepEqual(readAuthCode(" https://x.m.pipedream.net/?code=AB12&state=estoque&realmId=9341 "), { code: "AB12", realmId: "9341" });
assert.deepEqual(readAuthCode("code=AB12&realmId=9341"), { code: "AB12", realmId: "9341" });
assert.deepEqual(readAuthCode("AB12"), { code: "AB12", realmId: "" });

assert.equal(quickBooksName("23C", "Door Double 26"), "23C - Door Double 26");
assert.equal(quickBooksName("23C", "x".repeat(200)).length, 100);

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
