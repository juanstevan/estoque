export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const PHOTO_MAX_BYTES = 100 * 1024 * 1024;

/** Name words kept after the brand. Long marketplace titles would otherwise run on forever. */
const NAME_WORDS = 6;

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/(\d)\s*(''|"|”|″)/g, "$1in")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * brand (Type field) + product type (1st name word) + model (2nd) + the rest of
 * the name. The "68 - " catalog prefix is dropped, and so is the brand when the
 * name already says it (Type "Door" on "Trash Door No. 545").
 */
export function photoBase(product: { type: string | null; name: string }) {
  const name = words(product.name.replace(/^\s*\d+\s*-\s*/, "")).slice(0, NAME_WORDS);
  const brand = words(product.type ?? "").filter((w) => !name.includes(w));
  return [...brand, ...name].join("_") || "product";
}

export function photoTag(tag: string) {
  return words(tag).join("_");
}

/** File names in gallery order; a repeated tag gets _2, _3… */
export function photoFileNames(
  product: { type: string | null; name: string },
  photos: { tag: string; contentType: string }[],
) {
  const base = photoBase(product);
  const seen = new Map<string, number>();
  return photos.map((photo) => {
    const stem = [base, photoTag(photo.tag) || "photo"].join("_");
    const n = (seen.get(stem) ?? 0) + 1;
    seen.set(stem, n);
    const ext = PHOTO_TYPES[photo.contentType] ?? "jpg";
    return `${n > 1 ? `${stem}_${n}` : stem}.${ext}`;
  });
}
