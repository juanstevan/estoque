import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RichText } from "@/lib/catalog/rich-text";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { caps, Files, focus, load, slug, specRows, Stock } from "../shared";
import { ProductGallery } from "./product-gallery";

type Params = { params: Promise<{ token: string; model: string }> };
const detailsText = "w-full text-[15px] font-normal text-chaleur-graphite sm:text-md [&_h1]:text-chaleur-char [&_h2]:text-chaleur-char [&_h3]:text-chaleur-char";

/** The model in the link's catalog, with where it sits; null when the link doesn't show it. */
async function find(token: string, model: string) {
  const data = await load(token);
  if (!data) return null;
  const key = `tag:${decodeURIComponent(model)}`;
  for (const category of data.categories) {
    for (const family of category.families) {
      const found = family.models.find((m) => m.key === key);
      if (found) return { data, category, family, model: found };
    }
  }
  return null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token, model } = await params;
  const hit = await find(token, model);
  return {
    title: hit ? `${hit.model.title ?? "Model"} · ${hit.data.brand}` : "Catalog",
    robots: { index: false, follow: false },
  };
}

/**
 * One model's page in a builder link: photos, name, IDs, price, specs, files and its description.
 * Everything comes from the link's catalog, already limited to what its audience may see.
 */
export default async function ModelPage({ params }: Params) {
  const { token, model } = await params;
  const hit = await find(token, model);
  if (!hit) notFound();
  const { data, category, family, model: m } = hit;
  const specs = specRows(m);
  const title = m.title ?? "";
  const brandHref = data.base;
  const categoryHref = `${brandHref}#${slug(category.name)}`;

  // Only levels the catalog has; a level without a page of its own is plain text.
  const crumbs = [
    { label: data.brand, href: brandHref },
    { label: category.name || "Other", href: categoryHref },
    ...(family.name ? [{ label: family.name, href: null }] : []),
  ];

  return (
    <main className="mx-auto max-w-[1280px] px-5 pt-5 pb-24 sm:px-8 sm:pt-8 sm:pb-28">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className={cn(caps, "flex min-w-0 items-center gap-x-2 text-chaleur-iron")}>
          <li className="shrink-0">
            <a href={categoryHref} className={cn("-m-2 inline-flex items-center p-2 hover:text-chaleur-flame", focus)} aria-label={`Back to ${category.name || "the catalog"}`}>
              <ArrowLeft className="size-3.5" aria-hidden />
            </a>
          </li>
          {/* Phones keep the level just above the product; wider screens show the whole path. */}
          {crumbs.map((crumb) => (
            <li key={crumb.label} className="flex min-w-0 shrink-0 items-center gap-x-2 max-sm:hidden max-sm:[&:nth-last-child(2)]:flex max-sm:[&:nth-last-child(2)]:shrink">
              {crumb.href ? (
                <a href={crumb.href} className={cn("truncate hover:text-chaleur-flame", focus)}>
                  {crumb.label}
                </a>
              ) : (
                <span className="truncate">{crumb.label}</span>
              )}
              <span aria-hidden className="text-chaleur-stone">
                /
              </span>
            </li>
          ))}
          <li aria-current="page" className="min-w-0 truncate text-chaleur-char">
            {title || "Model"}
          </li>
        </ol>
      </nav>

      {/* Phones read title, photos, then the rest; tablets and up put the photos on the left. */}
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-6 sm:mt-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:grid-rows-[auto_1fr] lg:gap-x-14">
        <header className="md:col-start-2 md:row-start-1">
          {family.name && <p className={cn(caps, "text-chaleur-iron")}>{family.name}</p>}
          {title && <h1 className="mt-2 font-chaleur-display text-[clamp(32px,5.5vw,56px)] leading-[0.95] break-words">{title}</h1>}
          {m.ids && (
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-normal text-chaleur-graphite">
              <span className={cn(caps, "text-chaleur-iron")}>{m.ids.includes("·") ? "IDs" : "ID"}</span>
              <span className="tabular-nums tracking-[0.04em]">{m.ids}</span>
            </p>
          )}
        </header>

        <div className="md:col-start-1 md:row-span-2 md:row-start-1">
          <ProductGallery images={m.images} title={title} />
        </div>

        <div className="flex flex-col md:col-start-2 md:row-start-2">
          <div className="flex items-end justify-between gap-4 border-y-2 border-chaleur-char py-5">
            {m.price ? (
              <p>
                <span className={cn(caps, "block text-chaleur-iron")}>{m.price.from ? "From" : "Builder price"}</span>
                <span className="mt-1.5 block text-[30px] leading-none font-semibold tabular-nums sm:text-[34px]">{formatMoney(m.price.amount)}</span>
                {m.price.from && <span className="mt-2 block text-xs font-normal text-chaleur-iron">Price varies by option</span>}
              </p>
            ) : (
              <span />
            )}
            <Stock inStock={m.inStock} />
          </div>

          {specs.length > 0 && (
            <section aria-label="Specifications" className="mt-6">
              <h2 className={cn(caps, "text-chaleur-iron")}>Specifications</h2>
              <dl className="mt-2 divide-y divide-chaleur-stone border-y border-chaleur-stone">
                {specs.map((row) => (
                  <div key={row.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-4 py-3">
                    <dt className="text-sm font-normal text-chaleur-iron">{row.label}</dt>
                    <dd className="text-right text-sm font-normal text-chaleur-char tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {(m.dimensions || m.cutout) && <p className="mt-2 text-xs text-chaleur-steel">Width × depth × height, in inches.</p>}
            </section>
          )}

          {m.files.length > 0 && (
            <section aria-label="Downloads" className="mt-6">
              <h2 className={cn(caps, "mb-2 text-chaleur-iron")}>Downloads</h2>
              <Files files={m.files} />
            </section>
          )}
        </div>
      </div>

      {(category.description || family.description || m.description) && (
        <section aria-label="Product description" className="mt-14 w-full border-t-2 border-chaleur-char pt-8 sm:mt-20">
          <div className="w-full space-y-8">
            {category.description && <RichText doc={category.description} className={detailsText} />}
            {family.description && <RichText doc={family.description} className={detailsText} />}
            {m.description && <RichText doc={m.description} className={detailsText} />}
          </div>
        </section>
      )}
    </main>
  );
}
