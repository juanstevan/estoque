"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeClosed, FileText, ImagePlus, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProductRow } from "@/components/chaleur/ProductDialog";
import type { FileRow, LinkTarget } from "@/components/chaleur/MediaLibrary";
import {
  fieldVisibility,
  nextVisibility,
  visibleTo,
  type CatalogField,
  type Visibility,
} from "@/lib/catalog/fields";
import type { Model } from "@/lib/catalog/tree";
import { formatMoney, formatQty } from "@/lib/format";
import { commitMeasure } from "@/lib/measure";
import { cn } from "@/lib/utils";

/**
 * A model (Tag) in the Media tab: its photos, shared values, files and variants. Shared values
 * live on each variant and are saved to all of them together; nothing is copied anywhere else.
 * Every item carries an eye: closed (this app), half (builders), open (everyone).
 */

const AUDIENCE_LABEL: Record<Visibility, string> = { internal: "System view", partners: "Builder view", public: "Consumer view" };
const EYE_LABEL: Record<Visibility, string> = {
  internal: "Only in this app",
  partners: "Builders can see this",
  public: "Everyone can see this",
};

/** The half-closed eye: builders only. Drawn to match the icon set. */
function HalfEye({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M2 11h20" />
      <path d="M2.06 11.35a10.75 10.75 0 0 0 19.88 0" />
      <path d="M9 11a3 3 0 0 0 6 0" />
    </svg>
  );
}

function EyeIcon({ value, className }: { value: Visibility; className?: string }) {
  if (value === "public") return <Eye className={className} aria-hidden />;
  if (value === "partners") return <HalfEye className={className} />;
  return <EyeClosed className={className} aria-hidden />;
}

/** Shows on hover (or keyboard focus); a click moves it to the next audience. */
function EyeToggle({ value, onToggle, className }: { value: Visibility; onToggle: () => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`${EYE_LABEL[value]}. Change who sees it`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-gray-100 hover:text-gray-900 focus-visible:opacity-100",
              className,
            )}
          />
        }
      >
        <EyeIcon value={value} className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{EYE_LABEL[value]}</TooltipContent>
    </Tooltip>
  );
}

const isPhoto = (file: FileRow) => file.kind !== "file" && file.contentType.startsWith("image/");

async function post<T = unknown>(url: string, body: object): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

type Context = { brand: string; category: string; family: string };

export function ModelWindow({
  model,
  context,
  files,
  products,
  onClose,
  onOpenFile,
  onUpload,
  onChanged,
  onError,
  onModelKey,
}: {
  model: Model<ProductRow> | null;
  context: Context | null;
  files: FileRow[];
  products: ProductRow[];
  onClose: () => void;
  onOpenFile: (id: string) => void;
  onUpload: (files: File[], target: LinkTarget) => Promise<void>;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onModelKey: (key: string) => void;
}) {
  return (
    <Dialog open={model != null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[92dvh] w-[min(1240px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {model && (
          <Editor
            key={model.key}
            model={model}
            context={context}
            files={files}
            products={products}
            onOpenFile={onOpenFile}
            onUpload={onUpload}
            onChanged={onChanged}
            onError={onError}
            onModelKey={onModelKey}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  model,
  context,
  files,
  products,
  onOpenFile,
  onUpload,
  onChanged,
  onError,
  onModelKey,
}: {
  model: Model<ProductRow>;
  context: Context | null;
  files: FileRow[];
  products: ProductRow[];
  onOpenFile: (id: string) => void;
  onUpload: (files: File[], target: LinkTarget) => Promise<void>;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onModelKey: (key: string) => void;
}) {
  const [audience, setAudience] = useState<Visibility>("internal");
  const [fieldOverride, setFieldOverride] = useState<Partial<Record<string, Visibility>>>({});
  const [photoIndex, setPhotoIndex] = useState(0);
  const variants = model.products;
  const first = variants[0]!;
  const owner = model.tagId ? { tagId: model.tagId } : { productId: first.id };
  const fieldsJson = model.tagId ? first.tag?.catalogFields : first.catalogFields;
  const target: LinkTarget = model.tagId ? { scope: "tag", tagId: model.tagId } : { scope: "product", productId: first.id };

  // Files by the level they're linked to; the link id is what unlink and cover act on.
  const placed = useMemo(() => {
    const at = (keys: string[]) => {
      const out: { file: FileRow; linkId: string; cover: boolean }[] = [];
      for (const file of files) {
        const link = file.connections.find((c) => keys.includes(`${c.scope}|${c.key}`));
        if (link) out.push({ file, linkId: link.id, cover: Boolean(link.cover) });
      }
      return out;
    };
    const own = at([...(model.tagId ? [`tag|${model.tagId}`] : []), ...variants.map((p) => `product|${p.id}`)]);
    const inherited = context
      ? [
          { label: `From the ${context.family || "family"} family`, items: at([`family|${context.brand}\0${context.category}\0${context.family}`]) },
          { label: `From ${context.category || "the category"}`, items: at([`category|${context.brand}\0${context.category}`, `category|${context.category}`]) },
          { label: `From ${context.brand || "the brand"}`, items: at([`brand|${context.brand}`]) },
        ].filter((group) => group.items.length)
      : [];
    return { own, inherited };
  }, [files, model.tagId, variants, context]);

  const photos = placed.own.filter((x) => isPhoto(x.file)).sort((a, b) => Number(b.cover) - Number(a.cover));
  const documents = placed.own.filter((x) => !isPhoto(x.file));
  const fallback = variants.find((p) => p.imageUrl)?.imageUrl ?? null;
  const photo = photos[Math.min(photoIndex, Math.max(0, photos.length - 1))] ?? null;

  const field = (name: CatalogField) => fieldOverride[name] ?? fieldVisibility(fieldsJson, name);
  const dim = (value: Visibility) => !visibleTo(audience, value);

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  function toggleField(name: CatalogField) {
    const next = nextVisibility(field(name));
    setFieldOverride((current) => ({ ...current, [name]: next }));
    void run(() => post("/api/catalog", { action: "field", ...owner, field: name, visibility: next }));
  }
  const toggleFile = (file: FileRow) =>
    run(() => post("/api/media", { action: "visibility", ids: [file.id], visibility: nextVisibility(file.visibility) }));
  const toggleVariant = (p: ProductRow) =>
    run(() =>
      post("/api/catalog", { action: "field", productId: p.id, field: "variant", visibility: nextVisibility(fieldVisibility(p.catalogFields, "variant")) }),
    );

  async function saveShared(data: Record<string, number | null>) {
    await run(async () => {
      const result = await post<{ quickBooksFailed: number; message: string | null }>("/api/catalog", {
        action: "shared",
        productIds: variants.map((p) => p.id),
        data,
      });
      if (result.quickBooksFailed) onError(result.message ?? "Saved here, but QuickBooks wasn't updated.");
    });
  }

  async function rename(name: string) {
    await run(() =>
      model.tagId
        ? post("/api/media", { action: "rename", scope: "tag", key: model.tagId, name })
        : fetch(`/api/products/${first.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't rename");
          }),
    );
  }

  const upload = (list: File[]) => run(() => onUpload(list, target));
  const unlink = (linkId: string) => run(() => post("/api/media", { action: "unlink", id: linkId }));
  const makeMain = (linkId: string) => run(() => post("/api/media", { action: "cover", id: linkId, on: true }));

  async function addProduct(p: ProductRow) {
    await run(async () => {
      const result = await post<{ tagId: string }>("/api/catalog", {
        action: "assign",
        productId: p.id,
        ...(model.tagId ? { tagId: model.tagId } : { newTag: { name: model.name, productIds: variants.map((v) => v.id) } }),
      });
      if (!model.tagId) onModelKey(`tag:${result.tagId}`);
    });
  }
  const removeProduct = (p: ProductRow) => run(() => post("/api/catalog", { action: "unassign", productId: p.id }));

  const shared = <T,>(get: (p: ProductRow) => T) => {
    const values = variants.map(get);
    return values.every((v) => v === values[0]) ? { value: values[0] } : null;
  };

  return (
    <>
      <DialogTitle className="sr-only">{model.name}</DialogTitle>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="no-scrollbar flex min-h-0 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex justify-end">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setAudience(nextVisibility(audience))}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-sunken px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-150"
                  />
                }
              >
                <EyeIcon value={audience} className="size-3.5" />
                {AUDIENCE_LABEL[audience]}
              </TooltipTrigger>
              <TooltipContent>See what each audience sees. Hidden items fade.</TooltipContent>
            </Tooltip>
          </div>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <Gallery
              photo={photo}
              count={photos.length}
              index={Math.min(photoIndex, Math.max(0, photos.length - 1))}
              fallback={fallback}
              dimmed={photo ? dim(photo.file.visibility) : false}
              onStep={(d) => setPhotoIndex((i) => (i + d + photos.length) % photos.length)}
              onAdd={upload}
              onToggle={() => photo && void toggleFile(photo.file)}
              onRemove={() => photo && void unlink(photo.linkId)}
              onMain={() => photo && void makeMain(photo.linkId)}
              onOpen={() => photo && onOpenFile(photo.file.id)}
            />
            <div className="flex min-w-0 flex-col gap-6">
              <div>
                <Item value={field("title")} dimmed={dim(field("title"))} onToggle={() => toggleField("title")}>
                  <InlineText value={model.name} label="Model name" onSave={rename} className="text-2xl font-semibold text-gray-900" />
                </Item>
                <Item value={field("id")} dimmed={dim(field("id"))} onToggle={() => toggleField("id")}>
                  <p className="font-mono text-xs text-gray-500">ID {variants.map((p) => p.code).join(" · ")}</p>
                </Item>
              </div>
              <Item value={field("price")} dimmed={dim(field("price"))} onToggle={() => toggleField("price")} label="B2B price">
                <div className="flex items-baseline gap-1 text-3xl font-semibold text-gray-900">
                  <span className="text-gray-400">$</span>
                  <NumberField
                    values={variants.map((p) => (p.b2bPrice > 0 ? p.b2bPrice : null))}
                    label="B2B price for every variant"
                    money
                    className="w-44 text-3xl font-semibold"
                    onSave={(value) => value != null && saveShared({ b2bPrice: value })}
                  />
                </div>
              </Item>
              <div className="grid gap-4">
                <p className="text-2xs font-medium tracking-caps text-gray-500 uppercase">Specs</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Item value={field("dimensions")} dimmed={dim(field("dimensions"))} onToggle={() => toggleField("dimensions")} label="Dimensions (W × D × H)">
                    <Triple
                      values={[variants.map((p) => p.width), variants.map((p) => p.length), variants.map((p) => p.height)]}
                      labels={["Width", "Depth", "Height"]}
                      onSave={(axis, value) => saveShared({ [["width", "length", "height"][axis]!]: value })}
                    />
                  </Item>
                  <Item value={field("cutout")} dimmed={dim(field("cutout"))} onToggle={() => toggleField("cutout")} label="Cut-out (W × D × H)">
                    <Triple
                      values={[variants.map((p) => p.cutoutWidth), variants.map((p) => p.cutoutLength), variants.map((p) => p.cutoutHeight)]}
                      labels={["Cut-out width", "Cut-out depth", "Cut-out height"]}
                      onSave={(axis, value) => saveShared({ [["cutoutWidth", "cutoutLength", "cutoutHeight"][axis]!]: value })}
                    />
                  </Item>
                  <Item value={field("weight")} dimmed={dim(field("weight"))} onToggle={() => toggleField("weight")} label="Weight">
                    <NumberField values={variants.map((p) => p.weight)} label="Weight for every variant" className="w-24 text-sm" onSave={(value) => saveShared({ weight: value })} />
                  </Item>
                </div>
              </div>
            </div>
          </div>
          <FilesBox
            documents={documents}
            inherited={placed.inherited}
            dim={dim}
            onAdd={upload}
            onOpen={onOpenFile}
            onToggle={(file) => void toggleFile(file)}
            onRemove={(linkId) => void unlink(linkId)}
          />
        </div>
        <aside className="no-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto bg-sunken p-4 pt-12">
          <p className="text-2xs font-medium tracking-caps text-gray-500 uppercase">Products</p>
          {variants.map((p) => (
            <VariantRow
              key={p.id}
              product={p}
              price={shared((v) => v.b2bPrice)}
              visibility={fieldVisibility(p.catalogFields, "variant")}
              dimmed={dim(fieldVisibility(p.catalogFields, "variant"))}
              differs={{
                dimensions: !shared((v) => `${v.width}|${v.length}|${v.height}`),
                cutout: !shared((v) => `${v.cutoutWidth}|${v.cutoutLength}|${v.cutoutHeight}`),
                weight: !shared((v) => v.weight),
              }}
              canRemove={Boolean(model.tagId)}
              onToggle={() => void toggleVariant(p)}
              onRemove={() => void removeProduct(p)}
            />
          ))}
          <ProductPicker products={products} current={variants} onPick={addProduct} />
        </aside>
      </div>
    </>
  );
}

/** A piece of model information with its eye; faded when the chosen audience can't see it. */
function Item({
  value,
  dimmed,
  onToggle,
  label,
  children,
}: {
  value: Visibility;
  dimmed: boolean;
  onToggle: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("group/item flex min-w-0 items-start gap-1 transition-opacity", dimmed && "opacity-40")}>
      <div className="min-w-0 flex-1">
        {label && <p className="text-2xs font-medium tracking-caps text-gray-500 uppercase">{label}</p>}
        {children}
      </div>
      <EyeToggle value={value} onToggle={onToggle} />
    </div>
  );
}

/** Text that turns into an input on click. Enter or leaving saves; Esc puts it back. */
function InlineText({ value, label, onSave, className }: { value: string; label: string; onSave: (next: string) => Promise<void>; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  if (draft === null) {
    return (
      <button type="button" title="Rename" onClick={() => setDraft(value)} className={cn("-mx-1 max-w-full truncate rounded-md px-1 text-left hover:bg-gray-100", className)}>
        {value}
      </button>
    );
  }
  return (
    <input
      autoFocus
      aria-label={label}
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
      className={cn("-mx-1 w-full min-w-0 rounded-md bg-surface px-1 outline-none ring-1 ring-gray-300", className)}
    />
  );
}

/** One number shared by every variant. Empty with "Varies" when they disagree; saving sets them all. */
function NumberField({
  values,
  label,
  money = false,
  className,
  onSave,
}: {
  values: (number | null)[];
  label: string;
  money?: boolean;
  className?: string;
  onSave: (value: number | null) => void;
}) {
  const same = values.every((v) => v === values[0]);
  const shown = same && values[0] != null ? String(values[0]) : "";
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? shown}
      placeholder={same ? (money ? "No price" : "—") : "Varies"}
      onFocus={() => setDraft(shown)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const text = (draft ?? shown).trim();
        setDraft(null);
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        if (text === shown) return;
        const value = commitMeasure(text);
        if (value === "invalid" || value === "draft") return;
        onSave(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "-mx-1 min-w-0 rounded-md bg-transparent px-1 tabular-nums text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 hover:bg-gray-100 focus:bg-surface focus:ring-1 focus:ring-gray-300",
        !same && "placeholder:text-warning-text",
        className,
      )}
    />
  );
}

function Triple({
  values,
  labels,
  onSave,
}: {
  values: (number | null)[][];
  labels: string[];
  onSave: (axis: number, value: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-sm">
      {values.map((axis, i) => (
        <span key={labels[i]} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-400">×</span>}
          <NumberField values={axis} label={`${labels[i]} for every variant`} className="w-14 text-sm" onSave={(value) => onSave(i, value)} />
        </span>
      ))}
    </div>
  );
}

/** The model's photos, like the old product card: step through, add, remove, choose the main one. */
function Gallery({
  photo,
  count,
  index,
  fallback,
  dimmed,
  onStep,
  onAdd,
  onToggle,
  onRemove,
  onMain,
  onOpen,
}: {
  photo: { file: FileRow; linkId: string; cover: boolean } | null;
  count: number;
  index: number;
  fallback: string | null;
  dimmed: boolean;
  onStep: (d: number) => void;
  onAdd: (files: File[]) => void;
  onToggle: () => void;
  onRemove: () => void;
  onMain: () => void;
  onOpen: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const src = photo?.file.url ?? fallback;
  return (
    <div
      className={cn(
        "group/item relative flex aspect-square items-center justify-center overflow-hidden rounded-[14px] bg-sunken",
        over && "bg-blue-50 outline-1 outline-blue-500 outline-dashed -outline-offset-2",
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onAdd([...e.dataTransfer.files]);
      }}
    >
      {src ? (
        <button type="button" className={cn("flex size-full items-center justify-center p-6 transition-opacity", dimmed && "opacity-40")} onClick={photo ? onOpen : () => input.current?.click()} aria-label={photo ? "Open photo" : "Add photos"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="flex flex-col items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-900">
          <ImagePlus className="size-5" />
          Add photos
        </button>
      )}
      {count > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => onStep(-1)} className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-gray-700 opacity-0 shadow-xs transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" aria-label="Next photo" onClick={() => onStep(1)} className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-gray-700 opacity-0 shadow-xs transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100">
            <ChevronRight className="size-4" />
          </button>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface/90 px-2 py-0.5 text-2xs text-gray-600">
            {index + 1} / {count}
          </span>
        </>
      )}
      <div className="absolute top-2 right-2 flex gap-1">
        {photo && (
          <>
            <EyeToggle value={photo.file.visibility} onToggle={onToggle} className="bg-surface/90" />
            {!photo.cover && !photo.linkId.startsWith("owner:") && (
              <GalleryAction label="Make main photo" onClick={onMain}>
                <Star className="size-3.5" />
              </GalleryAction>
            )}
            <GalleryAction label="Remove from this model" onClick={onRemove}>
              <Trash2 className="size-3.5" />
            </GalleryAction>
          </>
        )}
        <GalleryAction label="Add photos" onClick={() => input.current?.click()}>
          <ImagePlus className="size-3.5" />
        </GalleryAction>
      </div>
      {photo?.cover && count > 1 && (
        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-2xs font-medium text-gray-700">Main</span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = "";
          if (list.length) onAdd(list);
        }}
      />
    </div>
  );
}

function GalleryAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="inline-flex size-6 items-center justify-center rounded-md bg-surface/90 text-gray-600 opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-gray-900 focus-visible:opacity-100"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Drop anything here: manuals, spec sheets, videos. Files from the family and above show below. */
function FilesBox({
  documents,
  inherited,
  dim,
  onAdd,
  onOpen,
  onToggle,
  onRemove,
}: {
  documents: { file: FileRow; linkId: string }[];
  inherited: { label: string; items: { file: FileRow; linkId: string }[] }[];
  dim: (value: Visibility) => boolean;
  onAdd: (files: File[]) => void;
  onOpen: (id: string) => void;
  onToggle: (file: FileRow) => void;
  onRemove: (linkId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <section
      aria-label="Files"
      className={cn("flex flex-col gap-4 rounded-[14px] bg-sunken p-4", over && "bg-blue-50 outline-1 outline-blue-500 outline-dashed -outline-offset-2")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onAdd([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-2xs font-medium tracking-caps text-gray-500 uppercase">Files</p>
        <Button variant="ghost" size="xs" onClick={() => input.current?.click()}>
          <Upload />
          Add files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            e.target.value = "";
            if (list.length) onAdd(list);
          }}
        />
      </div>
      {documents.length ? (
        <FileGrid items={documents} dim={dim} onOpen={onOpen} onToggle={onToggle} onRemove={onRemove} />
      ) : (
        <p className="py-4 text-center text-xs text-gray-500">Drop manuals, spec sheets or videos here.</p>
      )}
      {inherited.map((group) => (
        <div key={group.label} className="grid gap-2">
          <p className="text-2xs text-gray-500">{group.label}</p>
          <FileGrid items={group.items} dim={dim} onOpen={onOpen} onToggle={onToggle} />
        </div>
      ))}
    </section>
  );
}

function FileGrid({
  items,
  dim,
  onOpen,
  onToggle,
  onRemove,
}: {
  items: { file: FileRow; linkId: string }[];
  dim: (value: Visibility) => boolean;
  onOpen: (id: string) => void;
  onToggle: (file: FileRow) => void;
  onRemove?: (linkId: string) => void;
}) {
  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
      {items.map(({ file, linkId }) => (
        <div key={file.id} className={cn("group/item relative flex items-center gap-2 rounded-[10px] bg-surface p-2 transition-opacity", dim(file.visibility) && "opacity-40")}>
          <button type="button" onClick={() => onOpen(file.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">
              {isPhoto(file) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.thumbUrl} alt="" className="size-full object-cover" />
              ) : (
                <FileText className="size-4 text-gray-500" aria-hidden />
              )}
            </span>
            <span className="min-w-0 truncate text-xs font-medium text-gray-900">{file.name}</span>
          </button>
          {/* Over the tile's right edge on hover, so the name keeps the whole width. */}
          <span className="pointer-events-none absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center rounded-md bg-surface opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 focus-within:opacity-100">
            <EyeToggle value={file.visibility} onToggle={() => onToggle(file)} />
            {onRemove && (
              <button
                type="button"
                aria-label={`Remove ${file.name} from this model`}
                onClick={() => onRemove(linkId)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-gray-100 hover:text-danger-text focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

const measure = (value: number | null) => (value == null ? "—" : String(Number(value.toFixed(2))));

function VariantRow({
  product: p,
  price,
  visibility,
  dimmed,
  differs,
  canRemove,
  onToggle,
  onRemove,
}: {
  product: ProductRow;
  price: { value: number } | null;
  visibility: Visibility;
  dimmed: boolean;
  differs: { dimensions: boolean; cutout: boolean; weight: boolean };
  canRemove: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const own = [
    { label: "Dimensions", value: `${measure(p.width)} × ${measure(p.length)} × ${measure(p.height)}`, flag: differs.dimensions },
    { label: "Cut-out", value: `${measure(p.cutoutWidth)} × ${measure(p.cutoutLength)} × ${measure(p.cutoutHeight)}`, flag: differs.cutout },
    { label: "Weight", value: measure(p.weight), flag: differs.weight },
  ];
  return (
    <div className={cn("group/item rounded-[10px] bg-surface transition-opacity", dimmed && "opacity-40")}>
      <div className="flex items-start gap-1 p-3 pb-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium text-gray-900">{p.name}</span>
          <span className="block font-mono text-2xs text-gray-500">
            ID {p.code} · {p.sku}
          </span>
        </button>
        <EyeToggle value={visibility} onToggle={onToggle} />
        {canRemove && (
          <button
            type="button"
            aria-label={`Take ${p.name} out of this model`}
            onClick={onRemove}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-gray-100 hover:text-danger-text focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-3 text-xs">
        <span className={p.availableQty > 0 ? "text-gray-700" : "text-warning-text"}>
          {p.availableQty > 0 ? `${formatQty(p.availableQty)} available` : "Out of stock"}
        </span>
        <span className={cn("tabular-nums", price ? "text-gray-700" : "font-medium text-warning-text")}>
          {p.b2bPrice > 0 ? formatMoney(p.b2bPrice) : "No price"}
        </span>
      </div>
      {(open || own.some((row) => row.flag)) && (
        <dl className="grid gap-1 border-t border-gray-100 px-3 py-2 text-2xs">
          {own
            .filter((row) => open || row.flag)
            .map((row) => (
              <div key={row.label} className="flex justify-between gap-2">
                <dt className="text-gray-500">{row.label}</dt>
                <dd className={cn("tabular-nums", row.flag ? "text-warning-text" : "text-gray-700")}>{row.value}</dd>
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}

/** Puts another product in this model. Like the QuickBooks link picker: search, then pick. */
function ProductPicker({ products, current, onPick }: { products: ProductRow[]; current: ProductRow[]; onPick: (p: ProductRow) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = new Set(current.map((p) => p.id));
  const q = text.trim().toLowerCase();
  const shown = products
    .filter((p) => !ids.has(p.id) && (!q || `${p.name} ${p.code} ${p.sku}`.toLowerCase().includes(q)))
    .slice(0, 40);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Add a product to this model"
            className="flex h-10 items-center justify-center rounded-[10px] text-gray-500 transition-colors hover:bg-surface hover:text-gray-900"
          />
        }
      >
        <Plus className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-1 p-2">
        <Input autoFocus value={text} placeholder="Search products by name, ID or SKU" onChange={(e) => setText(e.target.value)} />
        <div className="no-scrollbar max-h-64 overflow-auto">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-gray-50 disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                await onPick(p);
                setBusy(false);
                setText("");
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block truncate text-2xs text-gray-500">
                  <span className="font-mono">{p.code}</span> · {[p.category, p.model].filter(Boolean).join(" › ") || "No family"}
                </span>
              </span>
              {p.tag && <span className="shrink-0 text-2xs text-gray-500">in {p.tag.name}</span>}
            </button>
          ))}
          {!shown.length && <p className="px-2 py-1.5 text-xs text-gray-500">Nothing matches.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
