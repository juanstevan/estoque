import "dotenv/config";
import { prisma } from "../src/lib/db";
import { composeName, splitName } from "../src/lib/photos/name";
import { syncGroup } from "../src/lib/photos/service";

async function folder(name: string, parentId: string | null, brand: string | null) {
  const found = await prisma.mediaGroup.findFirst({
    where: { name, parentId, brand },
    select: { id: true },
  });
  if (found) return found.id;
  const last = await prisma.mediaGroup.findFirst({
    where: { parentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const created = await prisma.mediaGroup.create({
    data: { name, parentId, brand, position: (last?.position ?? -1) + 1 },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const products = await prisma.product.findMany();
  const modelIds = new Set<string>();
  for (const product of products) {
    let category = product.category?.trim() ?? "";
    let model = product.model?.trim() ?? "";
    let variation = splitName(product.name, category, model).variation;
    if (!category || !model) {
      const parts = splitName(product.name);
      category = parts.category;
      model = parts.model || parts.category;
      variation = parts.variation;
    }
    const brand = product.type?.trim();
    if (!category || !model || !brand) continue;
    const name = composeName(category, model, variation);
    if (name !== product.name || category !== product.category || model !== product.model) {
      await prisma.product.update({
        where: { id: product.id },
        data: { category, model, name },
      });
    }
    const categoryId = await folder(category, null, null);
    const modelId = await folder(model, categoryId, brand);
    modelIds.add(modelId);
    if (product.groupId !== modelId) {
      const current = product.groupId
        ? await prisma.mediaGroup.findUnique({
            where: { id: product.groupId },
            select: { id: true, parentId: true },
          })
        : null;
      const stays = current?.id === modelId || current?.parentId === modelId;
      if (!stays) await prisma.product.update({ where: { id: product.id }, data: { groupId: modelId } });
    }
    const own = await prisma.productPhoto.findMany({ where: { productId: product.id } });
    const rows = own.length
      ? own
      : product.imageUrl && product.imageUrl !== "/file.svg"
        ? [
            await prisma.productPhoto.create({
              data: {
                productId: product.id,
                url: product.imageUrl,
                thumbUrl: product.imageUrl,
                tag: "main",
                contentType: /\.png(\?|$)/i.test(product.imageUrl)
                  ? "image/png"
                  : /\.webp(\?|$)/i.test(product.imageUrl)
                    ? "image/webp"
                    : "image/jpeg",
              },
            }),
          ]
        : [];
    for (const photo of rows) {
      const dup = await prisma.productPhoto.findFirst({
        where: { groupId: modelId, url: photo.url },
        select: { id: true },
      });
      if (dup) await prisma.productPhoto.delete({ where: { id: photo.id } });
      else {
        await prisma.productPhoto.update({
          where: { id: photo.id },
          data: { productId: null, groupId: modelId },
        });
      }
    }
  }
  for (const id of modelIds) await syncGroup(id);
  console.log(`folders ready: ${modelIds.size} models`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
