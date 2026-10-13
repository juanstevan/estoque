"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, EyeClosed, FileText, ImagePlus, Plus, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eyebrow, SpecRow, WeightRow, type ProductRow } from "@/components/chaleur/ProductDialog";
import type { FileRow, LinkTarget } from "@/components/chaleur/MediaLibrary";
import { downloadAs } from "@/components/chaleur/ProductPhotos";
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
 * Every item carries an eye: closed (this app), half (builders), open (everyone). Photos are
 * always public, so they have none; they show in the order arranged here, the first is the main one.
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

type SpecKey = "width" | "length" | "height" | "cutoutWidth" | "cutoutLength" | "cutoutHeight" | "weight";
const PRODUCT_KEYS: [SpecKey, SpecKey, SpecKey] = ["width", "length", "height"];
const CUTOUT_KEYS: [SpecKey, SpecKey, SpecKey] = ["cutoutWidth", "cutoutLength", "cutoutHeight"];
/** The product card's slot names, to the value each one edits. */
const SPEC_KEY: Record<string, SpecKey> = {
  "dim-product-W": "width",
  "dim-product-D": "length",
  "dim-product-H": "height",
  "dim-cutout-W": "cutoutWidth",
  "dim-cutout-D": "cutoutLength",
  "dim-cutout-H": "cutoutHeight",
  weight: "weight",
};

function Varies({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      {show && <span className="text-2xs text-warning-text">Varies</span>}
    </div>
  );
}

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
  onOpenProduct,
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
  onOpenProduct: (id: string) => void;
}) {
  return (
    <Dialog open={model != null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[72dvh] w-[min(1180px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
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
            onOpenProduct={onOpenProduct}
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
  onOpenProduct,
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
  onOpenProduct: (id: string) => void;
}) {
  const [audience, setAudience] = useState<Visibility>("internal");
  const [fieldOverride, setFieldOverride] = useState<Partial<Record<string, Visibility>>>({});
  const [photoIndex, setPhotoIndex] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  // One spec slot open at a time, like the product card. Closing it saves to every variant.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Record<SpecKey, number | null>>>({});
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

  const photos = placed.own.filter((x) => isPhoto(x.file)).sort((a, b) => a.file.position - b.file.position);
  const documents = placed.own.filter((x) => !isPhoto(x.file));
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
  const arrange = (ids: string[]) => run(() => post("/api/media", { action: "arrange", ids }));
  const renamePhoto = (id: string, name: string) => run(() => post("/api/media", { action: "rename-file", id, name }));
  function makeMain(id: string) {
    setPhotoIndex(0);
    void arrange([id, ...photos.map((x) => x.file.id).filter((other) => other !== id)]);
  }

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

  const same = (key: SpecKey) => variants.every((p) => p[key] === first[key]);
  const spec = (key: SpecKey) => (key in draft ? (draft[key] ?? null) : same(key) ? first[key] : null);
  const varies = (keys: SpecKey[]) => keys.some((key) => !(key in draft) && !same(key));
  const specs = (keys: [SpecKey, SpecKey, SpecKey]) => keys.map(spec) as [number | null, number | null, number | null];
  function typeSpec(keys: SpecKey[], values: (number | null)[]) {
    const key = editing ? SPEC_KEY[editing] : undefined;
    if (key && keys.includes(key)) setDraft((d) => ({ ...d, [key]: values[keys.indexOf(key)] ?? null }));
  }
  function closeSpec() {
    const key = editing ? SPEC_KEY[editing] : undefined;
    setEditing(null);
    if (!key || !(key in draft)) return;
    const value = draft[key] ?? null;
    const forget = () =>
      setDraft((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
    if (same(key) && first[key] === value) return forget();
    void saveShared({ [key]: value }).then(forget);
  }

  return (
    <>
      <DialogTitle className="sr-only">{model.name}</DialogTitle>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="no-scrollbar flex min-h-0 flex-col gap-6 overflow-y-auto p-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <Gallery
              photo={photo}
              count={photos.length}
              index={Math.min(photoIndex, Math.max(0, photos.length - 1))}
              onStep={(d) => setPhotoIndex((i) => (i + d + photos.length) % photos.length)}
              onAdd={upload}
              onRemove={() => photo && void unlink(photo.linkId)}
              onMain={() => photo && makeMain(photo.file.id)}
              onOpen={() => photo && setViewing(photo.file.id)}
            />
            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Item value={field("title")} dimmed={dim(field("title"))} onToggle={() => toggleField("title")}>
                      <InlineText value={model.name} label="Model name" onSave={rename} className="text-xl font-semibold text-gray-900" />
                    </Item>
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => setAudience(nextVisibility(audience))}
                          className="mt-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-sunken px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-150"
                        />
                      }
                    >
                      <EyeIcon value={audience} className="size-3.5" />
                      {AUDIENCE_LABEL[audience]}
                    </TooltipTrigger>
                    <TooltipContent>See what each audience sees. Hidden items fade.</TooltipContent>
                  </Tooltip>
                </div>
                <Item value={field("id")} dimmed={dim(field("id"))} onToggle={() => toggleField("id")}>
                  <p className="font-mono text-xs text-gray-500">ID {variants.map((p) => p.code).join(" · ")}</p>
                </Item>
              </div>
              <Item value={field("price")} dimmed={dim(field("price"))} onToggle={() => toggleField("price")} label="B2B price">
                <div className="flex items-baseline gap-1 text-2xl font-semibold text-gray-900">
                  <span className="text-gray-400">$</span>
                  <NumberField
                    values={variants.map((p) => (p.b2bPrice > 0 ? p.b2bPrice : null))}
                    label="B2B price for every variant"
                    money
                    className="w-40 text-2xl font-semibold"
                    onSave={(value) => value != null && saveShared({ b2bPrice: value })}
                  />
                </div>
              </Item>
              {/* The product card's Specs rows; a value the variants don't share shows "—" and Varies. */}
              <div className="grid gap-3 border-t border-gray-150 pt-[13px]">
                <Eyebrow>Specs</Eyebrow>
                <Item value={field("dimensions")} dimmed={dim(field("dimensions"))} onToggle={() => toggleField("dimensions")}>
                  <Varies show={varies(PRODUCT_KEYS)}>
                    <SpecRow
                      label="Product"
                      values={specs(PRODUCT_KEYS)}
                      editingField={editing}
                      fieldPrefix="dim-product"
                      onOpen={setEditing}
                      onDone={closeSpec}
                      onChange={(values) => typeSpec(PRODUCT_KEYS, values)}
                      isCreate={false}
                    />
                  </Varies>
                </Item>
                <Item value={field("cutout")} dimmed={dim(field("cutout"))} onToggle={() => toggleField("cutout")}>
                  <Varies show={varies(CUTOUT_KEYS)}>
                    <SpecRow
                      label="Cut-Out"
                      values={specs(CUTOUT_KEYS)}
                      editingField={editing}
                      fieldPrefix="dim-cutout"
                      onOpen={setEditing}
                      onDone={closeSpec}
                      onChange={(values) => typeSpec(CUTOUT_KEYS, values)}
                      isCreate={false}
                    />
                  </Varies>
                </Item>
                <Item value={field("weight")} dimmed={dim(field("weight"))} onToggle={() => toggleField("weight")}>
                  <Varies show={varies(["weight"])}>
                    <WeightRow
                      value={spec("weight")}
                      active={editing === "weight"}
                      onActivate={() => setEditing("weight")}
                      onDone={closeSpec}
                      onChange={(value) => typeSpec(["weight"], [value])}
                    />
                  </Varies>
                </Item>
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
              differs={{
                dimensions: !shared((v) => `${v.width}|${v.length}|${v.height}`),
                cutout: !shared((v) => `${v.cutoutWidth}|${v.cutoutLength}|${v.cutoutHeight}`),
                weight: !shared((v) => v.weight),
              }}
              canRemove={Boolean(model.tagId)}
              onOpen={() => onOpenProduct(p.id)}
              onRemove={() => void removeProduct(p)}
            />
          ))}
          <ProductPicker products={products} current={variants} onPick={addProduct} />
        </aside>
      </div>
      <Lightbox photos={photos} openId={viewing} onOpenId={setViewing} onArrange={arrange} onRename={renamePhoto} />
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

type Placed = { file: FileRow; linkId: string; cover: boolean };

/**
 * The model's photos, like the old product card. The actions are on hover: make main, add,
 * remove, download. A click on the photo opens them large, where the name can be changed.
 */
function Gallery({
  photo,
  count,
  index,
  onStep,
  onAdd,
  onRemove,
  onMain,
  onOpen,
}: {
  photo: Placed | null;
  count: number;
  index: number;
  onStep: (d: number) => void;
  onAdd: (files: File[]) => void;
  onRemove: () => void;
  onMain: () => void;
  onOpen: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
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
      {photo ? (
        <button type="button" className="flex size-full items-center justify-center p-6" onClick={onOpen} aria-label="Open photos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.file.url} alt={photo.file.name} className="max-h-full max-w-full object-contain" />
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
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface/90 px-2 py-0.5 text-2xs text-gray-600">
            {index + 1} / {count}
          </span>
        </>
      )}
      {photo && (
        <>
          <div className="absolute top-2 right-2 flex gap-1">
            {index > 0 && (
              <GalleryAction label="Make main photo" onClick={onMain}>
                <Star className="size-3.5" />
              </GalleryAction>
            )}
            <GalleryAction label="Add photos" onClick={() => input.current?.click()}>
              <ImagePlus className="size-3.5" />
            </GalleryAction>
            <GalleryAction label="Remove from this model" onClick={onRemove}>
              <Trash2 className="size-3.5" />
            </GalleryAction>
            <GalleryAction label="Download" onClick={() => void downloadAs(photo.file.url, photo.file.fileName)}>
              <Download className="size-3.5" />
            </GalleryAction>
          </div>
          {index === 0 && count > 1 && (
            <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-2xs font-medium text-gray-700">Main</span>
          )}
        </>
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

/** Moves `from` to where `to` is. */
function move(list: string[], from: string, to: string) {
  const next = list.filter((id) => id !== from);
  next.splice(list.indexOf(to), 0, from);
  return next;
}

/**
 * The photos large, Amazon style: thumbnails down the side. Drag a thumbnail to change the order;
 * the first is the main one. The name above the photo changes on click.
 */
function Lightbox({
  photos,
  openId,
  onOpenId,
  onArrange,
  onRename,
}: {
  photos: Placed[];
  openId: string | null;
  onOpenId: (id: string | null) => void;
  onArrange: (ids: string[]) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  // The order being dragged; it stays until the saved order comes back.
  const [order, setOrder] = useState<string[] | null>(null);
  const dragged = useRef<string | null>(null);
  const ids = photos.map((x) => x.file.id);
  const shownIds = order && order.length === ids.length && order.every((id) => ids.includes(id)) ? order : ids;
  const byId = new Map(photos.map((x) => [x.file.id, x]));
  const current = byId.get(openId ?? "") ?? photos[0] ?? null;
  return (
    <Dialog open={openId != null} onOpenChange={(next) => !next && onOpenId(null)}>
      <DialogContent className="flex h-[86dvh] w-[min(1100px,94vw)] max-w-none gap-4 p-4 sm:max-w-none">
        <DialogTitle className="sr-only">{current?.file.name ?? "Photos"}</DialogTitle>
        <div className="no-scrollbar flex w-16 shrink-0 flex-col gap-2 overflow-y-auto" aria-label="Photos, drag to reorder">
          {shownIds.map((id) => {
            const x = byId.get(id)!;
            return (
              <button
                key={id}
                type="button"
                draggable
                aria-label={`Show ${x.file.name}`}
                aria-current={id === current?.file.id}
                onClick={() => onOpenId(id)}
                onMouseEnter={() => onOpenId(id)}
                onDragStart={(e) => {
                  dragged.current = id;
                  e.dataTransfer.effectAllowed = "move";
                  setOrder(shownIds);
                }}
                onDragOver={(e) => {
                  const from = dragged.current;
                  if (!from) return;
                  e.preventDefault();
                  if (from !== id) setOrder((list) => move(list ?? shownIds, from, id));
                }}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={async () => {
                  dragged.current = null;
                  if (order && order.join() !== ids.join()) await onArrange(order);
                  setOrder(null);
                }}
                className={cn(
                  "size-16 shrink-0 cursor-grab overflow-hidden rounded-md bg-sunken p-1 ring-2 ring-transparent ring-inset active:cursor-grabbing",
                  id === current?.file.id && "ring-gray-900",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.file.thumbUrl} alt="" draggable={false} className="size-full object-contain" />
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {current && (
            <div className="min-w-0 pr-8">
              <InlineText
                key={current.file.id}
                value={current.file.name}
                label="Photo name"
                onSave={(name) => onRename(current.file.id, name)}
                className="text-sm font-medium text-gray-900 ring-0"
              />
            </div>
          )}
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-[14px] bg-sunken p-6">
            {current && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.file.url} alt={current.file.name} className="max-h-full max-w-full object-contain" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
      className={cn("flex flex-1 flex-col gap-4 rounded-[14px] bg-sunken p-4", over && "bg-blue-50 outline-1 outline-blue-500 outline-dashed -outline-offset-2")}
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
        <p className="m-auto py-4 text-center text-xs text-gray-500">Drop manuals, spec sheets or videos here.</p>
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
        <div key={file.id} className={cn("group/item relative flex items-center gap-2 rounded-[10px] bg-surface p-2 transition-opacity", !isPhoto(file) && dim(file.visibility) && "opacity-40")}>
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
            {!isPhoto(file) && <EyeToggle value={file.visibility} onToggle={() => onToggle(file)} />}
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

/** One product in the model. A click opens its product card; values it doesn't share are flagged. */
function VariantRow({
  product: p,
  price,
  differs,
  canRemove,
  onOpen,
  onRemove,
}: {
  product: ProductRow;
  price: { value: number } | null;
  differs: { dimensions: boolean; cutout: boolean; weight: boolean };
  canRemove: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const flagged = [
    { label: "Dimensions", value: `${measure(p.width)} × ${measure(p.length)} × ${measure(p.height)}`, flag: differs.dimensions },
    { label: "Cut-out", value: `${measure(p.cutoutWidth)} × ${measure(p.cutoutLength)} × ${measure(p.cutoutHeight)}`, flag: differs.cutout },
    { label: "Weight", value: measure(p.weight), flag: differs.weight },
  ].filter((row) => row.flag);
  return (
    <div className="group/item relative rounded-[10px] bg-surface transition-colors hover:bg-gray-50">
      <button type="button" onClick={onOpen} aria-label={`Open the product card for ${p.name}`} className="block w-full p-3 text-left">
        <span className="block pr-5 text-sm font-medium text-gray-900">{p.name}</span>
        <span className="block font-mono text-2xs text-gray-500">
          ID {p.code} · {p.sku}
        </span>
        <span className="mt-2 flex items-center justify-between text-xs">
          <span className={p.availableQty > 0 ? "text-gray-700" : "text-warning-text"}>
            {p.availableQty > 0 ? `${formatQty(p.availableQty)} available` : "Out of stock"}
          </span>
          <span className={cn("tabular-nums", price ? "text-gray-700" : "font-medium text-warning-text")}>
            {p.b2bPrice > 0 ? formatMoney(p.b2bPrice) : "No price"}
          </span>
        </span>
      </button>
      {canRemove && (
        <button
          type="button"
          aria-label={`Take ${p.name} out of this model`}
          onClick={onRemove}
          className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-gray-100 hover:text-danger-text focus-visible:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
      {flagged.length > 0 && (
        <dl className="grid gap-1 border-t border-gray-100 px-3 py-2 text-2xs">
          {flagged.map((row) => (
            <div key={row.label} className="flex justify-between gap-2">
              <dt className="text-gray-500">{row.label}</dt>
              <dd className="tabular-nums text-warning-text">{row.value}</dd>
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
