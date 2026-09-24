import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { assetAction, type AssetBody } from "@/lib/photos/actions";
import { groupDetail } from "@/lib/photos/groups";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const detail = await groupDetail(id);
  return detail ? jsonOk(detail) : jsonError("Group not found", 404);
}

/** Group photos and files: add / tag / cover / delete. */
export async function POST(req: Request, ctx: Ctx) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const { id } = await ctx.params;
    return jsonOk(await assetAction({ groupId: id }, await readJson<AssetBody>(req)));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Update failed", 400);
  }
}
