import assert from "node:assert/strict";
import { allocateAdditionalCosts, calcWeightedAverageCost, importCoefficient, readAmount, roundMoney } from "./math";

// Landed (CIF) cost: cost + this line's tax% + its share of the lot's costs, split by value.
const lines = allocateAdditionalCosts(
  [
    { id: "a", quantity: 10, purchaseUnitCost: 100, taxRate: 25 },
    { id: "b", quantity: 10, purchaseUnitCost: 100 },
  ],
  200,
);
assert.deepEqual(lines.map((l) => [l.tax, l.allocatedAdditionalCost, l.landedUnitCost]), [[250, 100, 135], [0, 100, 110]]);
assert.equal(importCoefficient(lines), 1.225); // (2000 + 250 + 200) / 2000
assert.equal(lines.reduce((s, l) => s + l.allocatedAdditionalCost, 0), 200, "shares add up to the lot's costs");
// Cents stay exact through the split.
const cents = allocateAdditionalCosts([{ id: "a", quantity: 3, purchaseUnitCost: 12.5 }, { id: "b", quantity: 7, purchaseUnitCost: 0.99 }], 120.75);
assert.equal(roundMoney(cents.reduce((s, l) => s + l.allocatedAdditionalCost, 0), 2), 120.75);
assert.equal(cents[0]!.purchaseValue, 37.5);
assert.equal(importCoefficient(allocateAdditionalCosts([], 0)), 1);

// The lots of the task: (100 × 10 + 200 × 15) ÷ 300 = 13.33.
assert.equal(roundMoney((100 * 10 + 200 * 15) / 300, 2), 13.33);
// Moving average on a normal receipt.
assert.equal(calcWeightedAverageCost({ existingQty: 10, existingValue: 500, incomingQty: 10, incomingUnitCost: 100 }).newAvgCost, 75);

// Typed amounts: numbers, cents, and simple sums; nothing else.
for (const [text, n] of [["12.50", 12.5], ["120.75", 120.75], ["0.99", 0.99], ["120+13", 133], ["120-13", 107], ["1,200.75", 1200.75], [".5", 0.5]] as const) {
  assert.equal(readAmount(text), n, text);
}
for (const text of ["", "2*3", "1/2", "abc", "120+", "1e9", "(1)"]) assert.equal(readAmount(text), null, text);

console.log("math ok");
