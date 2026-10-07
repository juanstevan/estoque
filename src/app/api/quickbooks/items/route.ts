import { deny } from "@/lib/guard";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { qboItems } from "@/lib/quickbooks/qbo";
import { matchQuickBooks } from "@/lib/quickbooks/sync";

/** QuickBooks items a product can link to. */
export async function GET() {
  const denied = await deny(["storage", "settings"], "view");
  if (denied) return denied;
  try {
    return jsonOk({ items: await qboItems() });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "QuickBooks error", 400);
  }
}

/**
 * Link a product to an item (itemId null unlinks). The next sync takes a fresh baseline instead of pulling.
 * `match: true` makes a linked product and its item the same instead, and returns the item.
 */
export async function POST(req: Request) {
  const denied = await deny(["storage", "settings"], "edit");
  if (denied) return denied;
  const { productId, itemId, match } = await readJson<{ productId?: string; itemId?: string | null; match?: boolean }>(req);
  if (!productId) return jsonError("Choose a product");
  if (match) {
    try {
      return jsonOk({ item: await matchQuickBooks(productId) });
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Couldn't match the product", 400);
    }
  }
  const link = itemId ? `qb:${itemId}` : null;
  if (link) {
    const other = await prisma.product.findFirst({
      where: { secondarySku: link, NOT: { id: productId } },
      select: { code: true },
    });
    if (other) return jsonError(`That item is linked to ${other.code}`, 409);
  }
  return jsonOk(
    await prisma.product.update({
      where: { id: productId },
      data: { secondarySku: link, qbUpdatedAt: null, qbSeen: null },
      select: { id: true, secondarySku: true },
    }),
  );
}
