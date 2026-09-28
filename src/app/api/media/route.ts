import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { addLibraryFile, addLink, listLibrary, removeConnection } from "@/lib/media/library";

export async function GET() {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  return jsonOk(await listLibrary());
}

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const body = await readJson<{
      action?: "add" | "link" | "unlink";
      id?: string;
      file?: {
        url: string;
        thumbUrl: string;
        name: string;
        kind: string;
        contentType: string;
        size: number;
      };
      photoId?: string;
      scope?: "product" | "tag" | "family" | "category" | "brand";
      productId?: string | null;
      tagId?: string | null;
      brand?: string | null;
      category?: string | null;
      family?: string | null;
    }>(req);
    if (body.action === "add" && body.file) return jsonOk(await addLibraryFile(body.file));
    if (body.action === "link" && body.photoId && body.scope) {
      return jsonOk(await addLink({ ...body, photoId: body.photoId, scope: body.scope }));
    }
    if (body.action === "unlink" && body.id) {
      await removeConnection(body.id);
      return jsonOk({ ok: true });
    }
    return jsonError("Unknown action");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't update media");
  }
}
