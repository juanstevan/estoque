import { confirmImportation, getImportation } from "@/lib/inventory/service";
import { jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await getImportation(id);
  if (!item) return jsonError("Importation not found", 404);
  return jsonOk(item);
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await confirmImportation(id));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Error", 400);
  }
}
