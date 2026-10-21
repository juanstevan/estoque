/**
 * Read-only stock check: lists products whose stored numbers disagree with their movements,
 * reservations or cost. Writes nothing.
 *   npx tsx --env-file=.env scripts/reconcile.mts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "../src/lib/database-url";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl(), max: 1 }) });

const rows = await db.$queryRaw<
  Array<{ code: string; name: string; physical: number; moved: number; reserved: number; lines: number; available: number; avg: number; value: number }>
>`
  SELECT p.code, p.name, p."physicalQty" AS physical,
         COALESCE((SELECT SUM(t.quantity) FROM "InventoryTransaction" t WHERE t."productId" = p.id), 0) AS moved,
         p."reservedQty" AS reserved,
         COALESCE((SELECT SUM(l."reservedQty") FROM "OrderLine" l WHERE l."productId" = p.id), 0) AS lines,
         p."availableQty" AS available, p."avgCost" AS avg, p."inventoryValue" AS value
  FROM "Product" p ORDER BY p.code`;

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const found: Record<string, string[]> = {
  "Physical ≠ sum of movements": [],
  "Reserved ≠ reserved on invoice lines": [],
  "Available ≠ physical − reserved": [],
  "Negative physical or available": [],
  "Value ≠ units × average cost": [],
  "Units on hand with no cost": [],
};
for (const r of rows) {
  const label = `${r.code} ${r.name}`;
  if (!near(r.physical, r.moved)) found["Physical ≠ sum of movements"].push(`${label}: ${r.physical} vs ${r.moved}`);
  if (!near(r.reserved, r.lines)) found["Reserved ≠ reserved on invoice lines"].push(`${label}: ${r.reserved} vs ${r.lines}`);
  if (!near(r.available, r.physical - r.reserved)) found["Available ≠ physical − reserved"].push(`${label}: ${r.available} vs ${r.physical - r.reserved}`);
  if (r.physical < 0 || r.available < 0) found["Negative physical or available"].push(`${label}: physical ${r.physical}, available ${r.available}`);
  if (!near(r.value, r.physical * r.avg)) found["Value ≠ units × average cost"].push(`${label}: ${r.value} vs ${r.physical * r.avg}`);
  if (r.physical > 0 && r.avg === 0) found["Units on hand with no cost"].push(`${label}: ${r.physical} units`);
}

console.log(`${rows.length} products checked.\n`);
for (const [title, list] of Object.entries(found)) {
  console.log(`${title}: ${list.length}`);
  for (const line of list) console.log(`  ${line}`);
}
await db.$disconnect();
