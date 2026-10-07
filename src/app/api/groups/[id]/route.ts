import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";
import { assetAction, type AssetBody } from "@/lib/photos/actions";
import { groupDetail } from "@/lib/photos/groups";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const denied = await deny(["media", "storage"], "view");
  if (denied) return denied;
  const { id } = await ctx.params;
  const detail = await groupDetail(id);
  return detail ? jsonOk(detail) : jsonError("Group not found", 404);
}

/** Group photos and files: add / tag / cover / delete. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    return jsonOk(await assetAction({ groupId: id }, await readJson<AssetBody>(req)));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Update failed", 400);
  }
}
