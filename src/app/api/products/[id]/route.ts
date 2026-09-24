import {
  deleteProduct,
  getProductCard,
  getProductDetail,
  updateProduct,
} from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { photoStorage } from "@/lib/photos/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const view = new URL(req.url).searchParams.get("view");
    const product = view === "info" ? await getProductCard(id) : await getProductDetail(id);
    if (!product) return jsonError("Product not found", 404);
    return jsonOk({ ...product, photoStorage: photoStorage() });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not load the product", 500);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<Record<string, unknown>>(req);
    return jsonOk(await updateProduct(id, body as never));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Update failed", 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteProduct(id);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Couldn't delete the product",
      400,
    );
  }
}
