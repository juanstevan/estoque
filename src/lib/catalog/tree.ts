/**
 * Brand › category › family › model, from the products' own Brand, Category, Family and Tag.
 * A Tag is a model; a product without a Tag is a model of its own. Used by the Media tab and
 * by shared catalogs, so both group products the same way.
 */
export type TreeProduct = {
  id: string;
  name: string;
  type: string | null;
  category?: string | null;
  model?: string | null;
  tagId?: string | null;
  tag?: { name: string } | null;
};

export type Model<P> = { key: string; name: string; tagId: string | null; products: P[] };
export type Family<P> = { key: string; name: string; products: P[]; models: Model<P>[] };
export type Category<P> = { key: string; name: string; products: P[]; families: Family<P>[] };
export type Brand<P> = { key: string; name: string; products: P[]; categories: Category<P>[] };

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return [...map];
}

/** Natural order ("Legend 4" before "Legend 10"); the unnamed group goes last. */
export function byName<T extends { name: string }>(list: T[]) {
  return list.sort((a, b) =>
    a.name === "" ? 1 : b.name === "" ? -1 : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

const text = (value?: string | null) => value?.trim() ?? "";

export function modelKey(product: TreeProduct) {
  return product.tagId ? `tag:${product.tagId}` : `product:${product.id}`;
}

export function buildTree<P extends TreeProduct>(products: P[]): Brand<P>[] {
  const brands = groupBy(products, (p) => text(p.type)).map(([brand, inBrand]) => ({
    key: brand,
    name: brand,
    products: inBrand,
    categories: byName(
      groupBy(inBrand, (p) => text(p.category)).map(([category, inCategory]) => ({
        key: category,
        name: category,
        products: inCategory,
        families: byName(
          groupBy(inCategory, (p) => text(p.model)).map(([family, inFamily]) => ({
            key: family,
            name: family,
            products: inFamily,
            models: byName(
              groupBy(inFamily, modelKey).map(([key, variants]) => ({
                key,
                name: variants[0]!.tag?.name ?? variants[0]!.name,
                tagId: variants[0]!.tagId ?? null,
                products: byName(variants),
              })),
            ),
          })),
        ),
      })),
    ),
  }));
  // Biggest brands first; products without a brand last.
  return brands.sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : b.products.length - a.products.length));
}
