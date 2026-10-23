import { prisma } from "@/lib/db";
import { cleanDoc, readDoc, type RichNode } from "./rich-text";
import { resolveCatalogSection } from "./section";

/** Whose description: a Tag, a product (its Tag's when it has one), or a category / family of a brand. */
export type TextOwner = {
  tagId?: string | null;
  productId?: string | null;
  sectionId?: string | null;
  brand?: string | null;
  category?: string | null;
  family?: string | null;
};

export type TextOwnerInfo =
  | { kind: "tag"; tagId: string; name: string; products: number }
  | { kind: "product"; productId: string }
  | { kind: "category" | "family"; brand: string; category: string; family: string | null };

/** One row per owner: the Tag's for every product in it, the product's own only without a Tag. */
async function resolve(owner: TextOwner) {
  let tagId = owner.tagId ?? null;
  if (!tagId && owner.productId) {
    const product = await prisma.product.findUnique({ where: { id: owner.productId }, select: { tagId: true } });
    if (!product) throw new Error("Product not found");
    if (!product.tagId) {
      const info: TextOwnerInfo = { kind: "product", productId: owner.productId };
      return { info, where: { productId: owner.productId }, data: { productId: owner.productId } };
    }
    tagId = product.tagId;
  }
  if (tagId) {
    const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { name: true, _count: { select: { products: true } } } });
    if (!tag) throw new Error("Tag not found");
    const info: TextOwnerInfo = { kind: "tag", tagId, name: tag.name, products: tag._count.products };
    return { info, where: { tagId }, data: { tagId } };
  }
  if (owner.sectionId || (owner.brand?.trim() && owner.category?.trim())) {
    const section = owner.sectionId
      ? await prisma.catalogSection.findUnique({ where: { id: owner.sectionId } })
      : await resolveCatalogSection(owner);
    if (!section) throw new Error("Catalog section not found");
    const family = section.family || null;
    const info: TextOwnerInfo = { kind: family ? "family" : "category", brand: section.brand, category: section.category, family };
    return {
      info,
      where: { sectionId: section.id },
      data: { sectionId: section.id, brand: section.brand, category: section.category, family },
    };
  }
  throw new Error("Choose a product, a Tag, or a category");
}

export async function getCatalogText(owner: TextOwner): Promise<{ owner: TextOwnerInfo; doc: RichNode | null; updatedAt: Date | null }> {
  const { info, where } = await resolve(owner);
  const row = await prisma.catalogText.findFirst({ where });
  return { owner: info, doc: readDoc(row?.content), updatedAt: row?.updatedAt ?? null };
}

/** Saves the description for its owner; an empty one is removed. */
export async function setCatalogText(owner: TextOwner, raw: unknown) {
  const { info, where, data } = await resolve(owner);
  const doc = cleanDoc(raw);
  await prisma.$transaction(async (tx) => {
    const row = await tx.catalogText.findFirst({ where, select: { id: true } });
    if (!doc) {
      if (row) await tx.catalogText.delete({ where: { id: row.id } });
      return;
    }
    const content = JSON.stringify(doc);
    if (row) await tx.catalogText.update({ where: { id: row.id }, data: { content } });
    else await tx.catalogText.create({ data: { ...data, content } });
  });
  return { owner: info, doc };
}
