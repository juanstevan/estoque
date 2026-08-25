"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Search } from "lucide-react";
import { Card } from "@tremor/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { formatMoney, formatQty, TRANSACTION_TYPE_LABELS } from "@/lib/format";
import { calcWeightedAverageCost } from "@/lib/inventory/math";

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
  packageLength?: number | null;
  packageWidth?: number | null;
  packageHeight?: number | null;
  packageWeight?: number | null;
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

export function ProductDialog({
  open,
  productId,
  reasons,
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: string | null;
  reasons: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState("info");
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [qtyOpen, setQtyOpen] = useState(false);

  useEffect(() => {
    if (!open || !productId) return;
    setTab("info");
    setEditing(false);
    fetch(`/api/products/${productId}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [open, productId]);

  async function save() {
    if (!detail) return;
    await fetch(`/api/products/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: detail.code,
        name: detail.name,
        sku: detail.sku,
        amazonUrl: detail.amazonUrl,
        b2bPrice: detail.b2bPrice,
        b2cPrice: detail.b2cPrice,
        notes: detail.notes,
        length: detail.length,
        width: detail.width,
        height: detail.height,
        weight: detail.weight,
        suppliers: detail.suppliers,
      }),
    });
    setEditing(false);
    onSaved();
  }

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl" showCloseButton>
          {!detail ? (
            <div className="py-10 text-center text-muted-foreground">Loading…</div>
          ) : (
            <>
              <DialogHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <Tabs value={tab} onValueChange={setTab}>
                    <TabsList variant="line">
                      <TabsTrigger value="info">Info</TabsTrigger>
                      <TabsTrigger value="log" className={tab === "log" ? "" : "opacity-50"}>
                        Log
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditing((e) => !e)}>
                  <Pencil />
                </Button>
              </DialogHeader>

              {tab === "info" ? (
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                  <div className="flex aspect-square items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
                    {detail.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={detail.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                    ) : (
                      "Image"
                    )}
                  </div>
                  <div className="grid gap-3">
                    <Field label="ID" value={detail.code} disabled={!editing} onChange={(v) => setDetail({ ...detail, code: v })} />
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Field
                          label="Complete name"
                          value={detail.name}
                          disabled={!editing}
                          onChange={(v) => setDetail({ ...detail, name: v })}
                        />
                      </div>
                      {detail.amazonUrl && (
                        <a href={detail.amazonUrl} target="_blank" rel="noreferrer">
                          <Button size="icon" variant="outline">
                            <ExternalLink />
                          </Button>
                        </a>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="SKU" value={detail.sku} disabled={!editing} onChange={(v) => setDetail({ ...detail, sku: v })} />
                      <Field
                        label="W × D × H"
                        value={`${detail.length ?? ""} × ${detail.width ?? ""} × ${detail.height ?? ""}`}
                        disabled={!editing}
                        onChange={() => undefined}
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        className="mt-1"
                        value={detail.notes ?? ""}
                        onChange={(e) => setDetail({ ...detail, notes: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <button type="button" className="rounded-lg border p-3 text-left hover:bg-muted" onClick={() => setQtyOpen(true)}>
                        <div className="text-xs text-muted-foreground">Quantity</div>
                        <div className="font-mono text-lg">{formatQty(detail.physicalQty)} un</div>
                      </button>
                      <Popover>
                        <PopoverTrigger className="rounded-lg border p-3 text-left hover:bg-muted">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            Reserved <Search className="size-3.5" />
                          </div>
                          <div className="font-mono text-lg">{formatQty(detail.reservedQty)} un</div>
                        </PopoverTrigger>
                        <PopoverContent className="w-[420px] p-2" align="start">
                          <DataGrid
                            rows={detail.orderLines}
                            getRowId={(r) => r.order.externalRef}
                            columns={[
                              { key: "ref", label: "Ref.", render: (r) => r.order.externalRef, filterValue: (r) => r.order.externalRef },
                              { key: "name", label: "Name", render: (r) => r.order.customerName ?? "—", filterValue: (r) => r.order.customerName ?? "" },
                              { key: "q", label: "Qnt", numeric: true, render: (r) => formatQty(r.reservedQty) },
                              { key: "p", label: "Price", numeric: true, render: (r) => formatMoney(r.unitPrice) },
                            ]}
                          />
                        </PopoverContent>
                      </Popover>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Available</div>
                        <div className="font-mono text-lg">{formatQty(detail.availableQty)} un</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      <Metric label="Suppliers" value={JSON.parse(detail.suppliers || "[]").join(", ") || "—"} />
                      <Metric label="Avg. Cost" value={formatMoney(detail.avgCost)} />
                      <Metric label="CIF Cost" value={formatMoney(detail.cifCost)} />
                      <Metric label="FOB Cost" value={formatMoney(detail.fobCost)} />
                      <Metric label="Last Sold" value={formatMoney(detail.lastSoldPrice)} />
                      <Field label="B2B Price" value={String(detail.b2bPrice)} disabled={!editing} onChange={(v) => setDetail({ ...detail, b2bPrice: Number(v) || 0 })} />
                      <Field label="B2C Price" value={String(detail.b2cPrice)} disabled={!editing} onChange={(v) => setDetail({ ...detail, b2cPrice: Number(v) || 0 })} />
                    </div>
                  </div>
                </div>
              ) : (
                <DataGrid
                  rows={detail.transactions}
                  getRowId={(t) => t.id}
                  columns={[
                    { key: "reference", label: "Ref." },
                    { key: "notes", label: "Name", render: (t) => t.notes ?? "—" },
                    { key: "type", label: "Type", render: (t) => TRANSACTION_TYPE_LABELS[t.type] ?? t.type },
                    { key: "clientName", label: "Client", render: (t) => t.clientName ?? "—" },
                    {
                      key: "in",
                      label: "IN",
                      numeric: true,
                      render: (t) => (t.quantity > 0 ? formatQty(t.quantity) : "—"),
                    },
                    {
                      key: "out",
                      label: "OUT",
                      numeric: true,
                      render: (t) => (t.quantity < 0 ? formatQty(Math.abs(t.quantity)) : "—"),
                    },
                    { key: "unitCost", label: "Price", numeric: true, render: (t) => formatMoney(t.unitCost) },
                    { key: "totalValue", label: "Total", numeric: true, render: (t) => formatMoney(t.totalValue) },
                  ]}
                />
              )}

              <DialogFooter>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={() => void save()}>Save</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {detail && (
        <QuantityDialog
          open={qtyOpen}
          product={detail}
          reasons={reasons}
          onClose={() => setQtyOpen(false)}
          onSaved={() => {
            setQtyOpen(false);
            onSaved();
            if (productId) {
              fetch(`/api/products/${productId}`).then((r) => r.json()).then(setDetail);
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
    await fetch("/api/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, mode, quantity, price, reason }),
    });
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change quantity</DialogTitle>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "add" | "remove")}>
          <TabsList>
            <TabsTrigger value="remove">Remove</TabsTrigger>
            <TabsTrigger value="add">Add</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-3">
          <Field label="Quantity" value={String(quantity)} onChange={(v) => setQuantity(Number(v) || 0)} />
          <Field label="Price" value={String(price)} onChange={(v) => setPrice(Number(v) || 0)} />
          <div>
            <Label>Reason</Label>
            <select
              className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {reasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <Card className="p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Old quantity <span className="font-mono">{formatQty(product.physicalQty)}</span></div>
              <div>New quantity <span className="font-mono">{formatQty(preview.newQty)}</span></div>
              <div>Old cost <span className="font-mono">{formatMoney(product.avgCost)}</span></div>
              <div>New cost <span className="font-mono">{formatMoney(preview.newAvgCost)}</span></div>
            </div>
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="mt-1" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
