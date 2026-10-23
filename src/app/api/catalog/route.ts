import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";
import { assignProduct, catalogLink, setCatalogField, setShared, unassignProduct } from "@/lib/catalog/service";
import { getCatalogText, setCatalogText } from "@/lib/catalog/text";
import { resolveCatalogSection } from "@/lib/catalog/section";

/** A description: ?productId= (its Tag's when it has one), ?tagId=, or ?brand=&category=[&family=]. */
export async function GET(req: Request) {
  const denied = await deny(["media", "storage"], "view");
  if (denied) return denied;
  try {
    const q = new URL(req.url).searchParams;
    return jsonOk(
      await getCatalogText({ productId: q.get("productId"), tagId: q.get("tagId"), sectionId: q.get("sectionId"), brand: q.get("brand"), category: q.get("category"), family: q.get("family") }),
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't load the description");
  }
}

/** Catalog editing from the Media tab, and builder links. */
export async function POST(req: Request) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  try {
    const body = await readJson<{
      action?: "field" | "shared" | "assign" | "unassign" | "link" | "text" | "section";
      sectionId?: string | null;
      sampleProductId?: string | null;
      tagId?: string | null;
      productId?: string | null;
      productIds?: string[];
      field?: string;
      visibility?: string;
      data?: Record<string, unknown>;
      newTag?: { name: string; productIds: string[] };
      brand?: string;
      category?: string | null;
      family?: string | null;
      content?: unknown;
    }>(req);
    if (body.action === "section") {
      const section = await resolveCatalogSection(body);
      return jsonOk({ id: section.id });
    }
    if (body.action === "text") return jsonOk(await setCatalogText(body, body.content));
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
