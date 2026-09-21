import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { readSales, syncSales } from "@/lib/reports/orders";
import {
  attentionRows,
  buildSupply,
  catalogFrom,
  findProduct,
  reportsIndex,
  rowsFor,
} from "@/lib/reports/supply";

export const maxDuration = 120;

async function payload(req: Request) {
  const { searchParams } = new URL(req.url);
  const loaded = await readSales();
  const data = catalogFrom(loaded.rows, loaded.updatedAt);
  const index = reportsIndex(data);
  const catalog = await prisma.product.findMany({
    select: { id: true, sku: true, physicalQty: true, availableQty: true },
  });
  const stock = new Map(
    catalog.map((p) => [
      p.sku.trim().toLowerCase(),
      { id: p.id, physical: p.physicalQty, available: p.availableQty },
    ]),
  );
  const id = searchParams.get("product");
  if (!id) {
    const openLines = await prisma.importationLine.findMany({
      where: {
        importation: { status: { in: ["PENDING", "IN_TRANSIT", "DELAYED"] } },
        product: { isNot: null },
      },
      select: { quantity: true, product: { select: { sku: true } } },
    });
    const incoming = new Map<string, number>();
    for (const line of openLines) {
      const sku = line.product?.sku.trim().toLowerCase();
      if (!sku) continue;
      incoming.set(sku, (incoming.get(sku) ?? 0) + line.quantity);
    }
    return jsonOk({ ...index, attention: attentionRows(data, stock, incoming) });
  }

  const product = findProduct(data, id);
  if (!product) return jsonError("Product not found", 404);

  const linked = product.skus
    .map((sku) => stock.get(sku.toLowerCase()))
    .find(Boolean);

  const report = buildSupply({
    product,
    rows: rowsFor(data, id),
    period: searchParams.get("period") || "12",
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    seller: searchParams.get("seller") || null,
    client: searchParams.get("client") || null,
    physical: linked?.physical ?? null,
    available: linked?.available ?? null,
    updatedAt: index.updatedAt,
    sourceNote: index.sourceNote,
  });
  return jsonOk({ ...index, report });
}

export async function GET(req: Request) {
  try {
    return await payload(req);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not build the report", 500);
  }
}

export async function POST() {
  try {
    const result = await syncSales();
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not refresh QuickBooks", 500);
  }
}
