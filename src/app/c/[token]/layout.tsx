import { Archivo, Lexend } from "next/font/google";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import logo from "./brand/logo.svg";
import logoReversed from "./brand/logo-reversed.svg";
import { caps, focus, load, slug } from "./shared";

// The Chaleur design kit's type: Archivo (wide display caps) and Lexend (text).
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend" });

/** The frame of a builder link, for the brand page and each model's page. A link that isn't valid shows nothing. */
export default async function CatalogLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();
  const priced = data.categories.some((c) => c.families.some((f) => f.models.some((m) => m.price)));

  return (
    <div className={cn(archivo.variable, lexend.variable, "min-h-dvh bg-white font-chaleur-text font-light text-chaleur-char antialiased")}>
      <header className="sticky top-0 z-20 border-b border-chaleur-stone bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-5 sm:gap-10 sm:px-8">
          <a href={data.base} className={cn("shrink-0", focus)} aria-label={`${data.brand} catalog`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt="Chaleur" className="h-6 w-auto sm:h-7" />
          </a>
          {data.categories.length > 1 && (
            <nav aria-label="Categories" className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
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
          )}
          <span className={cn(caps, "ml-auto hidden shrink-0 text-chaleur-iron md:block")}>Builder catalog</span>
        </div>
      </header>

      {children}

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
