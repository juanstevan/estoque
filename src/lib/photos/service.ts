import { unlink } from "fs/promises";
import path from "path";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { FILE_MAX_BYTES, PHOTO_TYPES, mediaFileNames, photoBase } from "./name";

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

export type Owner = { productId: string };

function ownerWhere(owner: Owner) {
  return { productId: owner.productId };
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

// ── Sync: file names and the cover mirrored to Product.imageUrl ──────

/**
 * Rewrites the product's own file names from its saved fields and mirrors its
 * cover to imageUrl. A product with no photos at all keeps whatever imageUrl it
 * had (spreadsheet imports set it), unless that image was the one just deleted.
 */
export async function syncPhotos(productId: string, removedUrl?: string) {
  const [product, assets] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, type: true, imageUrl: true },
    }),
    listAssets({ productId }),
  ]);
  if (!product) throw new Error("Product not found");
  const names = mediaFileNames(photoBase(product), assets);
  const photos = assets.filter((asset) => asset.kind === "photo");
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

function sync(owner: Owner, removedUrl?: string) {
  return syncPhotos(owner.productId, removedUrl);
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
  if (!asset || asset.productId !== owner.productId) throw new Error("File not found");
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
