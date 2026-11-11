import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { publishedBrands, sharedCatalog } from "@/lib/catalog/service";
import { cn } from "@/lib/utils";
import logo from "./brand/logo.svg";
import hero from "./brand/hero.jpg";
import { CatalogFooter, CatalogFrame } from "./catalog-layout";
import { caps, focus, wording, type Kind } from "./shared";

export function indexMetadata(kind: Kind): Metadata {
  return {
    title: `Chaleur · ${wording(kind).name}`,
    robots: kind === "catalog" ? undefined : { index: false, follow: false },
  };
}

/**
 * /price and /catalog: one address for every brand. Each brand with an active builder link gets a
 * card leading to its own page; what a card shows follows the same audience rules as that page.
 */
export async function BrandIndex({ kind }: { kind: "price" | "catalog" }) {
  const words = wording(kind);
  const brands = (
    await Promise.all(
      (await publishedBrands()).map(async (b) => {
        const data = await sharedCatalog(b.token, { public: kind === "catalog" });
        const models = data?.categories.flatMap((c) => c.families.flatMap((f) => f.models)) ?? [];
        return data && models.length
          ? {
              ...b,
              company: data.company,
              categories: data.categories.map((c) => c.name || "Other"),
              models: models.length,
              image: models.find((m) => m.images.length)?.images[0]?.src ?? null,
            }
          : null;
      }),
    )
  ).filter((b) => b !== null);
  const company = brands[0]?.company ?? { name: "Chaleur Manufacturing Co.", phone: null };

  return (
    <CatalogFrame>
      <header className="border-b border-chaleur-stone bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-6 px-5 sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt="Chaleur" className="h-6 w-auto sm:h-7" />
          <span className={cn(caps, "text-chaleur-iron")}>{words.name}</span>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-chaleur-char text-white">
        <Image src={hero} alt="" fill sizes="100vw" placeholder="blur" loading="eager" fetchPriority="high" className="-z-10 object-cover object-[65%_center] opacity-70" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-chaleur-char via-chaleur-char/85 to-chaleur-char/20" />
        <div className="mx-auto max-w-[1280px] px-5 pt-24 pb-12 sm:px-8 sm:pt-32 sm:pb-16">
          <p className={cn(caps, "flex items-center gap-3 text-chaleur-flame")}>
            <span className="h-px w-8 bg-chaleur-flame" aria-hidden />
            {words.name} · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
          <h1 className="mt-5 max-w-[14ch] font-chaleur-display text-[clamp(40px,7vw,88px)] leading-[0.9]">
            {kind === "catalog" ? "Outdoor kitchens, built to last" : "Builder price list"}
          </h1>
          <p className="mt-5 max-w-[48ch] text-md text-white/70 sm:text-lg">
            {kind === "catalog"
              ? "Choose a brand to see every model, with photos, sizes and prices."
              : "Choose a brand to see every model, with specs, cut-outs, install files and builder prices."}
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1280px] px-5 py-16 sm:px-8 sm:py-20">
        <h2 className={cn(caps, "border-b-2 border-chaleur-char pb-4 text-chaleur-iron")}>
          {brands.length} {brands.length === 1 ? "brand" : "brands"}
        </h2>
        {!brands.length && <p className="pt-10 text-md text-chaleur-iron">Nothing to show yet.</p>}
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <a
              key={b.slug}
              href={`/${kind}/${b.slug}`}
              className={cn(
                "group flex flex-col overflow-hidden rounded-[2px] border border-chaleur-stone bg-white transition-[border-color,box-shadow] duration-200 hover:border-chaleur-steel hover:shadow-[0_18px_40px_-24px_rgba(22,21,20,0.35)]",
                focus,
              )}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-white">
                {b.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image} alt="" className="size-full object-contain p-8 transition-transform duration-500 group-hover:scale-[1.03]" />
                )}
              </div>
              <div className="flex flex-1 flex-col border-t border-chaleur-stone p-5 sm:p-6">
                <h3 className="font-chaleur-display text-[28px] leading-none">{b.brand}</h3>
                <p className="mt-3 line-clamp-2 text-sm font-normal text-chaleur-graphite">{b.categories.join(" · ")}</p>
                <div className="mt-auto flex items-center justify-between gap-4 pt-6">
                  <span className={cn(caps, "text-chaleur-iron tabular-nums")}>
                    {b.models} {b.models === 1 ? "model" : "models"}
                  </span>
                  <span className={cn(caps, "inline-flex items-center gap-1 text-chaleur-char transition-colors group-hover:text-chaleur-flame")}>
                    View
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </main>

      <CatalogFooter company={company} note={`${words.note} Sizes are width × depth × height in inches.`} />
    </CatalogFrame>
  );
}
