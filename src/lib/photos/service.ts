import { unlink } from "fs/promises";
import path from "path";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { PHOTO_TYPES, photoFileNames } from "./name";

export type PhotoInput = {
  url: string;
  thumbUrl: string;
  tag?: string;
  contentType: string;
  size: number;
  width?: number | null;
  height?: number | null;
};

/** Vercel may prefix the variable when the store is connected (e.g. `photos_BLOB_READ_WRITE_TOKEN`). */
export function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => k.endsWith("BLOB_READ_WRITE_TOKEN"));
  return key ? process.env[key] : undefined;
}

export function photoStorage() {
  return blobToken() ? "blob" : process.env.VERCEL ? "none" : "local";
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

/** Only files this feature uploaded; /catalog images ship with the app. */
async function deleteFiles(urls: string[]) {
  const owned = [...new Set(urls)].filter(ownedUrl);
  const blobs = owned.filter((u) => !u.startsWith(LOCAL_DIR));
  const local = owned.filter((u) => u.startsWith(LOCAL_DIR));
  await Promise.allSettled([
    blobs.length ? del(blobs, { token: blobToken() }) : Promise.resolve(),
    ...local.map((u) => unlink(path.join(process.cwd(), "public", u))),
  ]);
}

function checkInput(photo: PhotoInput) {
  if (!ownedUrl(photo.url) || !ownedUrl(photo.thumbUrl)) {
    throw new Error("Photos must be uploaded through the product card");
  }
  if (!PHOTO_TYPES[photo.contentType]) throw new Error("Unsupported photo type");
}

export async function listPhotos(productId: string) {
  return prisma.productPhoto.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Rewrites every file name from the saved product fields and mirrors the cover
 * to imageUrl. A product without photos keeps whatever imageUrl it had
 * (spreadsheet imports set it), unless that image was the one just deleted.
 */
export async function syncPhotos(productId: string, removedUrl?: string) {
  const [product, photos] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { name: true, type: true, imageUrl: true } }),
    listPhotos(productId),
  ]);
  if (!product) throw new Error("Product not found");
  const names = photoFileNames(product, photos);
  const cover = photos.length
    ? photos[0].url
    : product.imageUrl === removedUrl
      ? null
      : product.imageUrl;
  await prisma.$transaction([
    ...photos
      .map((photo, i) => ({ photo, name: names[i] }))
      .filter(({ photo, name }) => photo.fileName !== name)
      .map(({ photo, name }) =>
        prisma.productPhoto.update({ where: { id: photo.id }, data: { fileName: name } }),
      ),
    ...(product.imageUrl !== cover
      ? [prisma.product.update({ where: { id: productId }, data: { imageUrl: cover } })]
      : []),
  ]);
  return photos.map((photo, i) => ({ ...photo, fileName: names[i] }));
}

export async function addPhotos(productId: string, inputs: PhotoInput[]) {
  inputs.forEach(checkInput);
  const last = await prisma.productPhoto.findFirst({
    where: { productId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const start = (last?.position ?? -1) + 1;
  const created = await prisma.$transaction(
    inputs.map((photo, i) =>
      prisma.productPhoto.create({
        data: {
          productId,
          url: photo.url,
          thumbUrl: photo.thumbUrl,
          tag: photo.tag?.trim() ?? "",
          contentType: photo.contentType,
          size: Math.round(photo.size),
          width: photo.width ?? null,
          height: photo.height ?? null,
          position: start + i,
        },
      }),
    ),
  );
  return { created: created.map((p) => p.id), photos: await syncPhotos(productId) };
}

async function owned(productId: string, photoId: string) {
  const photo = await prisma.productPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.productId !== productId) throw new Error("Photo not found");
  return photo;
}

export async function retagPhoto(productId: string, photoId: string, tag: string) {
  await owned(productId, photoId);
  await prisma.productPhoto.update({ where: { id: photoId }, data: { tag: tag.trim().slice(0, 80) } });
  return syncPhotos(productId);
}

export async function coverPhoto(productId: string, photoId: string) {
  await owned(productId, photoId);
  const first = await prisma.productPhoto.findFirst({
    where: { productId },
    orderBy: { position: "asc" },
    select: { position: true },
  });
  await prisma.productPhoto.update({
    where: { id: photoId },
    data: { position: (first?.position ?? 0) - 1 },
  });
  return syncPhotos(productId);
}

export async function removePhoto(productId: string, photoId: string) {
  const photo = await owned(productId, photoId);
  await prisma.productPhoto.delete({ where: { id: photoId } });
  await deleteFiles([photo.url, photo.thumbUrl]);
  return syncPhotos(productId, photo.url);
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

/** Uploads the card made but never saved (create cancelled, or add failed). */
export async function discardUploads(urls: string[]) {
  const used = await prisma.productPhoto.findMany({
    where: { OR: [{ url: { in: urls } }, { thumbUrl: { in: urls } }] },
    select: { url: true, thumbUrl: true },
  });
  const keep = new Set(used.flatMap((p) => [p.url, p.thumbUrl]));
  await deleteFiles(urls.filter((u) => !keep.has(u)));
}

export async function deleteProductFiles(productId: string) {
  const photos = await listPhotos(productId);
  return () => deleteFiles(photos.flatMap((p) => [p.url, p.thumbUrl]));
}
