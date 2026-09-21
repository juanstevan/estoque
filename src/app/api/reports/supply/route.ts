import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import {
  attentionRows,
  buildSupply,
  findProduct,
  reportsIndex,
  rowsFor,
} from "@/lib/reports/supply";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const index = reportsIndex(searchParams.get("refresh") === "1");
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
      return jsonOk({ ...index, attention: attentionRows(stock, incoming) });
    }

    const product = findProduct(id);
    if (!product) return jsonError("Product not found", 404);

    const linked = product.skus
      .map((sku) => stock.get(sku.toLowerCase()))
      .find(Boolean);

    const report = buildSupply({
      product,
      rows: rowsFor(id),
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
  } catch (e) {
    const missing = e instanceof Error && "code" in e && e.code === "ENOENT";
    return jsonError(
      missing
        ? "Orders export was not found. Set REPORTS_ORDERS_PATH."
        : e instanceof Error
          ? e.message
          : "Could not build the report",
      missing ? 404 : 500,
    );
  }
}
