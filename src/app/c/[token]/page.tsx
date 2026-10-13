import type { Metadata } from "next";
import { Archivo, Lexend } from "next/font/google";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowDownToLine } from "lucide-react";
import { sharedCatalog, type SharedFile, type SharedModel } from "@/lib/catalog/service";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ModelGallery } from "./gallery";
import hero from "./brand/hero.jpg";
import logo from "./brand/logo.svg";
import logoReversed from "./brand/logo-reversed.svg";

// The Chaleur design kit's type: Archivo (wide display caps) and Lexend (text).
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend" });

const load = cache(sharedCatalog);

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const data = await load((await params).token);
  return {
    title: data ? `${data.brand} · Builder catalog` : "Catalog",
    robots: { index: false, follow: false },
  };
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

const caps = "text-[11px] font-normal tracking-[0.12em] uppercase";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chaleur-flame";

/** A brand's catalog for whoever holds the link. Built on the server from fields and files cleared for it. */
export default async function CatalogPage({ params }: { params: Promise<{ token: string }> }) {
  const data = await load((await params).token);
  if (!data) notFound();

  const models = data.categories.flatMap((c) => c.families.flatMap((f) => f.models));
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const priced = models.some((m) => m.price);

  return (
    <div className={cn(archivo.variable, lexend.variable, "min-h-dvh bg-white font-chaleur-text font-light text-chaleur-char antialiased")}>
      <header className="sticky top-0 z-20 border-b border-chaleur-stone bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-5 sm:gap-10 sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt="Chaleur" className="h-6 w-auto shrink-0 sm:h-7" />
          {data.categories.length > 1 && (
            <nav aria-label="Categories" className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {data.categories.map((c) => (
                <a
                  key={c.key}
                  href={`#${slug(c.name)}`}
                  className={cn("shrink-0 px-2 py-1 font-chaleur-display text-[11px] tracking-[0.12em] text-chaleur-iron transition-colors duration-200 hover:text-chaleur-flame", focus)}
                >
                  {c.name || "Other"}
                </a>
              ))}
            </nav>
          )}
          <span className={cn(caps, "ml-auto hidden shrink-0 text-chaleur-iron md:block")}>Builder catalog</span>
        </div>
      </header>

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
                  <ModelCard key={m.key} model={m} family={family} />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="bg-chaleur-char text-white">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-16 sm:grid-cols-[auto_1fr] sm:items-end sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoReversed.src} alt="Chaleur" className="h-10 w-auto" />
          <div className="text-sm text-white/60 sm:text-right">
            <p className="font-normal text-white">{data.company.name}</p>
            {data.company.phone && (
              <a href={`tel:${data.company.phone.replace(/[^\d+]/g, "")}`} className={cn("hover:text-white", focus)}>
                {data.company.phone}
              </a>
            )}
            <p className="mt-5 text-xs sm:ml-auto sm:max-w-[56ch]">
              {priced && "Prices are for builders, in US dollars, and may change without notice. "}
              Sizes are width × depth × height in inches.
            </p>
          </div>
        </div>
        <div className="h-1 bg-chaleur-flame" aria-hidden />
      </footer>
    </div>
  );
}

function ModelCard({ model: m, family }: { model: SharedModel; family: string }) {
  const specs = [
    { label: "Dimensions", value: m.dimensions },
    { label: "Cut-out", value: m.cutout },
    { label: "Weight", value: m.weight },
  ].filter((row) => row.value);
  return (
    <article className="group flex flex-col overflow-hidden rounded-[2px] border border-chaleur-stone bg-white transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] hover:border-chaleur-steel hover:shadow-[0_18px_40px_-24px_rgba(22,21,20,0.35)]">
      <ModelGallery images={m.images} title={m.title ?? ""} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {family && <p className={cn(caps, "mb-1.5 text-chaleur-iron")}>{family}</p>}
        {m.title && <h3 className="font-chaleur-display text-[22px] leading-[1.05]">{m.title}</h3>}
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
        {m.files.length > 0 && <Files files={m.files} className="mt-4" />}
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          {m.price ? (
            <p>
              <span className={cn(caps, "block text-chaleur-iron")}>{m.price.from ? "From" : "Builder price"}</span>
              <span className="mt-0.5 block text-xl font-semibold tabular-nums">{formatMoney(m.price.amount)}</span>
            </p>
          ) : (
            <span />
          )}
          <p className={cn("inline-flex items-center gap-2 pb-1 text-xs font-normal", m.inStock ? "text-chaleur-good" : "text-chaleur-warn")}>
            <span className={cn("size-1.5 rounded-full", m.inStock ? "bg-chaleur-good" : "bg-chaleur-warn")} aria-hidden />
            {m.inStock ? "In stock" : "Out of stock"}
          </p>
        </div>
      </div>
    </article>
  );
}

function Files({ files, className }: { files: SharedFile[]; className?: string }) {
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
              "inline-flex items-center gap-1.5 rounded-[2px] border border-chaleur-stone px-2.5 py-1.5 text-xs font-normal text-chaleur-graphite transition-colors duration-200 hover:border-chaleur-char hover:text-chaleur-char",
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
