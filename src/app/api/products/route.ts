import { createProduct, listProducts } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { addPhotos, type PhotoInput } from "@/lib/photos/service";
import { deny, guard } from "@/lib/guard";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const denied = await deny(["storage", "media", "imports", "settings"], "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  return jsonOk(await listProducts(q));
}

export async function POST(req: Request) {
  const me = await guard(["storage", "imports"], "edit");
  if (me instanceof Response) return me;
  try {
    const body = await readJson<{
      name: string;
      sku: string;
      type?: string | null;
      category?: string | null;
      model?: string | null;
      hsCode?: string | null;
      code?: string;
      amazonUrl?: string | null;
      /** "qb:<item id>": linked to an existing QuickBooks item, so none is created for it. */
      secondarySku?: string | null;
      imageUrl?: string | null;
      suppliers?: string | null;
      b2bPrice?: number;
      b2cPrice?: number;
      notes?: string | null;
      tagId?: string | null;
      weight?: number | null;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      packageLength?: number | null;
      packageWidth?: number | null;
      packageHeight?: number | null;
      packageWeight?: number | null;
      cutoutLength?: number | null;
      cutoutWidth?: number | null;
      cutoutHeight?: number | null;
      initialQty?: number;
      initialUnitCost?: number;
      photos?: PhotoInput[];
    }>(req);
    if (!body.name?.trim() || !body.sku?.trim()) {
      return jsonError("Name and SKU are required");
    }
    const { photos, ...fields } = body;
    if (fields.secondarySku) {
      if (!/^qb:\d+$/.test(fields.secondarySku)) return jsonError("Pick the QuickBooks item from the list");
      const other = await prisma.product.findFirst({ where: { secondarySku: fields.secondarySku }, select: { code: true } });
      if (other) return jsonError(`That QuickBooks item is already linked to ${other.code}`, 409);
    }
    const product = await createProduct({ ...fields, userId: me.id });
    if (photos?.length) await addPhotos(product.id, photos);
    return jsonOk(product, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not create product", 500);
  }
}
