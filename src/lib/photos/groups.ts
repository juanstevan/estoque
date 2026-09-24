import { prisma } from "@/lib/db";
import { composeName, splitName } from "./name";
import {
  adoptImage,
  allGroups,
  chainOf,
  deleteGroupFiles,
  listAssets,
  pathOf,
  subtreeOf,
  syncGroup,
  syncPhotos,
} from "./service";

export async function listGroups() {
  const [groups, counts] = await Promise.all([
    prisma.mediaGroup.findMany({
      select: {
        id: true,
        name: true,
        brand: true,
        parentId: true,
        position: true,
        _count: { select: { products: true, assets: true } },
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    prisma.product.count({ where: { groupId: null } }),
  ]);
  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      brand: g.brand,
      parentId: g.parentId,
      products: g._count.products,
      assets: g._count.assets,
    })),
    ungrouped: counts,
  };
}

async function nextPosition(parentId: string | null) {
  const last = await prisma.mediaGroup.findFirst({
    where: { parentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

export async function createGroup(name: string, parentId: string | null, brand: string | null = null) {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new Error("Name the group");
  if (parentId && !(await prisma.mediaGroup.findUnique({ where: { id: parentId } }))) {
    throw new Error("Parent group not found");
  }
  return prisma.mediaGroup.create({
    data: { name: clean, brand: brand?.trim() || null, parentId, position: await nextPosition(parentId) },
    select: { id: true },
  });
}

async function ensureGroup(name: string, parentId: string | null, brand: string | null) {
  const found = await prisma.mediaGroup.findFirst({
    where: { name, parentId, brand },
    select: { id: true },
  });
  if (found) return found.id;
  return (await createGroup(name, parentId, brand)).id;
}

/** Brand, category, and model are required folders. A subfolder under that model is kept. */
export async function placeProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { type: true, category: true, model: true, groupId: true },
  });
  if (!product?.type?.trim() || !product.category?.trim() || !product.model?.trim()) return;
  const brandId = await ensureGroup(product.type.trim(), null, null);
  const categoryId = await ensureGroup(product.category.trim(), brandId, null);
  const modelId = await ensureGroup(product.model.trim(), categoryId, null);
  const groups = await allGroups();
  const under = (groupId: string | null, ancestor: string) => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    for (let g = groupId ? byId.get(groupId) : undefined; g; g = g.parentId ? byId.get(g.parentId) : undefined) {
      if (g.id === ancestor) return true;
    }
    return false;
  };
  if (under(product.groupId, modelId)) return modelId;
  await assignProducts([id], modelId);
  return modelId;
}

/** Puts this product's own photos on its model folder, once per file. */
export async function liftOwnPhotos(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { groupId: true, imageUrl: true },
  });
  if (!product?.groupId) return;
  const groups = await allGroups();
  const depth = pathOf(groups, product.groupId).length;
  if (depth < 3) return;
  const targetId = product.groupId;
  if (
    !((await prisma.productPhoto.count({ where: { productId } })) > 0) &&
    product.imageUrl &&
    product.imageUrl !== "/file.svg"
  ) {
    await adoptImage(productId, product.imageUrl);
  }
  const own = await prisma.productPhoto.findMany({ where: { productId } });
  for (const photo of own) {
    const dup = await prisma.productPhoto.findFirst({
      where: { groupId: targetId, url: photo.url },
      select: { id: true },
    });
    if (dup) await prisma.productPhoto.delete({ where: { id: photo.id } });
    else {
      await prisma.productPhoto.update({
        where: { id: photo.id },
        data: { productId: null, groupId: targetId },
      });
    }
  }
  await syncGroup(targetId);
  await syncPhotos(productId);
}

export async function renameGroup(id: string, name: string) {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new Error("Name the group");
  const group = await prisma.mediaGroup.findUnique({
    where: { id },
    select: { name: true, brand: true, parentId: true, parent: { select: { name: true, parentId: true } } },
  });
  if (!group || group.name === clean) return;
  await prisma.mediaGroup.update({ where: { id }, data: { name: clean } });
  const path = pathOf(await allGroups(), id);
  const brand = path[0]?.name;
  const categoryName = path[1]?.name;
  const products =
    path.length === 1
      ? await prisma.product.findMany({ where: { type: group.name } })
      : path.length === 2
        ? await prisma.product.findMany({ where: { category: group.name, type: brand } })
        : path.length === 3
          ? await prisma.product.findMany({
              where: { model: group.name, category: categoryName, type: brand },
            })
          : [];
  for (const product of products) {
    const variation = splitName(product.name, product.category, product.model).variation;
    const type = path.length === 1 ? clean : product.type;
    const category = path.length === 2 ? clean : product.category;
    const model = path.length === 3 ? clean : product.model;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        type,
        category,
        model,
        name: composeName(category ?? "", model ?? "", variation),
      },
    });
  }
  await syncGroup(id, { deep: true });
}

export async function moveGroup(id: string, parentId: string | null) {
  const groups = await allGroups();
  if (parentId && subtreeOf(groups, id).includes(parentId)) {
    throw new Error("A group can't go inside one of its own subgroups");
  }
  await prisma.mediaGroup.update({
    where: { id },
    data: { parentId, position: await nextPosition(parentId) },
  });
  await syncGroup(id, { deep: true });
}

/** Subgroups and products move up to the parent; the group's own files are deleted. */
export async function deleteGroup(id: string) {
  const group = await prisma.mediaGroup.findUnique({ where: { id }, select: { parentId: true } });
  if (!group) return;
  const moved = await prisma.product.findMany({ where: { groupId: id }, select: { id: true } });
  const dropFiles = await deleteGroupFiles(id);
  await prisma.$transaction([
    prisma.mediaGroup.updateMany({ where: { parentId: id }, data: { parentId: group.parentId } }),
    prisma.product.updateMany({ where: { groupId: id }, data: { groupId: group.parentId } }),
    prisma.mediaGroup.delete({ where: { id } }),
  ]);
  await dropFiles();
  if (group.parentId) {
    await syncGroup(group.parentId, { deep: true });
  } else {
    const groups = await allGroups();
    for (const p of moved) await syncPhotos(p.id, undefined, groups);
    for (const g of groups.filter((g) => g.parentId === null)) await syncGroup(g.id, { deep: true });
  }
}

export async function assignProducts(productIds: string[], groupId: string | null) {
  if (groupId && !(await prisma.mediaGroup.findUnique({ where: { id: groupId } }))) {
    throw new Error("Group not found");
  }
  await prisma.product.updateMany({ where: { id: { in: productIds } }, data: { groupId } });
  const groups = await allGroups();
  for (const id of productIds) await syncPhotos(id, undefined, groups);
}

/** What a product (or group) inherits from the groups above it, nearest first. */
export async function inheritedAssets(groupId: string | null, skipSelf = false) {
  const groups = await allGroups();
  const chain = chainOf(groups, groupId).slice(skipSelf ? 1 : 0);
  if (!chain.length) return [];
  const assets = await prisma.productPhoto.findMany({
    where: { groupId: { in: chain.map((g) => g.id) } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const names = new Map(chain.map((g) => [g.id, g.name]));
  const rank = new Map(chain.map((g, i) => [g.id, i]));
  return assets
    .sort((a, b) => rank.get(a.groupId!)! - rank.get(b.groupId!)!)
    .map((a) => ({ ...a, groupName: names.get(a.groupId!) ?? "" }));
}

export async function groupPath(groupId: string | null) {
  if (!groupId) return [];
  return pathOf(await allGroups(), groupId).map((g) => ({ id: g.id, name: g.name }));
}

export async function groupDetail(id: string) {
  const group = await prisma.mediaGroup.findUnique({
    where: { id },
    select: { id: true, name: true, parentId: true },
  });
  if (!group) return null;
  const [path, assets, inherited, products, pool] = await Promise.all([
    groupPath(id),
    listAssets({ groupId: id }),
    inheritedAssets(id, true),
    prisma.product.findMany({
      where: { groupId: id },
      select: { id: true, code: true, name: true, sku: true, type: true },
      orderBy: { name: "asc" },
    }),
    group.parentId
      ? prisma.product.findMany({
          where: { groupId: group.parentId },
          select: { id: true, code: true, name: true, sku: true, type: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  return { ...group, path, assets, inherited, products, pool };
}
