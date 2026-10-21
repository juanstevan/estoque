/**
 * Protected stock operations refuse people without the right access, on the server.
 * Run against a dev server on a throwaway database, with two session tokens:
 *   BASE=http://localhost:3100 OWNER=<token> VIEWER=<token with view-only roles> EDITOR=<token that can edit
 *   imports but isn't the main user> npx tsx scripts/permissions.test.mts
 */
import assert from "node:assert/strict";

const base = process.env.BASE ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(base)) throw new Error("Refusing: BASE must be a local dev server");
const tokens = { none: "", viewer: process.env.VIEWER ?? "", owner: process.env.OWNER ?? "", editor: process.env.EDITOR ?? "" };

const calls: Array<[string, object]> = [
  ["/api/adjustments", { productId: "x", mode: "add", quantity: 1, reason: "Correction" }],
  ["/api/adjustments", { productId: "x", mode: "cost", avgCost: 1, reason: "Correction" }],
  ["/api/adjustments", { productId: "x", mode: "write-off", quantity: 1, reason: "Correction" }],
  ["/api/adjustments", { productId: "x", mode: "fob", fobCost: 1, reason: "Correction" }],
  ["/api/importations", { action: "revise", id: "x", reason: "Correction", freight: 1 }],
  ["/api/importations", { action: "receive", id: "x", receivedAt: "2026-10-10", photos: [] }],
  ["/api/importations", { action: "status", id: "x", status: "COMPLETED" }],
  ["/api/importations", { action: "delete", id: "x" }],
  ["/api/importations", { lines: [{ quantity: 1, purchaseUnitCost: 1 }] }],
  ["/api/orders", { action: "add", orderId: "x" }],
  ["/api/orders", { action: "complete", deliveryId: "x" }],
  ["/api/orders", { action: "return", orderId: "x", lines: {}, condition: "good", reason: "x", date: "2026-10-10" }],
  ["/api/products", { name: "x", sku: "x", initialQty: 5 }],
];

async function status(path: string, body: object, token: string) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Cookie: `chaleur_session=${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { code: res.status, text: await res.text() };
}

for (const [path, body] of calls) {
  const label = `${path} ${JSON.stringify(body).slice(0, 40)}`;
  assert.equal((await status(path, body, tokens.none)).code, 401, `${label}: signed out`);
  assert.equal((await status(path, body, tokens.viewer)).code, 403, `${label}: view-only role`);
  const owner = await status(path, body, tokens.owner);
  assert.ok(![401, 403].includes(owner.code), `${label}: owner gets through (${owner.code})`);
  // Error answers carry a message, not internals.
  assert.ok(!/at .*\.ts:\d+|prisma\.|SELECT /i.test(owner.text), `${label}: no internals in ${owner.text.slice(0, 120)}`);
}
// Received importations change only by the main user, even for people who can edit importations.
if (tokens.editor) {
  const revise = await status("/api/importations", { action: "revise", id: "x", reason: "x" }, tokens.editor);
  assert.equal(revise.code, 403, "editor can't correct a received importation");
  const fob = await status("/api/adjustments", { productId: "x", mode: "fob", fobCost: 1, reason: "x" }, tokens.editor);
  assert.ok(![401, 403].includes(fob.code), "editor can correct FOB");
}
console.log(`permissions.test: ok (${calls.length} operations × signed out, view-only, owner)`);
