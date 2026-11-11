import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import logo from "./brand/logo.svg";
import logoReversed from "./brand/logo-reversed.svg";
import { archivo, lexend } from "./fonts";
import { caps, focus, load, slug, wording, type Kind } from "./shared";

export type LayoutProps = { children: React.ReactNode; params: Promise<{ token: string }> };

/**
 * The frame of a catalog's pages, for the brand page and each model's page. Under /price and
 * /catalog the header switches between brands. An address that isn't valid shows nothing.
 */
export async function CatalogLayout({ children, params, kind }: LayoutProps & { kind: Kind }) {
  const { token } = await params;
  const data = await load(token, kind);
  if (!data) notFound();
  const words = wording(kind);
  const priced = data.categories.some((c) => c.families.some((f) => f.models.some((m) => m.price)));
  const current = data.base.split("/")[2];

  return (
    <CatalogFrame>
      <header className="sticky top-0 z-20 border-b border-chaleur-stone bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-5 sm:gap-10 sm:px-8">
          <a href={kind === "link" ? data.base : `/${kind}`} className={cn("shrink-0", focus)} aria-label={kind === "link" ? `${data.brand} catalog` : `All brands`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt="Chaleur" className="h-5 w-auto sm:h-7" />
          </a>
          {data.brands.length > 1 ? (
            <nav aria-label="Brands" className="no-scrollbar flex min-w-0 flex-1 self-stretch overflow-x-auto">
              {data.brands.map((b) => (
                <a
                  key={b.slug}
                  href={`/${kind}/${b.slug}`}
                  aria-current={b.slug === current ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center border-b-2 px-2 font-chaleur-display text-[11px] tracking-[0.1em] transition-colors duration-200 sm:px-3 sm:text-[12px] sm:tracking-[0.14em]",
                    b.slug === current ? "border-chaleur-flame text-chaleur-char" : "border-transparent text-chaleur-iron hover:text-chaleur-char",
                    focus,
                  )}
                >
                  {b.brand}
                </a>
              ))}
            </nav>
          ) : (
            <CategoryNav data={data} className="flex-1" />
          )}
          <span className={cn(caps, "ml-auto hidden shrink-0 text-chaleur-iron md:block")}>{words.name}</span>
        </div>
        {data.brands.length > 1 && data.categories.length > 1 && (
          <div className="border-t border-chaleur-stone">
            <div className="mx-auto flex h-11 max-w-[1280px] items-center px-3 sm:px-6">
              <CategoryNav data={data} />
            </div>
          </div>
        )}
      </header>

      {children}

      <CatalogFooter company={data.company} note={`${priced ? `${words.note} ` : ""}Sizes are width × depth × height in inches.`} />
    </CatalogFrame>
  );
}

/** Jumps to a category on the brand page. */
function CategoryNav({ data, className }: { data: { base: string; categories: { key: string; name: string }[] }; className?: string }) {
  if (data.categories.length < 2) return <span className={className} />;
  return (
    <nav aria-label="Categories" className={cn("no-scrollbar flex min-w-0 gap-1 overflow-x-auto", className)}>
      {data.categories.map((c) => (
        <a
          key={c.key}
          href={`${data.base}#${slug(c.name)}`}
          className={cn("shrink-0 px-2 py-1 font-chaleur-display text-[11px] tracking-[0.12em] text-chaleur-iron transition-colors duration-200 hover:text-chaleur-flame", focus)}
        >
          {c.name || "Other"}
        </a>
      ))}
    </nav>
  );
}

/** Fonts and page colours, shared with the brand index pages. */
export function CatalogFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(archivo.variable, lexend.variable, "flex min-h-dvh flex-col bg-white font-chaleur-text font-light text-chaleur-char antialiased")}>
      {children}
    </div>
  );
}

export function CatalogFooter({ company, note }: { company: { name: string; phone: string | null }; note: string }) {
  return (
    <footer className="mt-auto bg-chaleur-char text-white">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-16 sm:grid-cols-[auto_1fr] sm:items-end sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoReversed.src} alt="Chaleur" className="h-10 w-auto" />
        <div className="text-sm text-white/60 sm:text-right">
          <p className="font-normal text-white">{company.name}</p>
          {company.phone && (
            <a href={`tel:${company.phone.replace(/[^\d+]/g, "")}`} className={cn("hover:text-white", focus)}>
              {company.phone}
            </a>
          )}
          <p className="mt-5 text-xs sm:ml-auto sm:max-w-[56ch]">{note}</p>
        </div>
      </div>
      <div className="h-1 bg-chaleur-flame" aria-hidden />
    </footer>
  );
}
