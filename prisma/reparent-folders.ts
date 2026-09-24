import "dotenv/config";
import { prisma } from "../src/lib/db";

/** Brand > Category > Model. Existing model folders keep their photos and products. */
async function folder(name: string, parentId: string | null) {
  const found = await prisma.mediaGroup.findFirst({
    where: { name, parentId },
    select: { id: true },
  });
  if (found) return found.id;
  const last = await prisma.mediaGroup.findFirst({
    where: { parentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const created = await prisma.mediaGroup.create({
    data: { name, parentId, position: (last?.position ?? -1) + 1 },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const groups = await prisma.mediaGroup.findMany();
  const brandIds = new Set<string>();
  let moved = 0;
  for (const model of groups) {
    if (!model.brand || !model.parentId) continue;
    const category = groups.find((group) => group.id === model.parentId);
    if (!category) continue;
    const brandId = await folder(model.brand, null);
    brandIds.add(brandId);
    const categoryId = await folder(category.name, brandId);
    await prisma.mediaGroup.update({
      where: { id: model.id },
      data: { parentId: categoryId, brand: null },
    });
    moved += 1;
  }
  const roots = await prisma.mediaGroup.findMany({
    where: { parentId: null },
    select: { id: true, _count: { select: { children: true } } },
  });
  const empty = roots.filter((group) => !brandIds.has(group.id) && group._count.children === 0);
  if (empty.length) {
    await prisma.mediaGroup.deleteMany({ where: { id: { in: empty.map((group) => group.id) } } });
  }
  console.log(`reparented ${moved} models, removed ${empty.length} old category folders`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
