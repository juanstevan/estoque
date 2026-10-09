import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";
import { assetAction, type AssetBody } from "@/lib/photos/actions";
import { listPhotos } from "@/lib/photos/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const denied = await deny(["media", "storage"], "view");
  if (denied) return denied;
  const { id } = await ctx.params;
  return jsonOk({ photos: await listPhotos(id) });
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    return jsonOk(await assetAction({ productId: id }, await readJson<AssetBody>(req)));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Update failed", 400);
  }
}
