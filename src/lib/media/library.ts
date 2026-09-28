import { prisma } from "@/lib/db";
import { allGroups, pathOf } from "@/lib/photos/service";

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

function placed(path: { name: string }[]): Scope {
  const name = path.at(-1)?.name ?? "Folder";
  if (path.length <= 1) return { rank: 5, source: `Brand · ${name}` };
  if (path.length === 2) return { rank: 4, source: `Category · ${name}` };
  if (path.length === 3) return { rank: 3, source: `Family · ${name}` };
  return { rank: 1, source: `Folder · ${name}` };
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
};

function shown(photo: PhotoRow, scope: Scope): ShownFile {
  return {
    id: photo.id,
    url: photo.url,
    thumbUrl: photo.thumbUrl || photo.url,
    name: photo.originalName || photo.tag || "File",
    kind: photo.kind,
    contentType: photo.contentType,
    source: scope.source,
    rank: scope.rank,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    tag: photo.tag,
    fileName: photo.fileName,
  };
}

export async function mediaForProduct(product: {
  id: string;
  tagId: string | null;
  type: string | null;
  category: string | null;
  model: string | null;
  groupId: string | null;
}) {
  const groups = await allGroups();
  const chain = product.groupId ? pathOf(groups, product.groupId) : [];
  const groupIds = chain.map((group) => group.id);
  const [own, grouped, links] = await Promise.all([
    prisma.productPhoto.findMany({ where: { productId: product.id } }),
    groupIds.length ? prisma.productPhoto.findMany({ where: { groupId: { in: groupIds } } }) : Promise.resolve([]),
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
  const byGroup = new Map(chain.map((group) => [group.id, pathOf(groups, group.id)]));
  const best = new Map<string, ShownFile>();
  const keep = (item: ShownFile) => {
    const prev = best.get(item.id);
    if (!prev || item.rank < prev.rank) best.set(item.id, item);
  };
  for (const photo of own) keep(shown(photo, { rank: 0, source: "This product" }));
  for (const photo of grouped) {
    if (!photo.groupId) continue;
    keep(shown(photo, placed(byGroup.get(photo.groupId) ?? [])));
  }
  for (const link of links) keep(shown(link.photo, linked(link)));
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

export async function listLibrary() {
  const [photos, groups, tags] = await Promise.all([
    prisma.productPhoto.findMany({
      include: {
        product: { select: { name: true } },
        links: { include: { tag: { select: { name: true } }, product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    allGroups(),
    listTags(),
  ]);
  return {
    tags,
    files: photos.map((photo) => {
      const connections: { id: string; label: string }[] = [];
      if (photo.product) connections.push({ id: `owner:${photo.id}`, label: `Product · ${photo.product.name}` });
      if (photo.groupId) connections.push({ id: `group:${photo.id}`, label: placed(pathOf(groups, photo.groupId)).source });
      for (const link of photo.links) connections.push({ id: link.id, label: linked(link).source });
      return {
        id: photo.id,
        url: photo.url,
        thumbUrl: photo.thumbUrl || photo.url,
        name: photo.originalName || photo.tag || "File",
        kind: photo.kind,
        contentType: photo.contentType,
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
  if (id.startsWith("group:")) {
    await prisma.productPhoto.update({ where: { id: id.slice(6) }, data: { groupId: null } });
    return;
  }
  await prisma.mediaLink.delete({ where: { id } });
}
