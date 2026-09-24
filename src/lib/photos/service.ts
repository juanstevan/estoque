import { unlink } from "fs/promises";
import path from "path";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { FILE_MAX_BYTES, PHOTO_TYPES, groupBase, mediaFileNames, photoBase } from "./name";

export type AssetInput = {
  url: string;
  thumbUrl: string;
  tag?: string;
  kind?: "photo" | "file";
  contentType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  originalName?: string;
};
/** @deprecated kept for callers that only upload photos */
export type PhotoInput = AssetInput;

export type Owner = { productId: string } | { groupId: string };

function ownerWhere(owner: Owner) {
  return "productId" in owner ? { productId: owner.productId } : { groupId: owner.groupId };
}

/** Vercel may prefix the variable when the store is connected (e.g. `photos_BLOB_READ_WRITE_TOKEN`). */
export function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => k.endsWith("BLOB_READ_WRITE_TOKEN"));
  return key ? process.env[key] : undefined;
}

/**
 * "blob": classic read-write token. "oidc": newer stores connect with only
 * BLOB_STORE_ID and authenticate through Vercel's OIDC token at runtime.
 */
export function photoStorage() {
  if (blobToken()) return "blob";
  if (process.env.BLOB_STORE_ID && process.env.VERCEL) return "oidc";
  return process.env.VERCEL ? "none" : "local";
}

const LOCAL_DIR = "/uploads/photos/";

function ownedUrl(url: string) {
  if (url.startsWith(LOCAL_DIR)) return true;
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Only files this feature uploaded and nothing else still points at; /catalog images ship with the app. */
async function deleteFiles(urls: string[]) {
  const candidates = [...new Set(urls)].filter(ownedUrl);
  const stillUsed = await prisma.productPhoto.findMany({
    where: { OR: [{ url: { in: candidates } }, { thumbUrl: { in: candidates } }] },
    select: { url: true, thumbUrl: true },
  });
  const keep = new Set(stillUsed.flatMap((p) => [p.url, p.thumbUrl]));
  const owned = candidates.filter((u) => !keep.has(u));
  const blobs = owned.filter((u) => !u.startsWith(LOCAL_DIR));
  const local = owned.filter((u) => u.startsWith(LOCAL_DIR));
  await Promise.allSettled([
    blobs.length ? del(blobs, { token: blobToken() }) : Promise.resolve(),
    ...local.map((u) => unlink(path.join(process.cwd(), "public", u))),
  ]);
}

function checkInput(asset: AssetInput) {
  if (!ownedUrl(asset.url) || !ownedUrl(asset.thumbUrl)) {
    throw new Error("Files must be uploaded through the app");
  }
  if (asset.kind === "file") {
    if (asset.size > FILE_MAX_BYTES) throw new Error("Files must be 500 MB or smaller");
  } else if (!PHOTO_TYPES[asset.contentType]) {
    throw new Error("Unsupported photo type");
  }
}

const ORDER = [{ position: "asc" as const }, { createdAt: "asc" as const }];

export async function listAssets(owner: Owner) {
  return prisma.productPhoto.findMany({ where: ownerWhere(owner), orderBy: ORDER });
}

export const listPhotos = (productId: string) => listAssets({ productId });

// ── Group tree ────────────────────────────────────────────────────────

export type GroupNode = {
  id: string;
  name: string;
  brand: string | null;
  parentId: string | null;
  position: number;
};

export async function allGroups(): Promise<GroupNode[]> {
  return prisma.mediaGroup.findMany({
    select: { id: true, name: true, brand: true, parentId: true, position: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

/** Nearest first: [group, parent, grandparent, …]. Stops on a cycle rather than looping. */
export function chainOf(groups: GroupNode[], id: string | null) {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out: GroupNode[] = [];
  const seen = new Set<string>();
  for (let g = id ? byId.get(id) : undefined; g && !seen.has(g.id); g = g.parentId ? byId.get(g.parentId) : undefined) {
    seen.add(g.id);
    out.push(g);
  }
  return out;
}

export function pathOf(groups: GroupNode[], id: string | null) {
  return chainOf(groups, id).reverse();
}

export function subtreeOf(groups: GroupNode[], id: string) {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const g of groups) if (g.parentId === out[i] && !out.includes(g.id)) out.push(g.id);
  }
  return out;
}

// ── Sync: file names and the cover mirrored to Product.imageUrl ──────

/** Photos a product shows: nearest group first, then its ancestors, then its own. */
async function effectivePhotos(productId: string, groupId: string | null, groups: GroupNode[]) {
  const chain = chainOf(groups, groupId).map((g) => g.id);
  const [inherited, own] = await Promise.all([
    chain.length
      ? prisma.productPhoto.findMany({ where: { groupId: { in: chain }, kind: "photo" }, orderBy: ORDER })
      : Promise.resolve([]),
    prisma.productPhoto.findMany({ where: { productId, kind: "photo" }, orderBy: ORDER }),
  ]);
  inherited.sort((a, b) => chain.indexOf(a.groupId!) - chain.indexOf(b.groupId!));
  return [...inherited, ...own];
}

/**
 * Rewrites the product's own file names from its saved fields and mirrors its
 * cover to imageUrl. A product with no photos at all keeps whatever imageUrl it
 * had (spreadsheet imports set it), unless that image was the one just deleted.
 */
export async function syncPhotos(productId: string, removedUrl?: string, groups?: GroupNode[]) {
  const tree = groups ?? (await allGroups());
  const [product, assets] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, type: true, imageUrl: true, groupId: true },
    }),
    listAssets({ productId }),
  ]);
  if (!product) throw new Error("Product not found");
  const names = mediaFileNames(photoBase(product), assets);
  const photos = await effectivePhotos(productId, product.groupId, tree);
  // With nothing to show, keep only an imageUrl this feature didn't set (a spreadsheet import).
  const mirrored =
    !!product.imageUrl &&
    (product.imageUrl === removedUrl ||
      ownedUrl(product.imageUrl) ||
      (await prisma.productPhoto.count({ where: { url: product.imageUrl } })) > 0);
  const cover = photos.length ? photos[0].url : mirrored ? null : product.imageUrl;
  await prisma.$transaction([
    ...assets
      .map((asset, i) => ({ asset, name: names[i] }))
      .filter(({ asset, name }) => asset.fileName !== name)
      .map(({ asset, name }) =>
        prisma.productPhoto.update({ where: { id: asset.id }, data: { fileName: name } }),
      ),
    ...(product.imageUrl !== cover
      ? [prisma.product.update({ where: { id: productId }, data: { imageUrl: cover } })]
      : []),
  ]);
  return assets.map((asset, i) => ({ ...asset, fileName: names[i] }));
}

/**
 * Renames assets in the group (and, when `deep`, every subgroup — used after a
 * rename or move) and refreshes the cover of every product underneath.
 */
export async function syncGroup(groupId: string, opts: { deep?: boolean; removedUrl?: string } = {}) {
  const groups = await allGroups();
  if (!groups.some((g) => g.id === groupId)) return [];
  const subtree = subtreeOf(groups, groupId);
  const renamed = opts.deep ? subtree : [groupId];
  for (const id of renamed) {
    const assets = await listAssets({ groupId: id });
    const names = mediaFileNames(groupBase(pathOf(groups, id).map((g) => g.name)), assets);
    await prisma.$transaction(
      assets
        .map((asset, i) => ({ asset, name: names[i] }))
        .filter(({ asset, name }) => asset.fileName !== name)
        .map(({ asset, name }) =>
          prisma.productPhoto.update({ where: { id: asset.id }, data: { fileName: name } }),
        ),
    );
  }
  const products = await prisma.product.findMany({
    where: { groupId: { in: subtree } },
    select: { id: true },
  });
  for (const p of products) await syncPhotos(p.id, opts.removedUrl, groups);
  return listAssets({ groupId });
}

function sync(owner: Owner, removedUrl?: string) {
  return "productId" in owner
    ? syncPhotos(owner.productId, removedUrl)
    : syncGroup(owner.groupId, { removedUrl });
}

// ── Asset actions ─────────────────────────────────────────────────────

export async function addAssets(owner: Owner, inputs: AssetInput[]) {
  inputs.forEach(checkInput);
  const last = await prisma.productPhoto.findFirst({
    where: ownerWhere(owner),
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const start = (last?.position ?? -1) + 1;
  const created = await prisma.$transaction(
    inputs.map((asset, i) =>
      prisma.productPhoto.create({
        data: {
          ...ownerWhere(owner),
          kind: asset.kind === "file" ? "file" : "photo",
          url: asset.url,
          thumbUrl: asset.thumbUrl,
          tag: asset.tag?.trim() ?? "",
          originalName: asset.originalName?.slice(0, 200) ?? "",
          contentType: asset.contentType || "application/octet-stream",
          size: Math.round(asset.size),
          width: asset.width ?? null,
          height: asset.height ?? null,
          position: start + i,
        },
      }),
    ),
  );
  return { created: created.map((p) => p.id), photos: await sync(owner) };
}

export const addPhotos = (productId: string, inputs: AssetInput[]) => addAssets({ productId }, inputs);

async function ownedAsset(owner: Owner, id: string) {
  const asset = await prisma.productPhoto.findUnique({ where: { id } });
  const mine =
    asset && ("productId" in owner ? asset.productId === owner.productId : asset.groupId === owner.groupId);
  if (!asset || !mine) throw new Error("File not found");
  return asset;
}

export async function retagAsset(owner: Owner, id: string, tag: string) {
  await ownedAsset(owner, id);
  await prisma.productPhoto.update({ where: { id }, data: { tag: tag.trim().slice(0, 80) } });
  return sync(owner);
}

export async function coverAsset(owner: Owner, id: string) {
  await ownedAsset(owner, id);
  const first = await prisma.productPhoto.findFirst({
    where: ownerWhere(owner),
    orderBy: { position: "asc" },
    select: { position: true },
  });
  await prisma.productPhoto.update({ where: { id }, data: { position: (first?.position ?? 0) - 1 } });
  return sync(owner);
}

export async function removeAsset(owner: Owner, id: string) {
  const asset = await ownedAsset(owner, id);
  await prisma.productPhoto.delete({ where: { id } });
  await deleteFiles([asset.url, asset.thumbUrl]);
  return sync(owner, asset.url);
}

/** Moves a product's own asset up to its group, so every sibling SKU gets it. */
export async function shareAssetWithGroup(productId: string, id: string) {
  const asset = await ownedAsset({ productId }, id);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { groupId: true } });
  if (!product?.groupId) throw new Error("This product has no group");
  const last = await prisma.productPhoto.findFirst({
    where: { groupId: product.groupId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.productPhoto.update({
    where: { id: asset.id },
    data: { productId: null, groupId: product.groupId, position: (last?.position ?? -1) + 1 },
  });
  await syncGroup(product.groupId);
  return syncPhotos(productId);
}

/** A product whose imageUrl predates the gallery gets it as its first photo. */
export async function adoptImage(productId: string, imageUrl: string | null) {
  if (!imageUrl || imageUrl === "/file.svg") return;
  const type = /\.png(\?|$)/i.test(imageUrl)
    ? "image/png"
    : /\.webp(\?|$)/i.test(imageUrl)
      ? "image/webp"
      : "image/jpeg";
  await prisma.productPhoto.create({
    data: { productId, url: imageUrl, thumbUrl: imageUrl, tag: "main", contentType: type },
  });
  await syncPhotos(productId);
}

/** Uploads the app made but never saved (create cancelled, or add failed). */
export async function discardUploads(urls: string[]) {
  const used = await prisma.productPhoto.findMany({
    where: { OR: [{ url: { in: urls } }, { thumbUrl: { in: urls } }] },
    select: { url: true, thumbUrl: true },
  });
  const keep = new Set(used.flatMap((p) => [p.url, p.thumbUrl]));
  await deleteFiles(urls.filter((u) => !keep.has(u)));
}

export async function deleteProductFiles(productId: string) {
  const assets = await listAssets({ productId });
  return () => deleteFiles(assets.flatMap((p) => [p.url, p.thumbUrl]));
}

export async function deleteGroupFiles(groupId: string) {
  const assets = await listAssets({ groupId });
  return () => deleteFiles(assets.flatMap((p) => [p.url, p.thumbUrl]));
}
