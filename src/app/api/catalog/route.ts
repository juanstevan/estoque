import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";
import { assignProduct, catalogLink, setCatalogField, setShared, unassignProduct } from "@/lib/catalog/service";

/** Catalog editing from the Media tab, and builder links. */
export async function POST(req: Request) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  try {
    const body = await readJson<{
      action?: "field" | "shared" | "assign" | "unassign" | "link";
      tagId?: string | null;
      productId?: string | null;
      productIds?: string[];
      field?: string;
      visibility?: string;
      data?: Record<string, unknown>;
      newTag?: { name: string; productIds: string[] };
      brand?: string;
    }>(req);
    if (body.action === "field") {
      await setCatalogField({ tagId: body.tagId, productId: body.productId }, body.field ?? "", body.visibility ?? "");
      return jsonOk({ ok: true });
    }
    if (body.action === "shared") return jsonOk(await setShared(body.productIds ?? [], body.data ?? {}));
    if (body.action === "assign" && body.productId) {
      return jsonOk(await assignProduct(body.productId, { tagId: body.tagId ?? undefined, newTag: body.newTag }));
    }
    if (body.action === "unassign" && body.productId) {
      await unassignProduct(body.productId);
      return jsonOk({ ok: true });
    }
    if (body.action === "link") {
      const token = await catalogLink(body.brand ?? "");
      return jsonOk({ url: `${new URL(req.url).origin}/c/${token}` });
    }
    return jsonError("Unknown action");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't update the catalog");
  }
}
