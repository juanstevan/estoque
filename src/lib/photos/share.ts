import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/** One link per scope; the all-products link is the row with productId null. */
export async function shareToken(productId: string | null, groupId: string | null = null) {
  const existing = await prisma.photoShare.findFirst({ where: { productId, groupId } });
  if (existing) return existing.token;
  const token = randomBytes(18).toString("base64url");
  await prisma.photoShare.create({ data: { token, productId, groupId } });
  return token;
}

function absolute(url: string, origin: string) {
  return /^https?:\/\//.test(url) ? url : `${origin}${url}`;
}

export async function sharedPhotos(token: string, origin: string) {
  const share = await prisma.photoShare.findUnique({ where: { token } });
  if (!share) return null;
  if (share.groupId) {
    const [group, assets, members] = await Promise.all([
      prisma.mediaGroup.findUnique({ where: { id: share.groupId }, select: { id: true, name: true, brand: true } }),
      prisma.productPhoto.findMany({
        where: { groupId: share.groupId, kind: "photo" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
      prisma.product.findMany({
        where: { groupId: share.groupId },
        select: { sku: true },
        orderBy: { name: "asc" },
      }),
    ]);
    if (!group) return null;
    return {
      scope: "group" as const,
      products: [
        {
          id: group.id,
          name: group.name,
          sku: members.map((m) => m.sku).join(", "),
          brand: group.brand ?? "",
          photos: assets.map((photo) => ({
            id: photo.id,
            tag: photo.tag,
            fileName: photo.fileName,
            width: photo.width,
            height: photo.height,
            size: photo.size,
            contentType: photo.contentType,
            url: absolute(photo.url, origin),
            thumbUrl: absolute(photo.thumbUrl, origin),
          })),
        },
      ],
    };
  }
  const products = await prisma.product.findMany({
    where: share.productId ? { id: share.productId } : { photos: { some: {} } },
    select: {
      id: true,
      name: true,
      sku: true,
      type: true,
      photos: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return {
    scope: share.productId ? ("product" as const) : ("all" as const),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      brand: p.type ?? "Other",
      photos: p.photos.map((photo) => ({
        id: photo.id,
        tag: photo.tag,
        fileName: photo.fileName,
        width: photo.width,
        height: photo.height,
        size: photo.size,
        contentType: photo.contentType,
        url: absolute(photo.url, origin),
        thumbUrl: absolute(photo.thumbUrl, origin),
      })),
    })),
  };
}

export type SharedPhotos = NonNullable<Awaited<ReturnType<typeof sharedPhotos>>>;
