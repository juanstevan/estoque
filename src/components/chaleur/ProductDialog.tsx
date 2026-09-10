"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  ImagePlus,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { formatMoney, formatQty, TRANSACTION_TYPE_LABELS } from "@/lib/format";
import { calcWeightedAverageCost } from "@/lib/inventory/math";
import { cn } from "@/lib/utils";

export type ProductRow = {
  id: string;
  code: string;
  name: string;
  sku: string;
  physicalQty: number;
  availableQty: number;
  reservedQty: number;
  avgCost: number;
  inventoryValue: number;
  b2bPrice: number;
  b2cPrice: number;
  fobCost: number;
  cifCost: number;
  lastSoldPrice: number;
  amazonUrl: string | null;
  imageUrl: string | null;
  notes: string | null;
  suppliers: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  packageLength: number | null;
  packageWidth: number | null;
  packageHeight: number | null;
  packageWeight: number | null;
  cutoutLength: number | null;
  cutoutWidth: number | null;
  cutoutHeight: number | null;
};

type Detail = ProductRow & {
  transactions: Array<{
    id: string;
    type: string;
    quantity: number;
    unitCost: number;
    totalValue: number;
    reference: string | null;
    clientName: string | null;
    notes: string | null;
    occurredAt: string;
  }>;
  orderLines: Array<{
    orderedQty: number;
    reservedQty: number;
    unitPrice: number;
    order: { externalRef: string; customerName: string | null };
  }>;
};

const LBS_PER_KG = 2.20462;

function parseSuppliers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Older rows stored a plain comma-separated string.
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeSuppliers(list: string[]) {
  return JSON.stringify(list);
}

/** Soft badge colors from the Figma Product Card, cycled by index. */
const SUPPLIER_BADGE = [
  { bg: "#ffdbdb", fg: "#940606" },
  { bg: "#fff2ca", fg: "#b77100" },
  { bg: "#e3f0ff", fg: "#1a5fb4" },
  { bg: "#e6f4ea", fg: "#1e7a3a" },
  { bg: "#f3e8ff", fg: "#6b21a8" },
] as const;

function blankDetail(): Detail {
  return {
    id: "",
    code: "",
    name: "",
    sku: "",
    physicalQty: 0,
    availableQty: 0,
    reservedQty: 0,
    avgCost: 0,
    inventoryValue: 0,
    b2bPrice: 0,
    b2cPrice: 0,
    fobCost: 0,
    cifCost: 0,
    lastSoldPrice: 0,
    amazonUrl: null,
    imageUrl: null,
    notes: null,
    suppliers: null,
    weight: null,
    length: null,
    width: null,
    height: null,
    packageLength: null,
    packageWidth: null,
    packageHeight: null,
    packageWeight: null,
    cutoutLength: null,
    cutoutWidth: null,
    cutoutHeight: null,
    transactions: [],
    orderLines: [],
  };
}

export function ProductDialog({
  open,
  productId,
  mode = "edit",
  reasons,
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: string | null;
  mode?: "edit" | "create";
  reasons: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = mode === "create";
  const [tab, setTab] = useState("info");
  /** Only one field is ever open; a double-click hands the editor over. */
  const [editingField, setEditingField] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unit, setUnit] = useState<Unit>("in");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("info");
    setError(null);
    setEditingField(null);
    if (isCreate) {
      setDetail(blankDetail());
      return;
    }
    setDetail(null);
    if (productId) {
      fetch(`/api/products/${productId}`)
        .then((r) => r.json())
        .then((row: Detail) =>
          setDetail({ ...row, code: (row.code ?? "").slice(0, 3) }),
        );
    }
  }, [open, productId, isCreate]);

  function patch(changes: Partial<Detail>) {
    setDetail((d) => (d ? { ...d, ...changes } : d));
  }

  async function uploadImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't upload that image");
      return;
    }
    patch({ imageUrl: data.url });
  }

  async function save() {
    if (!detail) return;
    setError(null);
    if (!detail.name.trim() || !detail.sku.trim()) {
      setError("Name and SKU are required");
      return;
    }
    const payload = {
      code: detail.code.trim().toUpperCase().slice(0, 3) || undefined,
      name: detail.name,
      sku: detail.sku,
      amazonUrl: detail.amazonUrl,
      imageUrl: detail.imageUrl,
      b2bPrice: detail.b2bPrice,
      b2cPrice: detail.b2cPrice,
      notes: detail.notes,
      suppliers: detail.suppliers,
      weight: detail.weight,
      length: detail.length,
      width: detail.width,
      height: detail.height,
      packageLength: detail.packageLength,
      packageWidth: detail.packageWidth,
      packageHeight: detail.packageHeight,
      packageWeight: detail.packageWeight,
      cutoutLength: detail.cutoutLength,
      cutoutWidth: detail.cutoutWidth,
      cutoutHeight: detail.cutoutHeight,
    };
    setSaving(true);
    const res = isCreate
      ? await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/products/${detail.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't save the product");
      return;
    }
    setEditingField(null);
    onSaved();
    if (isCreate) onClose();
  }

  if (!open) return null;

  /** A new product has nothing to read yet, so it opens straight into inputs. */
  const isOpen = (field: string) => isCreate || editingField === field;
  const openField = (field: string) => setEditingField(field);
  const closeField = () => !isCreate && setEditingField(null);
  const suppliers: string[] = parseSuppliers(detail?.suppliers);
  const hasImage = Boolean(
    detail?.imageUrl && detail.imageUrl !== "/file.svg",
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="flex w-auto max-w-none flex-col items-center gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-none"
        >
          <DialogTitle className="sr-only">
            {isCreate ? "Create product" : "Product card"}
          </DialogTitle>

          {!detail ? (
            <div className="flex h-[720px] min-h-[720px] w-[1080px] min-w-[1080px] flex-col rounded-[9px] border border-border bg-surface p-6 shadow-md">
              <ProductSkeleton />
            </div>
          ) : (
            <>
              {/* Tabs live on the backdrop, above the white card. */}
              <div className="flex h-[54px] w-[1080px] shrink-0 items-center justify-center bg-transparent">
                {isCreate ? (
                  <div className="w-full text-md font-semibold text-gray-900">
                    Create product
                  </div>
                ) : (
                  <Tabs
                    value={tab}
                    onValueChange={(v) => {
                      setEditingField(null);
                      setTab(String(v));
                    }}
                    className="w-full gap-0"
                  >
                    <TabsList className="mx-auto w-[208px] bg-[#f2f2f7]">
                      <TabsTrigger
                        value="info"
                        className="h-6 flex-1 bg-transparent px-0 shadow-none data-active:bg-white data-active:shadow-xs"
                      >
                        Info
                      </TabsTrigger>
                      <TabsTrigger
                        value="log"
                        className="h-6 flex-1 bg-transparent px-0 shadow-none data-active:bg-white data-active:shadow-xs"
                      >
                        Log
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
              </div>

              <div className="flex h-[720px] min-h-[720px] w-[1080px] min-w-[1080px] flex-col overflow-hidden rounded-[9px] border border-border bg-surface p-6 shadow-md">
              {tab === "info" ? (
                <div className="flex min-h-0 w-full flex-1 gap-8 overflow-hidden">
                  <div className="flex w-[520px] min-w-0 shrink-0 flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="group relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[9px] border border-border bg-sunken"
                    >
                      {hasImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={detail.imageUrl!}
                          alt=""
                          className="h-full w-full object-contain"
                          onError={() => patch({ imageUrl: null })}
                        />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-surface/85 text-xs font-medium text-gray-700 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
                        <ImagePlus className="size-3.5" />
                        {hasImage ? "Change image" : "Upload image"}
                      </span>
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file);
                        e.target.value = "";
                      }}
                    />

                    <div className="flex items-start gap-[18px]">
                      <div className="grid shrink-0 gap-1.5">
                        <FieldLabel>ID</FieldLabel>
                        <EditSlot
                          active={isOpen("code")}
                          onActivate={() => openField("code")}
                          onDone={closeField}
                          className="w-9 font-mono text-sm font-medium"
                          read={detail.code || <Null />}
                        >
                          <BareField
                            autoFocus
                            className="font-mono"
                            value={detail.code}
                            placeholder="Auto"
                            aria-label="ID"
                            maxLength={3}
                            onChange={(e) =>
                              patch({
                                code: e.target.value
                                  .toUpperCase()
                                  .replace(/[^0-9A-Z]/g, "")
                                  .slice(0, 3),
                              })
                            }
                          />
                        </EditSlot>
                      </div>
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <FieldLabel>Name</FieldLabel>
                        <EditSlot
                          active={isOpen("name")}
                          onActivate={() => openField("name")}
                          onDone={closeField}
                          className="min-h-[27px] h-auto min-w-0 px-[9px] text-sm font-medium"
                          read={
                            <span className="truncate">
                              {detail.name || <Null />}
                            </span>
                          }
                        >
                          <BareField
                            autoFocus
                            value={detail.name}
                            placeholder="Complete product name"
                            aria-label="Name"
                            onChange={(e) => patch({ name: e.target.value })}
                          />
                        </EditSlot>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      {isOpen("amazonUrl") ? (
                        <div
                          className={cn(SLOT, "w-full border-gray-400")}
                          onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                              closeField();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              closeField();
                            }
                          }}
                        >
                          <BareField
                            autoFocus
                            value={detail.amazonUrl ?? ""}
                            placeholder="https://amazon.com/dp/…"
                            aria-label="Amazon URL"
                            onChange={(e) =>
                              patch({ amazonUrl: e.target.value || null })
                            }
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <FieldLabel className="shrink-0">SKU</FieldLabel>
                            <EditSlot
                              active={isOpen("sku")}
                              onActivate={() => openField("sku")}
                              onDone={closeField}
                              className="w-[117px] shrink-0 text-xs font-medium"
                              read={
                                <span className="truncate">
                                  {detail.sku || <Null />}
                                </span>
                              }
                            >
                              <BareField
                                autoFocus
                                className="text-xs"
                                value={detail.sku}
                                placeholder="SKU"
                                aria-label="SKU"
                                maxLength={12}
                                onChange={(e) => patch({ sku: e.target.value })}
                              />
                            </EditSlot>
                          </div>

                          <div className="group/amazon flex shrink-0 items-center gap-[9px]">
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label="Edit Amazon URL"
                                    className="opacity-0 transition-opacity group-hover/amazon:opacity-100"
                                    onClick={() => openField("amazonUrl")}
                                  />
                                }
                              >
                                <Pencil className="size-3" />
                              </TooltipTrigger>
                              <TooltipContent>Edit Amazon URL</TooltipContent>
                            </Tooltip>
                            {detail.amazonUrl ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      aria-label="Open Amazon page"
                                      className="h-[27px] gap-1.5 text-xs"
                                      nativeButton={false}
                                      render={
                                        <a
                                          href={detail.amazonUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        />
                                      }
                                    />
                                  }
                                >
                                  Amazon
                                  <ExternalLink className="size-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Open Amazon page
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-[27px] gap-1.5 text-xs"
                                onClick={() => openField("amazonUrl")}
                              >
                                Amazon
                                <ExternalLink className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="border-t border-gray-150 pt-3">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <SpecRow
                          label="Product"
                          values={[detail.width, detail.length, detail.height]}
                          editingField={editingField}
                          fieldPrefix="dim-product"
                          onOpen={openField}
                          onDone={closeField}
                          onChange={([w, d, h]) =>
                            patch({ width: w, length: d, height: h })
                          }
                          isCreate={isCreate}
                          unit={unit}
                          onUnitChange={setUnit}
                        />
                        <SpecRow
                          label="Package"
                          values={[
                            detail.packageWidth,
                            detail.packageLength,
                            detail.packageHeight,
                          ]}
                          editingField={editingField}
                          fieldPrefix="dim-package"
                          onOpen={openField}
                          onDone={closeField}
                          onChange={([w, d, h]) =>
                            patch({
                              packageWidth: w,
                              packageLength: d,
                              packageHeight: h,
                            })
                          }
                          isCreate={isCreate}
                          unit={unit}
                          onUnitChange={setUnit}
                        />
                        <SpecRow
                          label="Cut-Out"
                          values={[
                            detail.cutoutWidth,
                            detail.cutoutLength,
                            detail.cutoutHeight,
                          ]}
                          editingField={editingField}
                          fieldPrefix="dim-cutout"
                          onOpen={openField}
                          onDone={closeField}
                          onChange={([w, d, h]) =>
                            patch({
                              cutoutWidth: w,
                              cutoutLength: d,
                              cutoutHeight: h,
                            })
                          }
                          isCreate={isCreate}
                          unit={unit}
                          onUnitChange={setUnit}
                        />
                        <div className="flex items-center gap-1.5">
                          <FieldLabel className="shrink-0">Weight</FieldLabel>
                          <EditSlot
                            active={isOpen("weight")}
                            onActivate={() => openField("weight")}
                            onDone={closeField}
                            className="font-mono text-xs tabular-nums"
                            read={
                              detail.weight === null ? (
                                <Null />
                              ) : (
                                <span className="truncate">
                                  {detail.weight}
                                  <span className="text-gray-500">
                                    {" kg · "}
                                    {(detail.weight * LBS_PER_KG).toFixed(1)}{" "}
                                    lbs
                                  </span>
                                </span>
                              )
                            }
                          >
                            <BareField
                              autoFocus
                              className="w-9 text-xs tabular-nums"
                              inputMode="decimal"
                              aria-label="Weight in kg"
                              value={detail.weight ?? ""}
                              onChange={(e) =>
                                patch({ weight: numOrNull(e.target.value) })
                              }
                            />
                            <span className="text-xs text-gray-500">kg</span>
                          </EditSlot>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-hidden">
                    <div className="flex gap-3">
                      <div className="flex w-[84px] shrink-0 flex-col gap-8 py-[3px]">
                        <Stat
                          label="Quantity"
                          value={`${formatQty(detail.physicalQty)}un`}
                          onClick={
                            isCreate ? undefined : () => setQtyOpen(true)
                          }
                        />
                        <Stat
                          label="Available"
                          value={`${formatQty(detail.availableQty)}un`}
                        />
                        <div className="min-w-0">
                          <Popover>
                            <PopoverTrigger className="rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-gray-100">
                              <Eyebrow>Reserved</Eyebrow>
                              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-md font-medium tabular-nums text-gray-900">
                                {formatQty(detail.reservedQty)}un
                                <Search className="size-3.5 text-gray-500" />
                              </div>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="flex h-64 w-[459px] flex-col p-1.5"
                            >
                              <DataGrid
                                rows={detail.orderLines}
                                getRowId={(r) => r.order.externalRef}
                                empty="No reserved stock"
                                emptyHint="Stock is reserved once an exit invoice is on the board."
                                columns={[
                                  {
                                    key: "ref",
                                    label: "Ref.",
                                    mono: true,
                                    filterValue: (r) => r.order.externalRef,
                                    render: (r) => r.order.externalRef,
                                  },
                                  {
                                    key: "name",
                                    label: "Client",
                                    filterValue: (r) =>
                                      r.order.customerName ?? "",
                                    render: (r) =>
                                      r.order.customerName ?? <Null />,
                                  },
                                  {
                                    key: "reservedQty",
                                    label: "Qnt",
                                    numeric: true,
                                    width: "72px",
                                    render: (r) => formatQty(r.reservedQty),
                                  },
                                  {
                                    key: "unitPrice",
                                    label: "Price",
                                    numeric: true,
                                    width: "96px",
                                    render: (r) => formatMoney(r.unitPrice),
                                  },
                                ]}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <div className="grid min-w-0 flex-1 grid-cols-3 grid-rows-2 gap-x-6 gap-y-8 px-3 py-[3px]">
                        <Stat
                          label="Avg. cost"
                          value={formatMoney(detail.avgCost)}
                          center
                        />
                        <Stat
                          label="CIF cost"
                          value={formatMoney(detail.cifCost)}
                          center
                        />
                        <Stat
                          label="FOB cost"
                          value={formatMoney(detail.fobCost)}
                          center
                        />
                        <Stat
                          label="Last sold"
                          value={formatMoney(detail.lastSoldPrice)}
                          center
                        />
                        <PriceStat
                          label="B2B price"
                          value={detail.b2bPrice}
                          active={isOpen("b2bPrice")}
                          onActivate={() => openField("b2bPrice")}
                          onDone={closeField}
                          onChange={(v) => patch({ b2bPrice: v })}
                        />
                        <PriceStat
                          label="B2C price"
                          value={detail.b2cPrice}
                          active={isOpen("b2cPrice")}
                          onActivate={() => openField("b2cPrice")}
                          onDone={closeField}
                          onChange={(v) => patch({ b2cPrice: v })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 border-t border-gray-150 pt-[13px]">
                      <Eyebrow>Notes</Eyebrow>
                      <Textarea
                        className="h-[78px] min-h-[78px] resize-none px-3 py-2 text-[13px] leading-5"
                        value={detail.notes ?? ""}
                        placeholder="Notes"
                        onChange={(e) => patch({ notes: e.target.value })}
                      />
                    </div>

                    <div className="border-t border-gray-150 pt-4">
                      <Eyebrow>Suppliers</Eyebrow>
                      {suppliers.length ? (
                        <div className="mt-2 flex flex-wrap gap-3">
                          {suppliers.map((s, i) => {
                            const tone =
                              SUPPLIER_BADGE[i % SUPPLIER_BADGE.length];
                            return (
                              <span
                                key={`${s}-${i}`}
                                className="group/badge inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] leading-5"
                                style={{
                                  backgroundColor: tone.bg,
                                  color: tone.fg,
                                }}
                              >
                                <span className="truncate">{s}</span>
                                <button
                                  type="button"
                                  aria-label={`Remove ${s}`}
                                  className="-mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover/badge:opacity-100 hover:bg-black/10"
                                  onClick={() =>
                                    patch({
                                      suppliers: serializeSuppliers(
                                        suppliers.filter((_, j) => j !== i),
                                      ),
                                    })
                                  }
                                >
                                  <X className="size-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500">
                          Suppliers are picked up from the imports this product
                          arrives on.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col pb-3">
                  <DataGrid
                    rows={detail.transactions}
                    getRowId={(t) => t.id}
                    empty="No movements yet"
                    emptyHint="Imports, invoices and corrections all land here."
                    columns={[
                      {
                        key: "reference",
                        label: "Ref.",
                        mono: true,
                        width: "120px",
                        render: (t) => t.reference ?? <Null />,
                      },
                      {
                        key: "notes",
                        label: "Name",
                        render: (t) => t.notes ?? <Null />,
                      },
                      {
                        key: "type",
                        label: "Type",
                        width: "104px",
                        render: (t) =>
                          TRANSACTION_TYPE_LABELS[t.type] ?? t.type,
                      },
                      {
                        key: "clientName",
                        label: "Client",
                        render: (t) => t.clientName ?? <Null />,
                      },
                      {
                        key: "in",
                        label: "In",
                        numeric: true,
                        width: "88px",
                        sortValue: (t) => (t.quantity > 0 ? t.quantity : 0),
                        render: (t) =>
                          t.quantity > 0 ? (
                            `${formatQty(t.quantity)}un`
                          ) : (
                            <Null />
                          ),
                      },
                      {
                        key: "out",
                        label: "Out",
                        numeric: true,
                        width: "88px",
                        sortValue: (t) =>
                          t.quantity < 0 ? Math.abs(t.quantity) : 0,
                        render: (t) =>
                          t.quantity < 0 ? (
                            `${formatQty(Math.abs(t.quantity))}un`
                          ) : (
                            <Null />
                          ),
                      },
                      {
                        key: "unitCost",
                        label: "Price",
                        numeric: true,
                        width: "104px",
                        render: (t) => formatMoney(t.unitCost),
                      },
                      {
                        key: "totalValue",
                        label: "Total",
                        numeric: true,
                        width: "112px",
                        render: (t) => formatMoney(t.totalValue),
                      },
                    ]}
                  />
                </div>
              )}

              <DialogFooter className="mx-0 mb-0 mt-0 h-8 shrink-0 border-0 bg-transparent px-0 py-0 sm:h-8 sm:justify-between">
                <ErrorText>{error}</ErrorText>
                <div className="flex h-8 items-center gap-2">
                  <Button variant="secondary" className="h-8" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button className="h-8" disabled={saving} onClick={() => void save()}>
                    {saving
                      ? "Saving…"
                      : isCreate
                        ? "Create product"
                        : "Save changes"}
                  </Button>
                </div>
              </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {detail && !isCreate && (
        <QuantityDialog
          open={qtyOpen}
          product={detail}
          reasons={reasons}
          onClose={() => setQtyOpen(false)}
          onSaved={() => {
            setQtyOpen(false);
            onSaved();
            if (productId) {
              fetch(`/api/products/${productId}`)
                .then((r) => r.json())
                .then(setDetail);
            }
          }}
        />
      )}
    </>
  );
}

function QuantityDialog({
  open,
  product,
  reasons,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: ProductRow;
  reasons: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(product.avgCost);
  const [reason, setReason] = useState(reasons[0] ?? "Correction");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("add");
    setQuantity(1);
    setPrice(product.avgCost);
    setReason(reasons[0] ?? "Correction");
    setError(null);
  }, [open, product.avgCost, reasons]);

  const preview = useMemo(
    () =>
      mode === "add"
        ? calcWeightedAverageCost({
            existingQty: product.physicalQty,
            existingValue: product.inventoryValue,
            incomingQty: quantity,
            incomingUnitCost: price,
          })
        : {
            newQty: product.physicalQty - quantity,
            newAvgCost: product.avgCost,
            newValue: (product.physicalQty - quantity) * product.avgCost,
          },
    [mode, product, quantity, price],
  );

  async function save() {
    const res = await fetch("/api/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        mode,
        quantity,
        price,
        reason,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't save the adjustment");
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className="gap-5">
        <DialogTitle>Change quantity</DialogTitle>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "add" | "remove")}>
          <TabsList className="w-52">
            <TabsTrigger value="remove">Remove</TabsTrigger>
            <TabsTrigger value="add">Add</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid w-24 gap-1">
            <Label htmlFor="adjust-qty">Quantity</Label>
            <Input
              id="adjust-qty"
              className="tabular-nums"
              inputMode="numeric"
              value={String(quantity)}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
            />
          </div>
          <div className="grid w-28 gap-1">
            <Label htmlFor="adjust-price">Price</Label>
            <Input
              id="adjust-price"
              className="tabular-nums"
              inputMode="decimal"
              value={String(price)}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
            />
          </div>
          <div className="grid min-w-45 flex-1 gap-1">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-sunken p-4">
          <Stat
            label="Old quantity"
            value={`${formatQty(product.physicalQty)}un`}
          />
          <Stat label="New quantity" value={`${formatQty(preview.newQty)}un`} />
          <Stat label="New cost" value={formatMoney(preview.newAvgCost)} />
        </div>

        <DialogFooter className="sm:justify-between">
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>
              {mode === "add" ? "Add stock" : "Remove stock"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function numOrNull(v: string) {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-2xs font-medium tracking-caps text-gray-500 uppercase">
      {children}
    </div>
  );
}

function Null() {
  return <span className="text-gray-400">—</span>;
}

function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return <span />;
  return (
    <span className="flex items-center gap-1.5 text-xs text-danger-text">
      <AlertCircle className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

function ProductSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col gap-8">
      <div className="h-8 w-52 rounded-md bg-gray-100" />
      <div className="flex flex-1 gap-8">
        <div className="aspect-[480/382] w-[46%] rounded-[10px] bg-gray-100" />
        <div className="grid flex-1 content-start gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-full rounded-sm bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Read and edit share one box. The border is always there (transparent until
 * editing) so opening a field never resizes it. Hover gray is the whole slot;
 * the input inside has no chrome of its own.
 */
const SLOT =
  "box-border flex h-[27px] items-center gap-1 overflow-hidden rounded-md border px-1.5 text-sm leading-none text-gray-900";

function BareField({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      style={{ boxShadow: "none" }}
      className={cn(
        "h-full w-full min-w-0 appearance-none rounded-none border-0 bg-transparent p-0 text-inherit outline-none ring-0",
        className,
      )}
    />
  );
}

function EditSlot({
  active,
  onActivate,
  onDone,
  read,
  className,
  children,
}: {
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
  read: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={active ? undefined : "button"}
      tabIndex={active ? undefined : 0}
      title={active ? undefined : "Double-click to edit"}
      onDoubleClick={active ? undefined : onActivate}
      onBlur={
        active
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) onDone();
            }
          : undefined
      }
      onKeyDown={(e) => {
        if (active && (e.key === "Enter" || e.key === "Escape")) {
          e.preventDefault();
          e.stopPropagation();
          onDone();
          return;
        }
        if (!active && e.key === "Enter") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        SLOT,
        "shadow-none focus-visible:shadow-none",
        active
          ? "border-gray-400 bg-surface"
          : "cursor-text border-transparent outline-none select-none hover:bg-gray-100 focus-visible:bg-gray-100",
        className,
      )}
    >
      {active ? children : read}
    </div>
  );
}

function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("text-2xs font-medium text-gray-600 select-none", className)}
    >
      {children}
    </div>
  );
}

const DIM_AXES = ["W", "D", "H"] as const;
const UNITS = ["in", "cm"] as const;
type Unit = (typeof UNITS)[number];

/** The unit is a choice between two values, so editing it opens a list rather
 *  than a text box. The closed box matches the open trigger, so picking a unit
 *  never moves the numbers beside it. */
function UnitSelect({
  value,
  onChange,
  active,
  onActivate,
  onDone,
}: {
  value: Unit;
  onChange: (v: Unit) => void;
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
}) {
  if (!active) {
    return (
      <div
        role="button"
        tabIndex={0}
        title="Double-click to change unit"
        onDoubleClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onActivate();
          }
        }}
        className={cn(
          SLOT,
          "w-[30px] cursor-text justify-center px-1.5 text-xs text-gray-500 outline-none select-none hover:bg-gray-100 focus-visible:bg-gray-100",
        )}
      >
        {value}
      </div>
    );
  }
  return (
    <div className={cn(SLOT, "w-[30px] justify-center border-gray-400 px-1")}>
      <select
        autoFocus
        value={value}
        aria-label="Dimension unit"
        onChange={(e) => onChange(e.target.value as Unit)}
        onBlur={onDone}
        style={{ boxShadow: "none" }}
        className="h-full w-full border-0 bg-transparent p-0 text-center text-xs text-gray-900 outline-none"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

/** One W/D/H chip: hover/edit the number only; letter stays glued in read state. */
function DimAxis({
  value,
  axis,
  active,
  onActivate,
  onDone,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  axis: (typeof DIM_AXES)[number];
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
  onChange: (v: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <EditSlot
      active={active}
      onActivate={onActivate}
      onDone={onDone}
      className="w-[45px] justify-center px-1.5 text-xs"
      read={
        <span className="truncate">
          <span className="font-mono tabular-nums">{value ?? "—"}</span>
          {axis}
        </span>
      }
    >
      <BareField
        autoFocus
        className="text-center font-mono text-xs tabular-nums"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => onChange(numOrNull(e.target.value))}
      />
    </EditSlot>
  );
}

function SpecRow({
  label,
  values,
  editingField,
  fieldPrefix,
  onOpen,
  onDone,
  onChange,
  isCreate,
  unit,
  onUnitChange,
}: {
  label: string;
  values: [number | null, number | null, number | null];
  editingField: string | null;
  fieldPrefix: string;
  onOpen: (field: string) => void;
  onDone: () => void;
  onChange: (v: [number | null, number | null, number | null]) => void;
  isCreate: boolean;
  unit: Unit;
  onUnitChange: (v: Unit) => void;
}) {
  return (
    <div className="flex items-center gap-[3px]">
      <FieldLabel className="shrink-0">{label}</FieldLabel>
      <div className="flex min-w-0 items-center gap-[3px] text-xs text-gray-900">
        {DIM_AXES.map((axis, i) => {
          const field = `${fieldPrefix}-${axis}`;
          const active = isCreate || editingField === field;
          return (
            <div key={axis} className="flex items-center gap-[3px]">
              {i > 0 && <span className="text-gray-400">×</span>}
              <DimAxis
                value={values[i]}
                axis={axis}
                active={active}
                onActivate={() => onOpen(field)}
                onDone={onDone}
                ariaLabel={`${label} ${axis}`}
                onChange={(v) => {
                  const next = [...values] as [
                    number | null,
                    number | null,
                    number | null,
                  ];
                  next[i] = v;
                  onChange(next);
                }}
              />
            </div>
          );
        })}
        <UnitSelect
          value={unit}
          onChange={onUnitChange}
          active={editingField === `${fieldPrefix}-unit`}
          onActivate={() => onOpen(`${fieldPrefix}-unit`)}
          onDone={onDone}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
  center,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  center?: boolean;
}) {
  const content = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <div
        className={cn(
          "mt-0.5 flex items-center gap-1.5 font-mono text-md font-medium tabular-nums text-gray-900",
          center && "justify-center",
        )}
      >
        {value}
        {onClick && <Pencil className="size-3 text-gray-500" />}
      </div>
    </>
  );
  const box = cn(
    "min-w-0 rounded-md px-1.5 py-0.5",
    center && "text-center",
  );
  if (!onClick) return <div className={box}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(box, "w-full text-left outline-none hover:bg-gray-100")}
    >
      {content}
    </button>
  );
}

function PriceStat({
  label,
  value,
  active,
  onActivate,
  onDone,
  onChange,
}: {
  label: string;
  value: number;
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <div className="min-w-0 text-center">
      <Eyebrow>{label}</Eyebrow>
      <EditSlot
        active={active}
        onActivate={onActivate}
        onDone={onDone}
        className="mt-0.5 h-[30px] w-full min-w-0 justify-center px-[3px] text-center font-mono text-md font-medium tabular-nums"
        read={formatMoney(value)}
      >
        <BareField
          autoFocus
          className="text-center text-md font-medium tabular-nums"
          inputMode="decimal"
          aria-label={label}
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      </EditSlot>
    </div>
  );
}
