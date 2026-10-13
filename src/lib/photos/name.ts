export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const PHOTO_MAX_BYTES = 100 * 1024 * 1024;
/** Manuals, spec sheets, videos and anything else. Videos are the reason it's this big. */
export const FILE_MAX_BYTES = 500 * 1024 * 1024;

const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Name words kept after the brand. Long marketplace titles would otherwise run on forever. */
const NAME_WORDS = 6;
const GROUP_WORDS = 8;

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

/** "Chaleur › Legend › Legend 4 (32")" → chaleur_legend_4_32in. A word already said is not repeated. */
export function groupBase(path: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of path.flatMap(words)) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out.slice(0, GROUP_WORDS).join("_") || "group";
}

export function composeName(category: string, model: string, variation: string) {
  return [category, model, variation].map((part) => part.trim()).filter(Boolean).join(" ");
}

/** QuickBooks item title. The app name stays category + family + variant. */
export function quickBooksName(code: string, name: string) {
  return `${code.trim()} - ${name.trim()}`.slice(0, 100).trimEnd();
}

/**
 * A name is category + family + variant. The stored category and family win while the name still
 * starts with them (either may be several words); otherwise the name's first two words are them.
 */
export function splitName(name: string, category?: string | null, model?: string | null) {
  const cat = category?.trim() ?? "";
  const mod = model?.trim() ?? "";
  const prefix = `${cat} ${mod}`;
  if (cat && mod && `${name.trim()} `.startsWith(`${prefix} `)) {
    return { category: cat, model: mod, variation: name.trim().slice(prefix.length).trim() };
  }
  const words = name.replace(/^\s*\d+\s*-\s*/, "").trim().split(/\s+/).filter(Boolean);
  return {
    category: words[0] ?? "",
    model: words[1] ?? "",
    variation: words.slice(2).join(" "),
  };
}

export function photoTag(tag: string) {
  return words(tag).join("_");
}

export type NamedAsset = {
  tag: string;
  kind?: string;
  contentType: string;
  originalName?: string;
};

export function assetExt(asset: NamedAsset) {
  if (asset.kind !== "file") return PHOTO_TYPES[asset.contentType] ?? "jpg";
  const fromName = asset.originalName?.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  return fromName ?? FILE_TYPES[asset.contentType] ?? "bin";
}

function defaultTag(asset: NamedAsset) {
  if (asset.kind !== "file") return "photo";
  return photoTag((asset.originalName ?? "").replace(/\.[a-z0-9]{1,8}$/i, "")) || "file";
}

/** File names in gallery order; a repeated tag gets _2, _3… */
export function mediaFileNames(base: string, assets: NamedAsset[]) {
  const seen = new Map<string, number>();
  return assets.map((asset) => {
    const stem = [base, photoTag(asset.tag) || defaultTag(asset)].join("_");
    const n = (seen.get(stem) ?? 0) + 1;
    seen.set(stem, n);
    return `${n > 1 ? `${stem}_${n}` : stem}.${assetExt(asset)}`;
  });
}

export function photoFileNames(product: { type: string | null; name: string }, assets: NamedAsset[]) {
  return mediaFileNames(photoBase(product), assets);
}
