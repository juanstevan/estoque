import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { updateProduct } from "@/lib/inventory/service";
import { createTag } from "@/lib/media/library";
import {
  fieldVisibility,
  isCatalogField,
  isVisibility,
  readFields,
  visibleTo,
  type CatalogField,
  type Visibility,
} from "./fields";
import { buildTree } from "./tree";

// ── Editing from the Media tab ─────────────────────────────────────────

/** One field's eye: on the Tag for a model, on the product for a variant row or an untagged model. */
export async function setCatalogField(
  owner: { tagId?: string | null; productId?: string | null },
  field: string,
  visibility: string,
) {
  if (!isCatalogField(field)) throw new Error("Unknown field");
  if (!isVisibility(visibility)) throw new Error("Choose Internal, Partners or Public");
  if (owner.tagId) {
    const tag = await prisma.tag.findUniqueOrThrow({ where: { id: owner.tagId }, select: { catalogFields: true } });
    const catalogFields = JSON.stringify({ ...readFields(tag.catalogFields), [field]: visibility });
    await prisma.tag.update({ where: { id: owner.tagId }, data: { catalogFields } });
    return;
  }
  if (!owner.productId) throw new Error("Choose a model or a product");
  const product = await prisma.product.findUniqueOrThrow({ where: { id: owner.productId }, select: { catalogFields: true } });
  const catalogFields = JSON.stringify({ ...readFields(product.catalogFields), [field]: visibility });
  await prisma.product.update({ where: { id: owner.productId }, data: { catalogFields } });
}

const SHARED_KEYS = ["b2bPrice", "width", "length", "height", "cutoutWidth", "cutoutLength", "cutoutHeight", "weight"] as const;
type SharedKey = (typeof SHARED_KEYS)[number];

/**
 * A model's shared value goes to every variant through the normal product save, so a B2B price
 * still reaches QuickBooks. Each variant is saved even if QuickBooks refuses one.
 */
export async function setShared(productIds: string[], raw: Record<string, unknown>) {
  const data: { b2bPrice?: number } & Partial<Record<Exclude<SharedKey, "b2bPrice">, number | null>> = {};
  for (const key of SHARED_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) data[key] = value;
    else if (value === null && key !== "b2bPrice") data[key] = null;
    else throw new Error("Enter a number");
  }
  if (!Object.keys(data).length) throw new Error("Nothing to save");
  const unique = [...new Set(productIds)];
  if (!unique.length) throw new Error("Choose the products");
  const failed: string[] = [];
  for (const id of unique) {
    try {
      await updateProduct(id, data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed";
      if (!message.startsWith("Saved here.")) throw e;
      failed.push(message);
    }
  }
  return { saved: unique.length, quickBooksFailed: failed.length, message: failed[0] ?? null };
}

/**
 * Puts a product in a model. A model without a Tag gets one, named after it, holding the
 * product it was and the new one.
 */
export async function assignProduct(productId: string, target: { tagId?: string; newTag?: { name: string; productIds: string[] } }) {
  if (target.tagId) {
    await prisma.product.update({ where: { id: productId }, data: { tagId: target.tagId } });
    return { tagId: target.tagId };
  }
  if (!target.newTag) throw new Error("Choose the model");
  const name = target.newTag.name.trim();
  if (!name) throw new Error("Name the model first");
  const existing = await prisma.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (existing) throw new Error(`A model named ${name} already exists. Rename this one first.`);
  const tag = await createTag(name);
  await prisma.product.updateMany({ where: { id: { in: [...target.newTag.productIds, productId] } }, data: { tagId: tag.id } });
  return { tagId: tag.id };
}

export async function unassignProduct(productId: string) {
  await prisma.product.update({ where: { id: productId }, data: { tagId: null } });
}

// ── Shared catalogs ────────────────────────────────────────────────────

/** One builder link per brand, made on first share. */
export async function catalogLink(brand: string, audience: Visibility = "partners") {
  const name = brand.trim();
  if (!name) throw new Error("This group has no brand");
  if (audience === "internal") throw new Error("Internal items are never shared");
  const existing = await prisma.catalogLink.findFirst({ where: { brand: name, audience, revokedAt: null } });
  if (existing) return existing.token;
  const token = randomBytes(18).toString("base64url");
  await prisma.catalogLink.create({ data: { token, brand: name, audience } });
  return token;
}

export type SharedFile = { name: string; url: string; fileName: string };
export type SharedModel = {
  key: string;
  title: string | null;
  ids: string | null;
  price: { amount: number; from: boolean } | null;
  dimensions: string | null;
  cutout: string | null;
  weight: string | null;
  images: string[];
  files: SharedFile[];
  variants: { name: string; code: string | null; inStock: boolean }[];
};
export type SharedCatalog = {
  brand: string;
  audience: Visibility;
  categories: { key: string; name: string; families: { key: string; name: string; files: SharedFile[]; models: SharedModel[] }[] }[];
};

const measure = (value: number | null) => (value == null ? "—" : String(Number(value.toFixed(2))));
const triple = (w: number | null, d: number | null, h: number | null) =>
  w == null && d == null && h == null ? "" : `${measure(w)} × ${measure(d)} × ${measure(h)}`;

/** Every variant agrees: that value; otherwise "Varies". Nothing set: null. */
function sharedText(values: string[]) {
  const set = values.filter(Boolean);
  if (!set.length) return null;
  return values.every((v) => v === values[0]) ? values[0]! : "Varies by option";
}

/**
 * Everything a catalog link may show, decided here on the server. Only fields and files cleared
 * for the link's audience leave; costs, quantities, notes and internal files never do.
 */
export async function sharedCatalog(token: string): Promise<SharedCatalog | null> {
  const link = await prisma.catalogLink.findUnique({ where: { token } });
  if (!link || link.revokedAt || !isVisibility(link.audience) || link.audience === "internal") return null;
  const audience = link.audience;
  const allowed = (["partners", "public"] as const).filter((v) => visibleTo(audience, v));

  const products = await prisma.product.findMany({
    where: { type: link.brand },
    select: {
      id: true, code: true, name: true, type: true, category: true, model: true, tagId: true, imageUrl: true,
      b2bPrice: true, availableQty: true, width: true, length: true, height: true,
      cutoutWidth: true, cutoutLength: true, cutoutHeight: true, weight: true, catalogFields: true,
      tag: { select: { name: true, catalogFields: true } },
    },
  });
  const files = await prisma.productPhoto.findMany({
    where: { visibility: { in: [...allowed] } },
    select: { id: true, url: true, thumbUrl: true, tag: true, originalName: true, fileName: true, kind: true, contentType: true, productId: true, links: true },
    orderBy: { createdAt: "asc" },
  });
  // Files by the level they're linked to, covers first.
  const at = new Map<string, typeof files>();
  const put = (key: string, file: (typeof files)[number], cover: boolean) =>
    at.set(key, cover ? [file, ...(at.get(key) ?? [])] : [...(at.get(key) ?? []), file]);
  for (const file of files) {
    if (file.productId) put(`product|${file.productId}`, file, false);
    for (const l of file.links) {
      const cover = l.role === "cover";
      if (l.productId) put(`product|${l.productId}`, file, cover);
      else if (l.tagId) put(`tag|${l.tagId}`, file, cover);
      else if (l.family && l.brand && l.category) put(`family|${l.brand}\0${l.category}\0${l.family}`, file, cover);
    }
  }
  const isPhoto = (f: (typeof files)[number]) => f.kind !== "file" && f.contentType.startsWith("image/");
  const asFile = (f: (typeof files)[number]): SharedFile => ({ name: f.tag || f.originalName || "File", url: f.url, fileName: f.fileName });

  const tree = buildTree(products).find((b) => b.key === link.brand);
  if (!tree) return { brand: link.brand, audience, categories: [] };
  const can = (json: string | null | undefined, field: CatalogField) => visibleTo(audience, fieldVisibility(json, field));

  return {
    brand: link.brand,
    audience,
    categories: tree.categories
      .map((c) => ({
        key: c.key,
        name: c.name,
        families: c.families
          .map((f) => ({
            key: f.key,
            name: f.name,
            files: (at.get(`family|${link.brand}\0${c.key}\0${f.key}`) ?? []).filter((x) => !isPhoto(x)).map(asFile),
            models: f.models
              .map((m): SharedModel | null => {
                const fields = m.tagId ? m.products[0]!.tag?.catalogFields : m.products[0]!.catalogFields;
                const variants = m.products.filter((p) => can(p.catalogFields, "variant"));
                if (!variants.length) return null;
                const own = [...(m.tagId ? at.get(`tag|${m.tagId}`) ?? [] : []), ...variants.flatMap((p) => at.get(`product|${p.id}`) ?? [])];
                const unique = [...new Map(own.map((x) => [x.id, x])).values()];
                const photos = unique.filter(isPhoto).map((x) => x.thumbUrl || x.url);
                const fallback = variants.find((p) => p.imageUrl)?.imageUrl;
                const prices = variants.map((p) => p.b2bPrice).filter((v) => v > 0);
                return {
                  key: m.key,
                  title: can(fields, "title") ? m.name : null,
                  ids: can(fields, "id") ? variants.map((p) => p.code).join(" · ") : null,
                  price:
                    can(fields, "price") && prices.length
                      ? { amount: Math.min(...prices), from: new Set(prices).size > 1 || prices.length < variants.length }
                      : null,
                  dimensions: can(fields, "dimensions") ? sharedText(variants.map((p) => triple(p.width, p.length, p.height))) : null,
                  cutout: can(fields, "cutout") ? sharedText(variants.map((p) => triple(p.cutoutWidth, p.cutoutLength, p.cutoutHeight))) : null,
                  weight: can(fields, "weight") ? sharedText(variants.map((p) => (p.weight == null ? "" : measure(p.weight)))) : null,
                  images: photos.length ? photos : fallback ? [fallback] : [],
                  files: unique.filter((x) => !isPhoto(x)).map(asFile),
                  variants: variants.map((p) => ({
                    name: p.name,
                    code: can(fields, "id") ? p.code : null,
                    inStock: p.availableQty > 0,
                  })),
                };
              })
              .filter((m): m is SharedModel => m !== null),
          }))
          .filter((f) => f.models.length),
      }))
      .filter((c) => c.families.length),
  };
}
