import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type SectionOwner = { brand?: string | null; category?: string | null; family?: string | null; sampleProductId?: string | null };

/** Returns the durable section ID for the exact brand/category/family context. */
export async function resolveCatalogSection(owner: SectionOwner) {
  const brand = owner.brand?.trim() ?? "";
  const category = owner.category?.trim() ?? "";
  const family = owner.family?.trim() ?? "";
  if (!brand || !category) throw new Error("Choose a brand and category");
  const scope = family ? "family" : "category";
  const product = owner.sampleProductId
    ? await prisma.product.findUnique({ where: { id: owner.sampleProductId }, select: { type: true, category: true, model: true } })
    : await prisma.product.findFirst({ where: { type: brand, category, ...(family ? { model: family } : {}) }, select: { type: true, category: true, model: true } });
  if (!product || product.type?.trim() !== brand || product.category?.trim() !== category || (family && product.model?.trim() !== family)) {
    throw new Error("This catalog section no longer exists");
  }
  const where = { scope_brand_category_family: { scope, brand, category, family } };
  const existing = await prisma.catalogSection.findUnique({ where });
  if (existing) return existing;
  try {
    return await prisma.catalogSection.create({ data: { scope, brand, category, family } });
  } catch (error) {
    // React's development effects can resolve the same section at the same time.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const created = await prisma.catalogSection.findUnique({ where });
      if (created) return created;
    }
    throw error;
  }
}
