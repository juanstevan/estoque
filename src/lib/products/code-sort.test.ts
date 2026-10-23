import assert from "node:assert/strict";
import { compareProductCodes } from "./code-sort";

const codes = ["23S", "8", "9", "18", "19", "20", "21", "100", "2", "A4", "A12"];

assert.deepEqual(
  [...codes].sort((a, b) => compareProductCodes(a, b, "desc")),
  ["100", "21", "20", "19", "18", "9", "8", "2", "A12", "A4", "23S"],
);
assert.deepEqual(
  [...codes].sort((a, b) => compareProductCodes(a, b, "asc")),
  ["2", "8", "9", "18", "19", "20", "21", "100", "23S", "A4", "A12"],
);
console.log("Product ID sorting passed");
