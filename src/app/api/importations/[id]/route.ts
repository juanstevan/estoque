import { getImportation } from "@/lib/inventory/service";
import { jsonError, jsonOk } from "@/lib/api";
import { deny } from "@/lib/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const denied = await deny("imports", "view");
  if (denied) return denied;
  const { id } = await ctx.params;
  const item = await getImportation(id);
  if (!item) return jsonError("Importation not found", 404);
  return jsonOk(item);
}
