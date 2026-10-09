import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { sharedCatalog, type SharedFile, type SharedModel } from "@/lib/catalog/service";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Catalog",
  robots: { index: false, follow: false },
};

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

/** A brand's catalog for whoever holds the link. Built on the server from fields and files cleared for it. */
export default async function CatalogPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await sharedCatalog(token);
  if (!data) notFound();

  return (
    <div className="min-h-dvh bg-canvas text-gray-900">
      <header className="mx-auto max-w-[1200px] px-5 pt-14 pb-6 sm:px-8">
        <p className="text-xs font-medium tracking-caps text-gray-500 uppercase">
          {data.audience === "partners" ? "Builder catalog" : "Catalog"}
        </p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{data.brand}</h1>
      </header>
      {data.categories.length > 1 && (
        <nav aria-label="Categories" className="sticky top-0 z-10 bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-5 py-3 [scrollbar-width:none] sm:px-8">
            {data.categories.map((c) => (
              <a key={c.key} href={`#${slug(c.name)}`} className="shrink-0 rounded-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                {c.name || "Other"}
              </a>
            ))}
          </div>
        </nav>
      )}
      <main className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8">
        {!data.categories.length && <p className="pt-10 text-sm text-gray-500">Nothing to show yet.</p>}
        {data.categories.map((c) => (
          <section key={c.key} id={slug(c.name)} className="scroll-mt-16 pt-12">
            <h2 className="text-2xl font-semibold tracking-tight">{c.name || "Other"}</h2>
            {c.families.map((f) => (
              <div key={f.key} className="mt-8">
                {f.name && <h3 className="text-sm font-medium text-gray-500">{f.name}</h3>}
                {f.files.length > 0 && <Files files={f.files} />}
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {f.models.map((m) => (
                    <ModelCard key={m.key} model={m} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

function ModelCard({ model: m }: { model: SharedModel }) {
  const specs = [
    { label: "Dimensions (W × D × H)", value: m.dimensions },
    { label: "Cut-out (W × D × H)", value: m.cutout },
    { label: "Weight", value: m.weight },
  ].filter((row) => row.value);
  return (
    <article className="flex flex-col overflow-hidden rounded-[18px] bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <div className="flex aspect-[4/3] items-center justify-center bg-sunken p-6">
        {m.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.images[0]} alt={m.title ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
        )}
      </div>
      {m.images.length > 1 && (
        <div className="flex gap-2 px-5 pt-3">
          {m.images.slice(1, 5).map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="size-12 overflow-hidden rounded-md bg-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-contain" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          {m.title && <h4 className="text-lg font-semibold">{m.title}</h4>}
          {m.ids && <p className="mt-0.5 font-mono text-xs text-gray-500">ID {m.ids}</p>}
        </div>
        {m.price && (
          <p className="text-xl font-semibold tabular-nums">
            {m.price.from && <span className="mr-1 text-sm font-normal text-gray-500">From</span>}
            {formatMoney(m.price.amount)}
          </p>
        )}
        {specs.length > 0 && (
          <dl className="grid gap-2">
            {specs.map((row) => (
              <div key={row.label}>
                <dt className="text-2xs font-medium tracking-caps text-gray-500 uppercase">{row.label}</dt>
                <dd className="text-sm tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <ul className="grid gap-1.5">
          {m.variants.map((v) => (
            <li key={`${v.name}-${v.code}`} className="flex items-center justify-between gap-3 rounded-[10px] bg-sunken px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{v.name}</span>
                {v.code && <span className="font-mono text-2xs text-gray-500">ID {v.code}</span>}
              </span>
              <span className={v.inStock ? "shrink-0 text-xs text-success-text" : "shrink-0 text-xs text-gray-500"}>
                {v.inStock ? "In stock" : "Out of stock"}
              </span>
            </li>
          ))}
        </ul>
        {m.files.length > 0 && <Files files={m.files} />}
      </div>
    </article>
  );
}

function Files({ files }: { files: SharedFile[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.url}>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            download={file.fileName || undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-150"
          >
            <FileText className="size-3.5" aria-hidden />
            {file.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
