import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { sharedPhotos, type SharedPhotos } from "@/lib/photos/share";
import { DownloadPhoto } from "./DownloadPhoto";

export const metadata: Metadata = {
  title: "Chaleur — Product photos",
  robots: { index: false, follow: false },
};

type Product = SharedPhotos["products"][number];

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function meta(photo: Product["photos"][number]) {
  const size = photo.size ? `${(photo.size / (1024 * 1024)).toFixed(1)} MB` : null;
  const dims = photo.width && photo.height ? `${photo.width} × ${photo.height}` : null;
  return [dims, size].filter(Boolean).join(" · ");
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const data = await sharedPhotos(token, origin);
  if (!data) notFound();

  const brands = new Map<string, Product[]>();
  for (const p of data.products) brands.set(p.brand, [...(brands.get(p.brand) ?? []), p]);
  const total = data.products.reduce((n, p) => n + p.photos.length, 0);
  const single = data.scope === "product" ? data.products[0] : null;

  return (
    <div className="min-h-dvh bg-canvas text-gray-900">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {single ? single.name : "Chaleur product photos"}
            </div>
            <div className="text-2xs text-gray-500">
              {single ? `${single.sku} · ` : `${data.products.length} products · `}
              {total} photo{total === 1 ? "" : "s"} · view and download only
            </div>
          </div>
          <a
            href={`/share/${token}/photos.json`}
            className="shrink-0 text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
          >
            photos.json
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1280px] gap-8 px-6 py-6">
        {!single && brands.size > 1 && (
          <nav className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-52 shrink-0 overflow-y-auto text-sm lg:block">
            {[...brands].map(([brand, products]) => (
              <div key={brand} className="mb-4">
                <a
                  href={`#${slug(brand)}`}
                  className="mb-1 block text-2xs font-medium tracking-caps text-gray-500 uppercase"
                >
                  {brand}
                </a>
                {products.map((p) => (
                  <a
                    key={p.id}
                    href={`#${p.id}`}
                    className="block truncate rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100"
                  >
                    {p.name}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        )}

        <main className="min-w-0 flex-1">
          {total === 0 && <p className="text-sm text-gray-500">No photos yet.</p>}
          {[...brands].map(([brand, products]) => (
            <section key={brand} id={slug(brand)} className="mb-10 scroll-mt-20">
              {!single && (
                <h2 className="mb-4 text-2xs font-medium tracking-caps text-gray-500 uppercase">
                  {brand}
                </h2>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {products.flatMap((p) =>
                  p.photos.map((photo, i) => (
                    <figure
                      key={photo.id}
                      id={i === 0 ? p.id : undefined}
                      className="min-w-0 scroll-mt-20"
                    >
                      <div className="group relative aspect-[4/3] overflow-hidden rounded-[9px] border border-border bg-sunken">
                        <a href={photo.url} target="_blank" rel="noopener" title="Open full size">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.thumbUrl}
                            alt={`${p.name}${photo.tag ? ` — ${photo.tag}` : ""}`}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        </a>
                        <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <DownloadPhoto url={photo.url} fileName={photo.fileName} />
                        </div>
                      </div>
                      <figcaption className="mt-1.5 px-0.5">
                        {!single && <div className="truncate text-sm font-medium">{p.name}</div>}
                        <div
                          className={
                            single ? "truncate text-sm font-medium" : "truncate text-xs text-gray-600"
                          }
                        >
                          {photo.tag || "Photo"}
                          {!single && <span className="font-mono text-gray-400"> · {p.sku}</span>}
                        </div>
                        <div className="text-2xs text-gray-400">{meta(photo)}</div>
                        {/* Plain text for AI readers; visually quiet. */}
                        <a href={photo.url} className="sr-only">
                          {photo.fileName}
                        </a>
                      </figcaption>
                    </figure>
                  )),
                )}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
