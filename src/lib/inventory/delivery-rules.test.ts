import assert from "node:assert/strict";
import {
  DEFAULT_PREFS,
  isPhysicalLine,
  matchScan,
  modeError,
  moveError,
  preparationDone,
  stageOf,
  stockShouldBeOut,
  workflowError,
  unmatchedError,
  unmatchedItems,
} from "./delivery-rules";

const products = [
  { id: "a", sku: "SKU1", ean: "00123", code: "12", secondarySku: null },
  { id: "b", sku: "SKU2", ean: null, code: "12", secondarySku: null },
];

assert.equal(matchScan("00123", products).productId, "a");
assert.match(matchScan("12", products).error ?? "", /more than one/);
assert.match(matchScan("nope", products).error ?? "", /No product/);
assert.equal(isPhysicalLine("Freight charge"), false);
assert.equal(isPhysicalLine("Grill Legend"), true);
assert.equal(preparationDone([{ qty: 2, preparedQty: 2 }]), true);
assert.equal(preparationDone([{ qty: 2, preparedQty: 1 }]), false);
assert.equal(preparationDone([]), true);
assert.equal(stageOf({ status: "DELAYED", priorStatus: "PREPARING" }), "PREPARING");

// Stock leaves at the chosen stage; collections have no "out for delivery".
assert.equal(stockShouldBeOut("completed", "DELIVERY", "IN_TRANSIT"), false);
assert.equal(stockShouldBeOut("completed", "DELIVERY", "COMPLETED"), true);
assert.equal(stockShouldBeOut("ready", "PICKUP", "TO_DELIVER"), true);
assert.equal(stockShouldBeOut("out", "DELIVERY", "TO_DELIVER"), false);
assert.equal(stockShouldBeOut("out", "DELIVERY", "IN_TRANSIT"), true);
assert.equal(stockShouldBeOut("out", "PICKUP", "TO_DELIVER"), false);

// Paid / unpaid rules.
const unpaid = { paymentStatus: "Open" };
const strict = { ...DEFAULT_PREFS, allowUnpaid: false, collectUnpaid: false };
assert.match(workflowError(unpaid, strict) ?? "", /Waiting for payment/);
assert.equal(workflowError(unpaid, { ...strict, collectUnpaid: true }), null);
assert.match(workflowError({ paymentStatus: "Paid" }, { ...DEFAULT_PREFS, allowPaid: false }) ?? "", /Paid invoices/);
assert.match(modeError(unpaid, { ...strict, collectUnpaid: true }, "DELIVERY") ?? "", /only be collected/);
assert.equal(modeError(unpaid, { ...strict, collectUnpaid: true }, "PICKUP"), null);
assert.equal(modeError(unpaid, DEFAULT_PREFS, "DELIVERY"), null);

// Moves.
const base = { mode: "DELIVERY", prepared: true, dispatched: false, stockedOut: false };
assert.equal(moveError({ ...base, from: "PREPARING", to: "TO_DELIVER" }), null);
assert.match(moveError({ ...base, prepared: false, from: "PREPARING", to: "TO_DELIVER" }) ?? "", /Preparation/);
assert.match(moveError({ ...base, mode: "PICKUP", from: "TO_DELIVER", to: "IN_TRANSIT" }) ?? "", /Collections/);
assert.match(moveError({ ...base, from: "PREPARING", to: "IN_TRANSIT" }) ?? "", /processing first/);
assert.match(moveError({ ...base, dispatched: true, from: "IN_TRANSIT", to: "PREPARING" }) ?? "", /already out/);
assert.match(moveError({ ...base, stockedOut: true, from: "TO_DELIVER", to: "PREPARING" }) ?? "", /left stock/);
assert.equal(moveError({ ...base, from: "TO_DELIVER", to: "PREPARING" }), null);
assert.match(moveError({ ...base, from: "TO_DELIVER", to: "COMPLETED" }) ?? "", /Complete delivery/);

// QuickBooks lines with no product here are listed and keep the invoice from looking complete.
const issues = "Unmatched product: Grill:38 - Grill GA01 (qty 1, QuickBooks item 77)\nService line not in inventory: Shipping";
assert.deepEqual(unmatchedItems(issues), ["Grill:38 - Grill GA01 (qty 1, QuickBooks item 77)"]);
assert.match(unmatchedError(issues) ?? "", /no product here/);
assert.equal(unmatchedError("Service line not in inventory: Shipping"), null);
assert.equal(unmatchedError(null), null);

console.log("delivery rules ok");
