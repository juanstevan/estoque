/**
 * Who sees what in a catalog. Internal: only this app. Partners: builder links. Public: everyone.
 * Files keep theirs on ProductPhoto.visibility; model fields keep theirs as JSON on the Tag
 * (or on the product when it has no Tag).
 */
export const VISIBILITY = ["internal", "partners", "public"] as const;
export type Visibility = (typeof VISIBILITY)[number];

const RANK: Record<Visibility, number> = { internal: 0, partners: 1, public: 2 };

/** The app sees everything, a partner link sees partner and public items, a public link only public ones. */
export function visibleTo(audience: Visibility, item: Visibility) {
  return RANK[item] >= RANK[audience];
}

/** The eye cycles closed → half → open → closed. */
export function nextVisibility(current: Visibility): Visibility {
  return VISIBILITY[(VISIBILITY.indexOf(current) + 1) % VISIBILITY.length]!;
}

export const MODEL_FIELDS = ["title", "id", "price", "dimensions", "cutout", "weight"] as const;
export type CatalogField = (typeof MODEL_FIELDS)[number] | "variant";

/** Until someone changes it: the B2B price is for builders, everything else for anyone. */
export const FIELD_DEFAULT: Record<CatalogField, Visibility> = {
  title: "public",
  id: "public",
  price: "partners",
  dimensions: "public",
  cutout: "public",
  weight: "public",
  variant: "public",
};

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === "string" && (VISIBILITY as readonly string[]).includes(value);
}

export function isCatalogField(value: unknown): value is CatalogField {
  return value === "variant" || (MODEL_FIELDS as readonly unknown[]).includes(value);
}

export function readFields(json: string | null | undefined): Partial<Record<CatalogField, Visibility>> {
  try {
    const parsed: unknown = JSON.parse(json || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([field, value]) => isCatalogField(field) && isVisibility(value)),
    ) as Partial<Record<CatalogField, Visibility>>;
  } catch {
    return {};
  }
}

export function fieldVisibility(json: string | null | undefined, field: CatalogField): Visibility {
  return readFields(json)[field] ?? FIELD_DEFAULT[field];
}
