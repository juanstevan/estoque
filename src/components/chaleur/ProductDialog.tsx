"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  ImagePlus,
  Pencil,
  Search,
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
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("info");
    setError(null);
    if (isCreate) {
      setDetail(blankDetail());
      setEditing(true);
      return;
    }
    setEditing(false);
    setDetail(null);
    if (productId) {
      fetch(`/api/products/${productId}`)
        .then((r) => r.json())
        .then(setDetail);
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
      code: detail.code || undefined,
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
    setEditing(false);
    onSaved();
    if (isCreate) onClose();
  }

  if (!open) return null;

  const locked = !isCreate && !editing;
  const suppliersText: string = (() => {
    try {
      return (JSON.parse(detail?.suppliers || "[]") as string[]).join(", ");
    } catch {
      return detail?.suppliers ?? "";
    }
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[88vh] max-h-[860px] w-full flex-col gap-0 p-0 sm:max-w-[880px]"
        >
          <DialogTitle className="sr-only">
            {isCreate ? "Create product" : "Product card"}
          </DialogTitle>

          {!detail ? (
            <ProductSkeleton />
          ) : (
            <>
              <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-6">
                {isCreate ? (
                  <div className="text-md font-semibold text-gray-900">
                    Create product
                  </div>
                ) : (
                  <Tabs
                    value={tab}
                    onValueChange={setTab}
                    className="h-full self-stretch"
                  >
                    <TabsList
                      variant="line"
                      className="h-full w-fit border-b-0"
                    >
                      <TabsTrigger value="info">Info</TabsTrigger>
                      <TabsTrigger value="log">Log</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
                {!isCreate && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant={editing ? "default" : "ghost"}
                          onClick={() => setEditing((e) => !e)}
                          aria-label={
                            editing ? "Lock fields" : "Edit product details"
                          }
                        />
                      }
                    >
                      <Pencil />
                    </TooltipTrigger>
                    <TooltipContent>
                      {editing ? "Lock fields" : "Edit details"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {tab === "info" ? (
                <div className="grid min-h-0 flex-1 gap-8 overflow-auto p-6 md:grid-cols-[300px_1fr]">
                  <div className="flex flex-col gap-5">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-sunken text-gray-500"
                    >
                      {detail.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={detail.imageUrl}
                          alt=""
                          className="h-full w-full object-contain"
                          onError={() => patch({ imageUrl: null })}
                        />
                      ) : (
                        <span className="flex flex-col items-center gap-2 text-xs">
                          <ImagePlus className="size-5" />
                          Add image
                        </span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/85 text-xs font-medium text-gray-700 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
                        <ImagePlus className="size-4" />
                        {detail.imageUrl ? "Change image" : "Upload image"}
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

                    <div className="grid gap-3">
                      <FieldRow label="ID">
                        <Input
                          className="font-mono text-xs"
                          value={detail.code}
                          disabled={locked}
                          placeholder="Auto"
                          onChange={(e) => patch({ code: e.target.value })}
                        />
                      </FieldRow>
                      <FieldRow
                        label="Name"
                        action={
                          detail.amazonUrl ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    size="icon-sm"
                                    variant="secondary"
                                    aria-label="Open Amazon page"
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
                                <ExternalLink />
                              </TooltipTrigger>
                              <TooltipContent>Open Amazon page</TooltipContent>
                            </Tooltip>
                          ) : undefined
                        }
                      >
                        <Input
                          value={detail.name}
                          disabled={locked}
                          placeholder="Complete product name"
                          onChange={(e) => patch({ name: e.target.value })}
                        />
                      </FieldRow>
                      <FieldRow label="SKU">
                        <Input
                          className="font-mono text-xs"
                          value={detail.sku}
                          disabled={locked}
                          onChange={(e) => patch({ sku: e.target.value })}
                        />
                      </FieldRow>
                      {!locked && (
                        <FieldRow label="Amazon">
                          <Input
                            value={detail.amazonUrl ?? ""}
                            placeholder="https://amazon.com/dp/…"
                            onChange={(e) =>
                              patch({ amazonUrl: e.target.value || null })
                            }
                          />
                        </FieldRow>
                      )}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col gap-6">
                    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-4">
                      <Stat
                        label="Quantity"
                        value={`${formatQty(detail.physicalQty)}un`}
                        onClick={isCreate ? undefined : () => setQtyOpen(true)}
                      />
                      <Stat
                        label="Available"
                        value={`${formatQty(detail.availableQty)}un`}
                      />

                      <div className="sm:col-span-2">
                        <Popover>
                          <PopoverTrigger className="group/reserved -mx-2 -my-1 rounded-md px-2 py-1 text-left outline-none hover:bg-gray-100">
                            <Eyebrow>Reserved</Eyebrow>
                            <div className="mt-1 flex items-center gap-1.5 font-mono text-md font-medium tabular-nums text-gray-900">
                              {formatQty(detail.reservedQty)}un
                              <Search className="size-3.5 text-gray-500" />
                            </div>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="flex h-64 w-[460px] flex-col p-2"
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
                                    r.order.customerName ?? (
                                      <Null />
                                    ),
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

                      <Stat label="Avg. cost" value={formatMoney(detail.avgCost)} />
                      <Stat label="CIF cost" value={formatMoney(detail.cifCost)} />
                      <Stat label="FOB cost" value={formatMoney(detail.fobCost)} />
                      <Stat
                        label="Last sold"
                        value={formatMoney(detail.lastSoldPrice)}
                      />

                      <FieldStat
                        label="B2B price"
                        value={String(detail.b2bPrice)}
                        disabled={locked}
                        onChange={(v) => patch({ b2bPrice: Number(v) || 0 })}
                      />
                      <FieldStat
                        label="B2C price"
                        value={String(detail.b2cPrice)}
                        disabled={locked}
                        onChange={(v) => patch({ b2cPrice: Number(v) || 0 })}
                      />
                      <div className="sm:col-span-2">
                        <FieldStat
                          label="Suppliers"
                          value={suppliersText}
                          disabled={locked}
                          placeholder="Comma separated"
                          onChange={(v) =>
                            patch({
                              suppliers: JSON.stringify(
                                v
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              ),
                            })
                          }
                        />
                      </div>
                    </div>

                    <Section title="Specs">
                      <DimensionRow
                        label="Product"
                        locked={locked}
                        values={[detail.width, detail.length, detail.height]}
                        onChange={([w, d, h]) =>
                          patch({ width: w, length: d, height: h })
                        }
                      />
                      <DimensionRow
                        label="Package"
                        locked={locked}
                        values={[
                          detail.packageWidth,
                          detail.packageLength,
                          detail.packageHeight,
                        ]}
                        onChange={([w, d, h]) =>
                          patch({
                            packageWidth: w,
                            packageLength: d,
                            packageHeight: h,
                          })
                        }
                      />
                      <DimensionRow
                        label="Cutout"
                        locked={locked}
                        values={[
                          detail.cutoutWidth,
                          detail.cutoutLength,
                          detail.cutoutHeight,
                        ]}
                        onChange={([w, d, h]) =>
                          patch({
                            cutoutWidth: w,
                            cutoutLength: d,
                            cutoutHeight: h,
                          })
                        }
                      />
                      <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                        <Label>Weight</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            className="w-24 tabular-nums"
                            inputMode="decimal"
                            value={detail.weight ?? ""}
                            disabled={locked}
                            onChange={(e) =>
                              patch({ weight: numOrNull(e.target.value) })
                            }
                          />
                          <span className="text-xs text-gray-500 tabular-nums">
                            kg
                            {detail.weight
                              ? ` · ${(detail.weight * LBS_PER_KG).toFixed(1)} lbs`
                              : ""}
                          </span>
                        </div>
                      </div>
                    </Section>

                    <Section title="Notes">
                      <Textarea
                        rows={3}
                        value={detail.notes ?? ""}
                        placeholder="Always editable, no unlock needed"
                        onChange={(e) => patch({ notes: e.target.value })}
                      />
                    </Section>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col p-6">
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

              <DialogFooter className="mx-0 mb-0 shrink-0 px-6 sm:justify-between">
                <ErrorText>{error}</ErrorText>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button disabled={saving} onClick={() => void save()}>
                    {saving
                      ? "Saving…"
                      : isCreate
                        ? "Create product"
                        : "Save changes"}
                  </Button>
                </div>
              </DialogFooter>
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
    <div className="flex min-h-0 flex-1 animate-pulse flex-col gap-8 p-6">
      <div className="h-6 w-32 rounded-sm bg-gray-100" />
      <div className="grid flex-1 gap-8 md:grid-cols-[300px_1fr]">
        <div className="aspect-square w-full rounded-xl bg-gray-100" />
        <div className="grid content-start gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-full rounded-sm bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 border-t border-gray-150 pt-4">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </div>
  );
}

function DimensionRow({
  label,
  values,
  locked,
  onChange,
}: {
  label: string;
  values: [number | null, number | null, number | null];
  locked?: boolean;
  onChange: (v: [number | null, number | null, number | null]) => void;
}) {
  const axes = ["W", "D", "H"];
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-3">
      <Label>{label}</Label>
      <div className="flex items-center gap-1.5">
        {values.map((v, i) => (
          <div key={axes[i]} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-xs text-gray-400">×</span>}
            <Input
              className="w-20 tabular-nums"
              inputMode="decimal"
              placeholder={axes[i]}
              aria-label={`${label} ${axes[i]}`}
              value={v ?? ""}
              disabled={locked}
              onChange={(e) => {
                const next = [...values] as [
                  number | null,
                  number | null,
                  number | null,
                ];
                next[i] = numOrNull(e.target.value);
                onChange(next);
              }}
            />
          </div>
        ))}
        <span className="ml-1 text-xs text-gray-500">cm</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 flex items-center gap-1.5 font-mono text-md font-medium tabular-nums text-gray-900">
        {value}
        {onClick && <Pencil className="size-3 text-gray-500" />}
      </div>
    </>
  );
  if (!onClick) return <div className="min-w-0">{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mx-2 -my-1 min-w-0 rounded-md px-2 py-1 text-left outline-none hover:bg-gray-100",
      )}
    >
      {content}
    </button>
  );
}

function FieldStat({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <Eyebrow>{label}</Eyebrow>
      <Input
        className="tabular-nums"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
