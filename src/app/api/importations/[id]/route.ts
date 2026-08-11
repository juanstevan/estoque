import { confirmImportation, getImportation } from "@/lib/inventory/service";
import { jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await getImportation(id);
  if (!item) return jsonError("Importação não encontrada", 404);
  return jsonOk(item);
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "confirm") {
      const received = await confirmImportation(id);
      return jsonOk(received);
    }
    return jsonError("Ação inválida");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro", 400);
  }
}
