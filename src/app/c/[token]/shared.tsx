import { cache } from "react";
import { ArrowDownToLine } from "lucide-react";
import { brandLinkToken, sharedCatalog, type SharedFile, type SharedModel } from "@/lib/catalog/service";
import { cn } from "@/lib/utils";

/**
 * One read per request, shared by the layout, the page and their metadata. The key is a link's
 * code (/c/<token>) or a brand (/price/<brand>); `base` is the address the link's pages live under.
 */
export const load = cache(async (key: string) => {
  const byToken = await sharedCatalog(key);
  if (byToken) return { ...byToken, base: `/c/${key}` };
  const token = await brandLinkToken(key);
  const byBrand = token ? await sharedCatalog(token) : null;
  return byBrand ? { ...byBrand, base: `/price/${key.toLowerCase()}` } : null;
});

export function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

/** A model's own page inside the same link: <base>/<Tag id>. */
export function modelHref(base: string, model: SharedModel) {
  return `${base}/${encodeURIComponent(model.key.replace(/^tag:/, ""))}`;
}

export const caps = "text-[11px] font-normal tracking-[0.12em] uppercase";
export const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chaleur-flame";

export function specRows(m: SharedModel) {
  return [
    { label: "Dimensions", value: m.dimensions },
    { label: "Cut-out", value: m.cutout },
    { label: "Weight", value: m.weight },
  ].filter((row) => row.value);
}

export function Stock({ inStock }: { inStock: boolean }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-xs font-normal", inStock ? "text-chaleur-good" : "text-chaleur-warn")}>
      <span className={cn("size-1.5 rounded-full", inStock ? "bg-chaleur-good" : "bg-chaleur-warn")} aria-hidden />
      {inStock ? "In stock" : "Out of stock"}
    </p>
  );
}

export function Files({ files, className }: { files: SharedFile[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {files.map((file) => (
        <li key={file.url}>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            download={file.fileName || undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[2px] border border-chaleur-stone bg-white px-2.5 py-1.5 text-xs font-normal text-chaleur-graphite transition-colors duration-200 hover:border-chaleur-char hover:text-chaleur-char",
              focus,
            )}
          >
            <ArrowDownToLine className="size-3.5" aria-hidden />
            {file.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
