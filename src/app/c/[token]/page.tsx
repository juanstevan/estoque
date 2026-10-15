import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { SharedModel } from "@/lib/catalog/service";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ModelGallery } from "./gallery";
import hero from "./brand/hero.jpg";
import { caps, Files, focus, load, modelHref, slug, specRows, Stock } from "./shared";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const data = await load((await params).token);
  return {
    title: data ? `${data.brand} · Builder catalog` : "Catalog",
    robots: { index: false, follow: false },
  };
}

/** A brand's catalog for whoever holds the link. Built on the server from fields and files cleared for it. */
export default async function CatalogPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = (await load(token))!; // the layout already answered a link that isn't valid

  const models = data.categories.flatMap((c) => c.families.flatMap((f) => f.models));
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const priced = models.some((m) => m.price);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-chaleur-char text-white">
        <Image
          src={hero}
          alt=""
          fill
          sizes="100vw"
          placeholder="blur"
          loading="eager"
          fetchPriority="high"
          className="-z-10 object-cover object-[65%_center] opacity-80"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-chaleur-char via-chaleur-char/85 to-chaleur-char/10" />
        <div className="mx-auto flex min-h-[min(70dvh,620px)] max-w-[1280px] flex-col justify-end px-5 pt-28 pb-12 sm:px-8 sm:pb-16">
          <p className={cn(caps, "flex items-center gap-3 text-chaleur-flame")}>
            <span className="h-px w-8 bg-chaleur-flame" aria-hidden />
            Builder catalog · {month}
          </p>
          <h1 className="mt-5 max-w-[12ch] font-chaleur-display text-[clamp(48px,10vw,128px)] leading-[0.86]">{data.brand}</h1>
          <p className="mt-6 max-w-[44ch] text-md text-white/70 sm:text-lg">
            Every model in one place, with specs, cut-outs and install files{priced ? ", priced for builders" : ""}.
          </p>
          <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-4 border-t border-white/15 pt-6">
            {[
              { label: "Models", value: models.length },
              { label: "Categories", value: data.categories.length },
              { label: "In stock", value: models.filter((m) => m.inStock).length },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className={cn(caps, "text-white/50")}>{stat.label}</dt>
                <dd className="mt-1 font-chaleur-display text-[28px] leading-none tabular-nums">{String(stat.value).padStart(2, "0")}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <main className="mx-auto max-w-[1280px] px-5 pb-28 sm:px-8">
        {!data.categories.length && <p className="pt-20 text-md text-chaleur-iron">Nothing to show yet.</p>}
        {data.categories.map((c, i) => {
          // One grid per category; the family rides on each card, its files under the heading.
          const cards = c.families.flatMap((f) => f.models.map((m) => ({ m, family: f.name })));
          const downloads = c.families.flatMap((f) => f.files);
          return (
            <section key={c.key} id={slug(c.name)} className="scroll-mt-20 pt-20 sm:pt-28">
              <div className="flex items-end justify-between gap-6 border-b-2 border-chaleur-char pb-5">
                <div>
                  <p className="font-chaleur-display text-sm text-chaleur-flame tabular-nums">{String(i + 1).padStart(2, "0")}</p>
                  <h2 className="mt-2 font-chaleur-display text-[clamp(34px,5.5vw,64px)] leading-[0.92]">{c.name || "Other"}</h2>
                </div>
                <p className={cn(caps, "shrink-0 pb-1 text-chaleur-iron")}>
                  {cards.length} {cards.length === 1 ? "model" : "models"}
                </p>
              </div>
              {downloads.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className={cn(caps, "text-chaleur-iron")}>Downloads</span>
                  <Files files={downloads} />
                </div>
              )}
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(({ m, family }) => (
                  <ModelCard key={m.key} model={m} family={family} href={modelHref(token, m)} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}

/** The whole card opens the model's page; its photo squares and downloads stay clickable on top. */
function ModelCard({ model: m, family, href }: { model: SharedModel; family: string; href: string }) {
  const specs = specRows(m);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[2px] border border-chaleur-stone bg-white transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] hover:border-chaleur-steel hover:shadow-[0_18px_40px_-24px_rgba(22,21,20,0.35)]">
      <ModelGallery images={m.images.map((image) => image.src)} title={m.title ?? ""} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {family && <p className={cn(caps, "mb-1.5 text-chaleur-iron")}>{family}</p>}
        <h3 className="font-chaleur-display text-[22px] leading-[1.05]">
          <a href={href} className={cn("after:absolute after:inset-0 after:content-['']", focus)}>
            {m.title ?? <span className="sr-only">View this model</span>}
          </a>
        </h3>
        {m.ids && <p className="mt-1.5 text-xs font-normal tracking-[0.06em] text-chaleur-steel tabular-nums">ID {m.ids}</p>}
        {specs.length > 0 && (
          <dl className="mt-5 divide-y divide-chaleur-stone border-y border-chaleur-stone">
            {specs.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className={cn(caps, "shrink-0 text-chaleur-iron")}>{row.label}</dt>
                <dd className="text-right text-sm font-normal tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {m.files.length > 0 && <Files files={m.files} className="relative z-10 mt-4" />}
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          {m.price ? (
            <p>
              <span className={cn(caps, "block text-chaleur-iron")}>{m.price.from ? "From" : "Builder price"}</span>
              <span className="mt-0.5 block text-xl font-semibold tabular-nums">{formatMoney(m.price.amount)}</span>
            </p>
          ) : (
            <span />
          )}
          <div className="flex flex-col items-end gap-2 pb-1">
            <Stock inStock={m.inStock} />
            <span className={cn(caps, "inline-flex items-center gap-1 text-chaleur-iron transition-colors group-hover:text-chaleur-flame")} aria-hidden>
              Details
              <ArrowUpRight className="size-3.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
