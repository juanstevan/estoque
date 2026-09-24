import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { assetAction, type AssetBody } from "@/lib/photos/actions";
import { assignProducts, groupPath, inheritedAssets } from "@/lib/photos/groups";
import { listPhotos, shareAssetWithGroup } from "@/lib/photos/service";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  return jsonOk({ photos: await listPhotos(id) });
}

async function groupState(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { groupId: true } });
  const groupId = product?.groupId ?? null;
  return { groupId, groupPath: await groupPath(groupId), inherited: await inheritedAssets(groupId) };
}

export async function POST(req: Request, ctx: Ctx) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const { id } = await ctx.params;
    const body = await readJson<AssetBody & { groupId?: string | null }>(req);
    if (body.action === "group") {
      await assignProducts([id], body.groupId || null);
      return jsonOk(await groupState(id));
    }
    if (body.action === "share") {
      if (!body.photoId) return jsonError("photoId is required");
      const photos = await shareAssetWithGroup(id, body.photoId);
      return jsonOk({ photos, ...(await groupState(id)) });
    }
    return jsonOk(await assetAction({ productId: id }, body));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Update failed", 400);
  }
}
