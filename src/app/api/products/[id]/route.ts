import { getProductDetail, updateProduct } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const product = await getProductDetail(id);
  if (!product) return jsonError("Produto não encontrado", 404);
  return jsonOk(product);
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await readJson<Record<string, unknown>>(req);
    const product = await updateProduct(id, body as never);
    return jsonOk(product);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro ao atualizar", 500);
  }
}
