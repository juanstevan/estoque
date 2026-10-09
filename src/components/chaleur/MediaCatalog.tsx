"use client";

import { startTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore, ViewTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Image as ImageIcon, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProductRow } from "@/components/chaleur/ProductDialog";
import type { FileRow, LinkTarget } from "@/components/chaleur/MediaLibrary";
import { ModelWindow } from "@/components/chaleur/MediaModel";
import { buildTree, byName, type Brand, type Category, type Family, type Model } from "@/lib/catalog/tree";
import { cn } from "@/lib/utils";

/**
 * The Media tab as a book: brand › category › family › model. The tree comes from the products'
 * own Brand, Category, Family and Tag. Files are added in a model's window; names are edited
 * where they're shown.
 */

type B = Brand<ProductRow>;
type C = Category<ProductRow>;
type F = Family<ProductRow>;
type M = Model<ProductRow>;

const isPhoto = (file: FileRow) => file.kind !== "file" && file.contentType.startsWith("image/");

const WIDE = "(min-width: 768px)";
function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/** The ClipboardItem takes the pending link so Safari keeps the click's permission. */
function copyLink(url: Promise<string>) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    return navigator.clipboard.write([new ClipboardItem({ "text/plain": url.then((u) => new Blob([u], { type: "text/plain" })) })]);
  }
  return url.then((u) => navigator.clipboard.writeText(u));
}

async function post<T = unknown>(url: string, body: object): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

export function MediaCatalog({
  products,
  files,
  onOpenFile,
  onAddFiles,
  onChanged,
  onError,
}: {
  products: ProductRow[];
  files: FileRow[];
  onOpenFile: (id: string) => void;
  onAddFiles: (files: File[], target: LinkTarget) => Promise<void>;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const tree = useMemo(() => buildTree(products), [products]);
  const wide = useWide();
  // undefined: nothing chosen yet, so the biggest brand opens; null: closed on purpose.
  const [chosenBrand, setChosenBrand] = useState<string | null | undefined>(undefined);
  const [chosenCategory, setChosenCategory] = useState<Record<string, string>>({});
  const [familyKey, setFamilyKey] = useState<string | null>(null);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const brandKey = chosenBrand === undefined ? (tree[0]?.key ?? null) : chosenBrand;
  const brand = tree.find((b) => b.key === brandKey) ?? null;
  // No category picked: the brand shows all its categories as tiles.
  const category = brand ? (brand.categories.find((c) => c.key === chosenCategory[brand.key]) ?? null) : null;
  const picked = category;

  const index = useMemo(() => {
    const all = new Map<string, FileRow[]>();
    const covers = new Map<string, FileRow>();
    for (const file of files) {
      for (const link of file.connections) {
        const key = `${link.scope}|${link.key}`;
        all.set(key, [...(all.get(key) ?? []), file]);
        if (link.cover) covers.set(key, file);
      }
    }
    return { all, covers };
  }, [files]);

  const modelKeys = (m: M) => [...(m.tagId ? [`tag|${m.tagId}`] : []), ...m.products.map((p) => `product|${p.id}`)];
  const coverAt = (keys: string[]) => keys.map((k) => index.covers.get(k)).find(Boolean) ?? null;
  const firstPhoto = (keys: string[]) => keys.flatMap((k) => index.all.get(k) ?? []).find(isPhoto) ?? null;
  const modelImage = (m: M) =>
    coverAt(modelKeys(m))?.thumbUrl ?? firstPhoto(modelKeys(m))?.thumbUrl ?? m.products.find((p) => p.imageUrl)?.imageUrl ?? null;
  const familyImage = (b: string, c: string, f: F) =>
    coverAt([`family|${b}\0${c}\0${f.key}`])?.thumbUrl ?? f.models.map(modelImage).find(Boolean) ?? null;
  const categoryImage = (b: string, c: C) =>
    coverAt([`category|${b}\0${c.key}`, `category|${c.key}`])?.thumbUrl ?? c.families.map((f) => familyImage(b, c.key, f)).find(Boolean) ?? null;

  const open = findModel(tree, products, modelKey);

  function openBrand(key: string | null) {
    setChosenBrand(key);
    setFamilyKey(null);
  }
  // Category and family changes run as transitions, so the named blocks morph into place.
  function openCategory(key: string) {
    if (!brand) return;
    startTransition(() => {
      setChosenCategory((current) => ({ ...current, [brand.key]: key }));
      setFamilyKey(null);
    });
  }
  function openFamily(key: string | null) {
    startTransition(() => setFamilyKey(key));
  }

  // Closing a level hands focus back to its tile, so the keyboard keeps its place.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (!refocus.current) return;
    document.querySelector<HTMLElement>(refocus.current)?.focus();
    refocus.current = null;
  });
  function closeFamily() {
    if (familyKey === null) return;
    refocus.current = `[data-mc-family="${CSS.escape(familyKey)}"]`;
    openFamily(null);
  }
  function closeCategory() {
    if (!brand || !category) return;
    refocus.current = `[data-mc-category="${CSS.escape(category.key)}"]`;
    startTransition(() => {
      setChosenCategory((current) => {
        const next = { ...current };
        delete next[brand.key];
        return next;
      });
      setFamilyKey(null);
    });
  }
  function closeBrand() {
    if (brandKey === null) return;
    refocus.current = `[data-mc-brand="${CSS.escape(brandKey)}"]`;
    openBrand(null);
  }
  function up() {
    if (familyKey !== null) closeFamily();
    else if (category) closeCategory();
    else closeBrand();
  }
  // Escape goes up a level anywhere on the tab, unless a window is open or someone is typing.
  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("[role=dialog]")) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=true]")) return;
      up();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /** Renames a brand, category or family everywhere (products follow, as in the Files view). */
  async function rename(scope: "brand" | "category" | "family", key: string, name: string) {
    try {
      const result = await post<{ qbFailed?: number }>("/api/media", { action: "rename", scope, key, name });
      await onChanged();
      if (scope === "brand") setChosenBrand(name);
      if (scope === "category" && brand) setChosenCategory((current) => ({ ...current, [brand.key]: name }));
      if (scope === "family") setFamilyKey(name);
      if (result.qbFailed) onError(`Renamed. ${result.qbFailed} product name${result.qbFailed === 1 ? "" : "s"} didn't update in QuickBooks.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't rename it");
    }
  }

  function share(b: B) {
    const url = post<{ url: string }>("/api/catalog", { action: "link", brand: b.key }).then((r) => r.url);
    copyLink(url)
      .then(() => {
        setCopied(b.key);
        setTimeout(() => setCopied((current) => (current === b.key ? null : current)), 2000);
      })
      .catch((e) => onError(e instanceof Error ? e.message : "Couldn't copy the link"));
  }

  if (!tree.length) return <p className="text-sm text-gray-500">No products yet.</p>;

  const modelWindow = (
    <ModelWindow
      model={open?.model ?? null}
      context={open?.context ?? null}
      files={files}
      products={products}
      onClose={() => setModelKey(null)}
      onOpenFile={onOpenFile}
      onUpload={onAddFiles}
      onChanged={onChanged}
      onError={onError}
      onModelKey={setModelKey}
    />
  );

  if (!wide) {
    // A phone steps through plain lists: brands, categories, families, models.
    const phoneBrand = chosenBrand ? brand : null;
    const phoneFamily = picked?.families.find((f) => f.key === familyKey) ?? null;
    return (
      <>
        <PhoneList
          tree={tree}
          brand={phoneBrand}
          category={phoneBrand ? picked : null}
          family={phoneFamily}
          onBack={() => {
            if (phoneFamily) setFamilyKey(null);
            else if (picked && brand)
              setChosenCategory((current) => {
                const next = { ...current };
                delete next[brand.key];
                return next;
              });
            else openBrand(null);
          }}
          onBrand={(key) => openBrand(key)}
          onCategory={(key) => brand && setChosenCategory((current) => ({ ...current, [brand.key]: key }))}
          onFamily={(key) => setFamilyKey(key)}
          onModel={(m) => setModelKey(m.key)}
          familyImage={(f) => (brand && picked ? familyImage(brand.key, picked.key, f) : null)}
          modelImage={modelImage}
        />
        {modelWindow}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-1">
      {tree.map((b) => {
        const isOpen = b.key === brandKey;
        return (
          <BrandColumn
            key={b.key || "-"}
            brand={b}
            open={isOpen}
            someOpen={brandKey !== null}
            copied={copied === b.key}
            onOpen={() => openBrand(b.key)}
            onShare={b.key ? () => share(b) : null}
          >
            {isOpen && (
              <div className="flex min-h-0 min-w-0 flex-1 animate-in flex-col gap-4 p-4 fade-in duration-300">
                <div className="flex shrink-0 items-center justify-between gap-3">
                  <Title value={b.name} empty="No brand" editable={Boolean(b.key)} className="text-xl" fill onSave={(name) => rename("brand", b.key, name)} />
                  <div className="flex shrink-0 items-center gap-1">
                    {b.key && <ShareButton copied={copied === b.key} onShare={() => share(b)} />}
                    <Button variant="ghost" size="icon-sm" aria-label="Close brand" onClick={closeBrand}>
                      <X />
                    </Button>
                  </div>
                </div>
                {category ? (
                  <div className="flex min-h-0 flex-1 gap-2">
                    {/* Keyed by category: switching swaps panels, so the old one can morph into its strip. */}
                    <ViewTransition key={category.key || "-"} name={`mc-cat-${b.categories.indexOf(category)}`} share="mc-morph" update="mc-morph" default="none">
                      <section className="@container no-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-[12px] bg-surface p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Title
                            value={category.name}
                            empty="No category"
                            editable={Boolean(b.key && category.key)}
                            className="text-base"
                            fill
                            onSave={(name) => rename("category", `${b.key}\0${category.key}`, name)}
                          />
                          <Button variant="ghost" size="icon-sm" aria-label="Close category" onClick={closeCategory}>
                            <X />
                          </Button>
                        </div>
                        <div className="grid grid-flow-row-dense grid-cols-2 gap-2 @2xl:grid-cols-3 @4xl:grid-cols-4">
                          {category.families.map((f, i) => (
                            <ViewTransition key={f.key || "-"} name={`mc-fam-${i}`} share="mc-morph" update="mc-morph" default="none">
                              <FamilyBlock
                                family={f}
                                open={f.key === familyKey}
                                image={familyImage(b.key, category.key, f)}
                                onOpen={() => openFamily(f.key)}
                                onClose={closeFamily}
                                onRename={b.key && category.key && f.key ? (name) => rename("family", `${b.key}\0${category.key}\0${f.key}`, name) : null}
                              >
                                {f.models.map((m) => (
                                  <ModelCard key={m.key} model={m} image={modelImage(m)} onOpen={() => setModelKey(m.key)} />
                                ))}
                              </FamilyBlock>
                            </ViewTransition>
                          ))}
                        </div>
                      </section>
                    </ViewTransition>
                    {b.categories.length > 1 && (
                      <nav aria-label="Other categories" className="no-scrollbar flex w-10 shrink-0 flex-col gap-1 overflow-y-auto">
                        {b.categories.map((c, i) =>
                          c === category ? null : (
                            <ViewTransition key={c.key || "-"} name={`mc-cat-${i}`} share="mc-morph" update="mc-morph" default="none">
                              <CategoryStrip category={c} onOpen={() => openCategory(c.key)} />
                            </ViewTransition>
                          ),
                        )}
                      </nav>
                    )}
                  </div>
                ) : (
                  <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-3 overflow-y-auto [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                    {b.categories.map((c, i) => (
                      <ViewTransition key={c.key || "-"} name={`mc-cat-${i}`} share="mc-morph" update="mc-morph" default="none">
                        <CategoryTile category={c} image={categoryImage(b.key, c)} onOpen={() => openCategory(c.key)} />
                      </ViewTransition>
                    ))}
                  </div>
                )}
              </div>
            )}
          </BrandColumn>
        );
      })}
      {modelWindow}
    </div>
  );
}

/**
 * The open model, wherever it is now (renames and reassignments move it). A Tag holds every
 * product carrying it, even one filed under another family; its files come from the family
 * holding most of them.
 */
function findModel(tree: B[], products: ProductRow[], key: string | null) {
  if (!key) return null;
  let best: { model: M; context: { brand: string; category: string; family: string } } | null = null;
  for (const b of tree)
    for (const c of b.categories)
      for (const f of c.families) {
        const m = f.models.find((x) => x.key === key);
        if (m && (!best || m.products.length > best.model.products.length)) best = { model: m, context: { brand: b.key, category: c.key, family: f.key } };
      }
  if (!best || !best.model.tagId) return best;
  const tagId = best.model.tagId;
  return { ...best, model: { ...best.model, products: byName(products.filter((p) => p.tagId === tagId)) } };
}

// ── Blocks ─────────────────────────────────────────────────────────────

/** A name that turns into an input on click. Enter or leaving saves; Esc puts it back. */
function Title({
  value,
  empty,
  editable,
  className,
  fill = false,
  onSave,
}: {
  value: string;
  empty: string;
  editable: boolean;
  className?: string;
  /** In a header row: take the free width, so the name only truncates when it must. */
  fill?: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const base = cn("min-w-0 truncate font-semibold text-gray-900", className);
  if (!editable) return <h2 className={cn(base, fill && "flex-1")}>{value || empty}</h2>;
  if (draft === null) {
    return (
      <h2 className={cn("min-w-0", fill && "flex-1")}>
        <button type="button" title="Rename" onClick={() => setDraft(value)} className={cn(base, "-mx-1 inline-block max-w-full rounded-md px-1 text-left align-top hover:bg-gray-100")}>
          {value || empty}
        </button>
      </h2>
    );
  }
  return (
    <input
      autoFocus
      aria-label="Name"
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        setDraft(null);
        if (cancelled.current) cancelled.current = false;
        else if (next && next !== value) void onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(base, "-mx-1 w-full rounded-md bg-surface px-1 outline-none ring-1 ring-gray-300")}
    />
  );
}

function ShareButton({ copied, onShare, className }: { copied: boolean; onShare: () => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Copy the builder catalog link"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            className={cn("inline-flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-150 hover:text-gray-900", className)}
          />
        }
      >
        {copied ? <Check className="size-4 text-success-text" /> : <Share2 className="size-4" />}
      </TooltipTrigger>
      <TooltipContent>{copied ? "Link copied" : "Copy the builder catalog link"}</TooltipContent>
    </Tooltip>
  );
}

function BrandColumn({
  brand,
  open,
  someOpen,
  copied,
  onOpen,
  onShare,
  children,
}: {
  brand: B;
  open: boolean;
  someOpen: boolean;
  copied: boolean;
  onOpen: () => void;
  onShare: (() => void) | null;
  children: React.ReactNode;
}) {
  const name = brand.name || "No brand";
  return (
    <section
      aria-label={name}
      className="group relative flex min-w-0 overflow-hidden rounded-[12px] bg-sunken transition-[flex-grow,flex-basis] duration-300 ease-[var(--ease-emphasis)]"
      // Closed brands keep a thin strip; with none open they share the width evenly.
      style={{ flexGrow: open ? 40 : someOpen ? 0 : 1, flexBasis: someOpen && !open ? 28 : 0 }}
    >
      {open ? (
        children
      ) : (
        <>
          <button
            type="button"
            onClick={onOpen}
            data-mc-brand={brand.key}
            aria-label={`Open ${name}`}
            className="flex h-full w-full items-start justify-center px-1 py-3 text-gray-600 transition-colors hover:bg-gray-150 hover:text-gray-900 focus-visible:bg-gray-150"
          >
            {/* Names show on hover only, so the closed brands stay quiet. */}
            <span
              className={cn(
                "rotate-180 truncate font-medium opacity-0 transition-opacity [writing-mode:vertical-rl] group-focus-within:opacity-100 group-hover:opacity-100",
                someOpen ? "text-2xs" : "text-sm",
              )}
            >
              {name}
            </span>
          </button>
          {onShare && (
            <ShareButton
              copied={copied}
              onShare={onShare}
              className={cn(
                "absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
                someOpen ? "size-6" : "size-7",
              )}
            />
          )}
        </>
      )}
    </section>
  );
}

function CategoryTile({ category, image, onOpen }: { category: C; image: string | null; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-mc-category={category.key}
      className="flex flex-col gap-2 rounded-[12px] bg-surface p-2 text-left transition-colors hover:bg-gray-50"
    >
      <Thumb src={image} className="aspect-[4/3] w-full rounded-[8px]" />
      <span className="block truncate px-1 pb-0.5 text-sm font-medium text-gray-900">{category.name || "No category"}</span>
    </button>
  );
}

function CategoryStrip({ category, onOpen }: { category: C; onOpen: () => void }) {
  const name = category.name || "No category";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-mc-category={category.key}
      aria-label={`Open ${name}`}
      className="group flex h-32 w-10 shrink-0 items-start justify-center rounded-[10px] bg-surface/70 px-1 py-2 text-gray-600 transition-colors hover:bg-surface hover:text-gray-900 focus-visible:bg-surface"
    >
      <span className="rotate-180 truncate text-2xs font-medium opacity-0 transition-opacity [writing-mode:vertical-rl] group-hover:opacity-100 group-focus-visible:opacity-100">
        {name}
      </span>
    </button>
  );
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span className={cn("flex items-center justify-center overflow-hidden bg-surface", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-contain" loading="lazy" />
      ) : (
        <ImageIcon className="size-5 text-gray-300" aria-hidden />
      )}
    </span>
  );
}

function FamilyBlock({
  family,
  open,
  image,
  onOpen,
  onClose,
  onRename,
  children,
}: {
  family: F;
  open: boolean;
  image: string | null;
  onOpen: () => void;
  onClose: () => void;
  onRename: ((name: string) => Promise<void>) | null;
  children: React.ReactNode;
}) {
  const name = family.name || "No family";
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        data-mc-family={family.key}
        className="flex flex-col gap-2 rounded-[12px] bg-sunken p-2 text-left transition-colors hover:bg-gray-150"
      >
        <Thumb src={image} className="aspect-[4/3] w-full rounded-[8px]" />
        <span className="block truncate px-1 pb-0.5 text-sm font-medium text-gray-900">{name}</span>
      </button>
    );
  }
  return (
    <section aria-label={name} className="@container col-span-2 row-span-2 flex flex-col gap-3 rounded-[12px] bg-sunken p-3">
      <div className="flex items-center justify-between gap-2">
        <Title value={family.name} empty="No family" editable={Boolean(onRename)} className="text-sm" fill onSave={(next) => onRename?.(next) ?? Promise.resolve()} />
        <Button variant="ghost" size="icon-sm" aria-label="Close family" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3">{children}</div>
    </section>
  );
}

function ModelCard({ model, image, onOpen }: { model: M; image: string | null; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-1.5 rounded-[10px] bg-surface p-1.5 text-left transition-shadow hover:shadow-sm">
      <Thumb src={image} className="aspect-square w-full rounded-[7px]" />
      <span className="line-clamp-2 px-1 pb-0.5 text-xs font-medium text-gray-900">{model.name}</span>
    </button>
  );
}

// ── Phone ──────────────────────────────────────────────────────────────

function PhoneList({
  tree,
  brand,
  category,
  family,
  onBack,
  onBrand,
  onCategory,
  onFamily,
  onModel,
  familyImage,
  modelImage,
}: {
  tree: B[];
  brand: B | null;
  category: C | null;
  family: F | null;
  onBack: () => void;
  onBrand: (key: string) => void;
  onCategory: (key: string) => void;
  onFamily: (key: string) => void;
  onModel: (m: M) => void;
  familyImage: (f: F) => string | null;
  modelImage: (m: M) => string | null;
}) {
  const path = [brand, category, family].filter((level): level is B | C | F => level !== null).map((level) => level.name || "—");
  const rows: { key: string; name: string; image?: string | null; open: () => void }[] = family
    ? []
    : category
      ? category.families.map((f) => ({ key: f.key, name: f.name || "No family", image: familyImage(f), open: () => onFamily(f.key) }))
      : brand
        ? brand.categories.map((c) => ({ key: c.key, name: c.name || "No category", open: () => onCategory(c.key) }))
        : tree.map((b) => ({ key: b.key, name: b.name || "No brand", open: () => onBrand(b.key) }));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-9 items-center gap-1">
        {path.length > 0 && (
          <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={onBack}>
            <ChevronLeft />
          </Button>
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{path.join(" › ") || "Brands"}</p>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {family ? (
          <div className="grid grid-cols-2 gap-2">
            {family.models.map((m) => (
              <ModelCard key={m.key} model={m} image={modelImage(m)} onOpen={() => onModel(m)} />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <li key={row.key || "-"}>
                <button type="button" onClick={row.open} className="flex w-full items-center gap-3 rounded-[10px] bg-sunken p-2 text-left">
                  {row.image !== undefined && <Thumb src={row.image} className="size-12 shrink-0 rounded-md" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{row.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-gray-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
