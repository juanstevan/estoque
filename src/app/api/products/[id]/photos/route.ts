import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import {
  addPhotos,
  coverPhoto,
  listPhotos,
  removePhoto,
  retagPhoto,
  type PhotoInput,
} from "@/lib/photos/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  return jsonOk({ photos: await listPhotos(id) });
}

export async function POST(req: Request, ctx: Ctx) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const { id } = await ctx.params;
    const body = await readJson<{
      action?: "add" | "tag" | "cover" | "delete";
      photos?: PhotoInput[];
      photoId?: string;
      tag?: string;
    }>(req);
    if (body.action === "add") return jsonOk(await addPhotos(id, body.photos ?? []));
    if (!body.photoId) return jsonError("photoId is required");
    if (body.action === "tag") return jsonOk({ photos: await retagPhoto(id, body.photoId, body.tag ?? "") });
    if (body.action === "cover") return jsonOk({ photos: await coverPhoto(id, body.photoId) });
    if (body.action === "delete") return jsonOk({ photos: await removePhoto(id, body.photoId) });
    return jsonError("Unknown action");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Photo update failed", 400);
  }
}
