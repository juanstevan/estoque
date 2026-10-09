import { prisma } from "@/lib/db";
import { composeName, groupBase, mediaFileNames, photoBase, splitName } from "@/lib/photos/name";
import { pushQuickBooksItem } from "@/lib/quickbooks/qbo";
import { syncPhotos } from "@/lib/photos/service";

const COLORS = ["#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#7c3aed", "#db2777", "#475569", "#b45309"];

export function tagColor(name: string) {
  let n = 0;
  for (const ch of name) n += ch.charCodeAt(0);
  return COLORS[n % COLORS.length]!;
}

export async function listTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });
}

export async function createTag(name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Name the tag");
  const existing = await prisma.tag.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
    select: { id: true, name: true, color: true },
  });
  if (existing) return existing;
  return prisma.tag.create({ data: { name: clean, color: tagColor(clean) }, select: { id: true, name: true, color: true } });
}

type Scope = { rank: number; source: string };

function linkConnection(link: {
  productId: string | null;
  tagId: string | null;
  family: string | null;
  category: string | null;
  brand: string | null;
  tag?: { id?: string; name: string } | null;
  product?: { name: string } | null;
}) {
  if (link.productId) {
    const name = link.product?.name ?? "Product";
    return { scope: "product" as const, key: link.productId, name, label: `${name} · Product` };
  }
  if (link.tagId) {
    const name = link.tag?.name ?? "Tag";
    return { scope: "tag" as const, key: link.tagId, name, label: `${name} · Tag` };
  }
  if (link.family && link.brand && link.category) {
    return {
      scope: "family" as const,
      key: `${link.brand}\0${link.category}\0${link.family}`,
      name: link.family,
      context: `${link.brand} · ${link.category}`,
      label: `${link.family} · Family`,
    };
  }
  if (link.category) {
    return { scope: "category" as const, key: link.category, name: link.category, label: `${link.category} · Category` };
  }
  if (link.brand) {
    return { scope: "brand" as const, key: link.brand, name: link.brand, label: `${link.brand} · Brand` };
  }
  return null;
}

function linked(link: {
  productId: string | null;
  tagId: string | null;
  family: string | null;
  category: string | null;
  brand: string | null;
  tag?: { name: string } | null;
  product?: { name: string } | null;
}): Scope {
  if (link.productId) return { rank: 0, source: `Product · ${link.product?.name ?? "Product"}` };
  if (link.tagId) return { rank: 2, source: `Tag · ${link.tag?.name ?? "Tag"}` };
  if (link.family) return { rank: 3, source: `Family · ${link.family}` };
  if (link.category) return { rank: 4, source: `Category · ${link.category}` };
  return { rank: 5, source: `Brand · ${link.brand ?? "Brand"}` };
}

export type ShownFile = {
  id: string;
  url: string;
  thumbUrl: string;
  name: string;
  kind: string;
  contentType: string;
  source: string;
  rank: number;
  size: number;
  width: number | null;
  height: number | null;
  tag: string;
  fileName: string;
  visibility: string;
};

type PhotoRow = {
  id: string;
  url: string;
  thumbUrl: string;
  originalName: string;
  tag: string;
  kind: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  fileName: string;
  visibility: string;
};

function shown(photo: PhotoRow, scope: Scope): ShownFile {
  return {
    id: photo.id,
    url: photo.url,
    thumbUrl: photo.thumbUrl || photo.url,
    name: photo.tag || photo.originalName || "File",
    kind: photo.kind,
    contentType: photo.contentType,
    source: scope.source,
    rank: scope.rank,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    tag: photo.tag,
    fileName: photo.fileName,
    visibility: photo.visibility,
  };
}

export async function mediaForProduct(product: {
  id: string;
  tagId: string | null;
  type: string | null;
  category: string | null;
  model: string | null;
}) {
  const [own, links] = await Promise.all([
    prisma.productPhoto.findMany({ where: { productId: product.id } }),
    prisma.mediaLink.findMany({
      where: {
        OR: [
          { productId: product.id },
          ...(product.tagId ? [{ tagId: product.tagId }] : []),
          ...(product.type && product.category && product.model
            ? [{ brand: product.type, category: product.category, family: product.model }]
            : []),
          ...(product.category ? [{ category: product.category, family: null, brand: null, productId: null, tagId: null }] : []),
          ...(product.type ? [{ brand: product.type, category: null, family: null, productId: null, tagId: null }] : []),
        ],
      },
      include: { photo: true, tag: { select: { name: true } }, product: { select: { name: true } } },
    }),
  ]);
  const best = new Map<string, ShownFile>();
  const keep = (item: ShownFile) => {
    const prev = best.get(item.id);
    if (!prev || item.rank < prev.rank) best.set(item.id, item);
  };
  for (const photo of own) keep(shown(photo, { rank: 0, source: "This product" }));
  for (const link of links) keep(shown(link.photo, linked(link)));
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

type Connected = { scope: "brand" | "category" | "family" | "tag" | "product"; key: string; name: string; context?: string };
const CONTEXT_ORDER = ["product", "family", "category", "brand", "tag"] as const;

/**
 * The name a download (or an AI tool) gets: product context + the file's own name, e.g.
 * grill_legend_5_liquid_propane_front.jpg. A file kept by a product already has it
 * stored (syncPhotos keeps it current). A linked one takes its closest connection.
 */
function downloadName(
  photo: { fileName: string; productId: string | null; tag: string; kind: string; contentType: string; originalName: string; product?: { name: string; type: string | null } | null; links: { productId: string | null; product?: { name: string; type: string | null } | null }[] },
  connections: Connected[],
) {
  if (photo.fileName && photo.productId) return photo.fileName;
  const closest = CONTEXT_ORDER.flatMap((scope) => connections.filter((c) => c.scope === scope))[0];
  let base = "";
  if (closest?.scope === "product") {
    const product = photo.productId === closest.key ? photo.product : photo.links.find((l) => l.productId === closest.key)?.product;
    base = product ? photoBase(product) : "";
  } else if (closest?.scope === "family") base = groupBase(closest.key.split("\0"));
  else if (closest) base = groupBase([closest.name]);
  return mediaFileNames(base, [photo])[0]!.replace(/^_/, "");
}

export const VISIBILITY = ["internal", "partners", "public"] as const;
export type Visibility = (typeof VISIBILITY)[number];

/** Internal: only the app. Partners: partner links. Public: catalog and share links. */
export async function setVisibility(ids: string[], visibility: string) {
  if (!VISIBILITY.includes(visibility as Visibility)) throw new Error("Choose Internal, Partners or Public");
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  await prisma.productPhoto.updateMany({ where: { id: { in: unique } }, data: { visibility } });
}

/** One cover per brand, category, family or tag: setting one clears the one before. */
export async function setCover(linkId: string, on: boolean) {
  const link = await prisma.mediaLink.findUnique({ where: { id: linkId }, include: { photo: { select: { kind: true, contentType: true } } } });
  if (!link) throw new Error("Connection not found");
  if (link.productId) throw new Error("Covers are for a brand, category, family or tag");
  if (link.photo.kind === "file" || !link.photo.contentType.startsWith("image/")) throw new Error("A cover must be a photo");
  const same = { productId: null, tagId: link.tagId, brand: link.brand, category: link.category, family: link.family, role: "cover" };
  await prisma.$transaction([
    ...(on ? [prisma.mediaLink.updateMany({ where: same, data: { role: null } })] : []),
    prisma.mediaLink.update({ where: { id: linkId }, data: { role: on ? "cover" : null } }),
  ]);
}

/** Renames one file. The name shows in the app; downloads get it after the product context. */
export async function renameFile(id: string, raw: string) {
  const photo = await prisma.productPhoto.update({ where: { id }, data: { tag: raw.trim().slice(0, 80) } });
  if (photo.productId) await syncPhotos(photo.productId);
  return photo;
}

export async function listLibrary() {
  const [photos, tags] = await Promise.all([
    prisma.productPhoto.findMany({
      include: {
        product: { select: { name: true, type: true } },
        links: { include: { tag: { select: { name: true } }, product: { select: { name: true, type: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    listTags(),
  ]);
  return {
    tags,
    files: photos.map((photo) => {
      const connections: { id: string; scope: "brand" | "category" | "family" | "tag" | "product"; key: string; name: string; context?: string; label: string; cover?: boolean }[] = [];
      if (photo.product) {
        connections.push({
          id: `owner:${photo.id}`,
          scope: "product",
          key: photo.productId ?? photo.id,
          name: photo.product.name,
          label: `${photo.product.name} · Product`,
        });
      }
      for (const link of photo.links) {
        const place = linkConnection(link);
        if (place) connections.push({ id: link.id, ...place, cover: link.role === "cover" });
      }
      return {
        id: photo.id,
        url: photo.url,
        thumbUrl: photo.thumbUrl || photo.url,
        name: photo.tag || photo.originalName || "File",
        originalName: photo.originalName,
        tag: photo.tag,
        fileName: downloadName(photo, connections),
        visibility: photo.visibility,
        kind: photo.kind,
        contentType: photo.contentType,
        size: photo.size,
        connections,
      };
    }),
  };
}

export async function addLibraryFile(file: {
  url: string;
  thumbUrl: string;
  name: string;
  kind: string;
  contentType: string;
  size: number;
}) {
  const existing = await prisma.productPhoto.findFirst({ where: { url: file.url } });
  if (existing) return existing;
  return prisma.productPhoto.create({
    data: {
      url: file.url,
      thumbUrl: file.thumbUrl || file.url,
      originalName: file.name.slice(0, 200),
      kind: file.kind === "file" ? "file" : "photo",
      contentType: file.contentType || "application/octet-stream",
      size: Math.round(file.size),
    },
  });
}

export async function addLink(input: {
  photoId: string;
  scope: "product" | "tag" | "family" | "category" | "brand";
  productId?: string | null;
  tagId?: string | null;
  brand?: string | null;
  category?: string | null;
  family?: string | null;
}) {
  const data = {
    photoId: input.photoId,
    productId: input.scope === "product" ? input.productId || null : null,
    tagId: input.scope === "tag" ? input.tagId || null : null,
    brand: input.scope === "brand" || input.scope === "family" ? input.brand || null : null,
    category: input.scope === "category" || input.scope === "family" ? input.category || null : null,
    family: input.scope === "family" ? input.family || null : null,
  };
  if (!data.productId && !data.tagId && !data.brand && !data.category && !data.family) {
    throw new Error("Choose what this file connects to");
  }
  const existing = await prisma.mediaLink.findFirst({ where: data });
  if (existing) return existing;
  return prisma.mediaLink.create({ data });
}

export async function removeConnection(id: string) {
  if (id.startsWith("owner:")) {
    await prisma.productPhoto.update({ where: { id: id.slice(6) }, data: { productId: null } });
    return;
  }
  await prisma.mediaLink.delete({ where: { id } });
}

export async function deleteLibraryFiles(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  await prisma.productPhoto.deleteMany({ where: { id: { in: unique } } });
}

/** Renames a tag, brand, category, or family everywhere it is used, including product names built from category and family. */
export async function renameScope(scope: "tag" | "brand" | "category" | "family", key: string, raw: string) {
  const name = raw.trim();
  if (!name) throw new Error("Enter a name");
  if (scope === "tag") {
    const tag = await prisma.tag.findUnique({ where: { id: key }, select: { id: true, name: true } });
    if (!tag) throw new Error("Tag not found");
    if (tag.name === name) return { qbFailed: 0 };
    const clash = await prisma.tag.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, NOT: { id: tag.id } },
      select: { name: true },
    });
    if (clash) throw new Error(`${clash.name} already exists`);
    await prisma.tag.update({ where: { id: tag.id }, data: { name } });
    return { qbFailed: 0 };
  }

  const products = await prisma.product.findMany({
    where:
      scope === "brand"
        ? { type: key }
        : scope === "category"
          ? { category: key }
          : {
              type: key.split("\0")[0],
              category: key.split("\0")[1],
              model: key.split("\0")[2],
            },
    select: { id: true, name: true, code: true, sku: true, secondarySku: true, b2bPrice: true, type: true, category: true, model: true },
  });
  const renamed: typeof products = [];
  await prisma.$transaction(async (tx) => {
    if (scope === "brand") {
      await tx.product.updateMany({ where: { type: key }, data: { type: name } });
      await tx.mediaLink.updateMany({ where: { brand: key }, data: { brand: name } });
      return;
    }
    if (scope === "category") {
      for (const product of products) {
        const parts = splitName(product.name, product.category, product.model);
        const next = composeName(name, product.model ?? "", parts.variation);
        await tx.product.update({ where: { id: product.id }, data: { category: name, name: next } });
        if (next !== product.name) renamed.push({ ...product, name: next, category: name });
      }
      await tx.mediaLink.updateMany({ where: { category: key }, data: { category: name } });
      return;
    }
    const [brand, category, family] = key.split("\0");
    if (!brand || !category || !family) throw new Error("That family could not be renamed");
    for (const product of products) {
      const parts = splitName(product.name, product.category, product.model);
      const next = composeName(product.category ?? "", name, parts.variation);
      await tx.product.update({ where: { id: product.id }, data: { model: name, name: next } });
      if (next !== product.name) renamed.push({ ...product, name: next, model: name });
    }
    await tx.mediaLink.updateMany({
      where: { brand, category, family },
      data: { family: name },
    });
  }, { timeout: 30_000 });

  // Download names start with the brand and product name.
  for (const product of scope === "brand" ? products : renamed) await syncPhotos(product.id);
  let qbFailed = 0;
  for (const product of renamed) {
    try {
      await pushQuickBooksItem(product);
    } catch {
      qbFailed += 1;
    }
  }
  return { qbFailed };
}
