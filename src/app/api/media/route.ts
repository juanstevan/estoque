import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";
import { addLibraryFile, addLink, deleteLibraryFiles, listLibrary, removeConnection, renameFile, renameScope, setCover, setVisibility } from "@/lib/media/library";

export async function GET() {
  const denied = await deny(["media", "storage"], "view");
  if (denied) return denied;
  return jsonOk(await listLibrary());
}

export async function POST(req: Request) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  try {
    const body = await readJson<{
      action?: "add" | "link" | "unlink" | "rename" | "rename-file" | "visibility" | "cover" | "delete";
      visibility?: string;
      on?: boolean;
      id?: string;
      ids?: string[];
      key?: string;
      name?: string;
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
    if (body.action === "rename-file" && body.id) return jsonOk(await renameFile(body.id, body.name ?? ""));
    if (body.action === "visibility") {
      await setVisibility(body.ids ?? [], body.visibility ?? "");
      return jsonOk({ ok: true });
    }
    if (body.action === "cover" && body.id) {
      await setCover(body.id, Boolean(body.on));
      return jsonOk({ ok: true });
    }
    if (body.action === "rename") {
      if (body.scope === "product") return jsonError("Rename a product from its card");
      if (!body.scope || !body.key || !body.name?.trim()) return jsonError("Enter a name");
      return jsonOk(await renameScope(body.scope, body.key, body.name));
    }
    if (body.action === "delete") {
      await deleteLibraryFiles(body.ids ?? []);
      return jsonOk({ ok: true });
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

export async function DELETE(req: Request) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  try {
    const body = await readJson<{ ids?: string[] }>(req);
    await deleteLibraryFiles(body.ids ?? []);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't delete the files");
  }
}
