"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Card } from "@tremor/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { formatDayMonth, formatMoney, YEAR_COLORS } from "@/lib/format";
import { additionalImportCosts, packageCbmM3, roundMoney } from "@/lib/inventory/math";
import { cn } from "@/lib/utils";
import type { ProductRow } from "@/components/chaleur/ProductDialog";

export type ImportRow = {
  id: string;
  reference: string;
  kind: "DOMESTIC" | "INTERNATIONAL";
  status: "PENDING" | "IN_TRANSIT" | "DELAYED" | "COMPLETED";
  supplierName: string | null;
  expectedDate: string | null;
  transferFee: number;
  freight: number;
  delivery: number;
  duties: number;
  customs: number;
  otherCosts: number;
  productSubtotal: number;
  totalAdditionalCosts: number;
  coefficient: number;
  lines: Array<{
    productId: string | null;
    draftName: string | null;
    quantity: number;
    purchaseUnitCost: number;
    product?: ProductRow | null;
  }>;
};

const COLS = ["PENDING", "IN_TRANSIT", "DELAYED"] as const;

export function ImportsTab({
  imports,
  products,
  onReload,
}: {
  imports: ImportRow[];
  products: ProductRow[];
  onReload: () => void;
}) {
  const [kind, setKind] = useState<"ALL" | "DOMESTIC" | "INTERNATIONAL">("ALL");
  const [fullDate, setFullDate] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [createKind, setCreateKind] = useState<"DOMESTIC" | "INTERNATIONAL" | null>(null);

  const active = imports.filter((i) => i.status !== "COMPLETED" && (kind === "ALL" || i.kind === kind));

  async function move(id: string, status: ImportRow["status"]) {
    await fetch("/api/importations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", id, status }),
    });
    onReload();
  }

  function onDrop(status: ImportRow["status"], e: React.DragEvent) {
    const id = e.dataTransfer.getData("text/plain");
    if (id) void move(id, status);
  }

  return (
    <div className="flex h-full gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 max-w-xs" placeholder="Search imports…" />
          <select
            className="h-9 rounded-lg border bg-background px-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="ALL">Type</option>
            <option value="DOMESTIC">Domestic</option>
            <option value="INTERNATIONAL">International</option>
          </select>
          <Button variant={fullDate ? "default" : "outline"} onClick={() => setFullDate((v) => !v)}>
            Full Date
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button />}>
              <Plus className="mr-1" /> Add
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setCreateKind("INTERNATIONAL")}>
                International
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateKind("DOMESTIC")}>Domestic</DropdownMenuItem>
              <DropdownMenuItem onClick={() => (window.location.href = "/api/import-export")}>
                Export
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-4 gap-3">
          {COLS.map((col) => (
            <div
              key={col}
              className="flex flex-col rounded-xl bg-muted/40 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(col, e)}
            >
              <div className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground">
                {col.replace("_", " ")}
              </div>
              <div className="flex flex-col gap-2 overflow-auto">
                {active
                  .filter((i) => i.status === col)
                  .map((imp) => (
                    <ImportCard
                      key={imp.id}
                      imp={imp}
                      fullDate={fullDate}
                      onOpen={() => setEditing(imp)}
                      onAdvance={() =>
                        void move(imp.id, col === "PENDING" ? "IN_TRANSIT" : "COMPLETED")
                      }
                    />
                  ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-center rounded-xl border border-dashed text-muted-foreground">
            <Plus />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="flex w-6 items-center justify-center rounded-lg border bg-card text-muted-foreground"
        onClick={() => setTableOpen((v) => !v)}
      >
        {tableOpen ? "›" : "‹"}
      </button>

      {tableOpen && (
        <div className="w-[420px] shrink-0">
          <DataGrid
            rows={imports}
            getRowId={(i) => i.id}
            onRowClick={(i) => setEditing(i)}
            columns={[
              {
                key: "expectedDate",
                label: "Date",
                render: (i) => (i.expectedDate ? formatDayMonth(i.expectedDate) : "—"),
              },
              { key: "reference", label: "Ref." },
              { key: "status", label: "Status" },
              { key: "coefficient", label: "Coef", numeric: true, render: (i) => `${i.coefficient}x` },
              {
                key: "total",
                label: "Total",
                numeric: true,
                render: (i) => formatMoney(i.productSubtotal + i.totalAdditionalCosts),
              },
            ]}
          />
        </div>
      )}

      <ImportDialog
        open={Boolean(editing) || Boolean(createKind)}
        initial={editing}
        kind={editing?.kind ?? createKind ?? "INTERNATIONAL"}
        products={products}
        onClose={() => {
          setEditing(null);
          setCreateKind(null);
        }}
        onSaved={() => {
          setEditing(null);
          setCreateKind(null);
          onReload();
        }}
      />
    </div>
  );
}

function ImportCard({
  imp,
  fullDate,
  onOpen,
  onAdvance,
}: {
  imp: ImportRow;
  fullDate: boolean;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const year = imp.expectedDate ? new Date(imp.expectedDate).getFullYear().toString() : "";
  const border = imp.kind === "DOMESTIC" ? "border-red-400" : "border-blue-400";
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", imp.id)}
      className={cn("group relative cursor-pointer rounded-lg border-l-4 bg-card p-3 shadow-sm", border)}
      onClick={onOpen}
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 font-mono text-xs">{imp.reference}</span>
        <span className="truncate text-sm">{imp.supplierName}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{imp.coefficient}x</div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          {imp.expectedDate
            ? fullDate
              ? new Date(imp.expectedDate).toLocaleDateString("en-US")
              : formatDayMonth(imp.expectedDate)
            : "—"}
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: YEAR_COLORS[year] ?? "#94a3b8" }}
          />
        </span>
        <span className="font-mono">{formatMoney(imp.productSubtotal + imp.totalAdditionalCosts)}</span>
      </div>
      <button
        type="button"
        className="absolute top-2 right-2 hidden rounded-md bg-emerald-600 p-1 text-white group-hover:block"
        onClick={(e) => {
          e.stopPropagation();
          onAdvance();
        }}
      >
        {imp.status === "PENDING" ? <ArrowRight className="size-3.5" /> : <Check className="size-3.5" />}
      </button>
    </div>
  );
}

function ImportDialog({
  open,
  initial,
  kind,
  products,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: ImportRow | null;
  kind: "DOMESTIC" | "INTERNATIONAL";
  products: ProductRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    reference: initial?.reference ?? "",
    supplierName: initial?.supplierName ?? "",
    expectedDate: initial?.expectedDate?.slice(0, 10) ?? "",
    transferFee: initial?.transferFee ?? 0,
    freight: initial?.freight ?? 0,
    delivery: initial?.delivery ?? 0,
    duties: initial?.duties ?? 0,
    customs: initial?.customs ?? 0,
    otherCosts: initial?.otherCosts ?? 0,
    lines: initial?.lines?.length
      ? initial.lines.map((l) => ({
          productId: l.productId,
          name: l.product?.name ?? l.draftName ?? "",
          quantity: l.quantity,
          purchaseUnitCost: l.purchaseUnitCost,
        }))
      : [{ productId: products[0]?.id ?? null, name: products[0]?.name ?? "", quantity: 1, purchaseUnitCost: 0 }],
  }));

  const subtotal = form.lines.reduce((s, l) => s + l.quantity * l.purchaseUnitCost, 0);
  const additional = additionalImportCosts(form);
  const cbm = useMemo(() => {
    return form.lines.reduce((s, l) => {
      const p = products.find((x) => x.id === l.productId);
      return s + packageCbmM3(p?.packageLength ?? p?.length, p?.packageWidth ?? p?.width, p?.packageHeight ?? p?.height) * l.quantity;
    }, 0);
  }, [form.lines, products]);
  const kg = form.lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId);
    return s + (p?.packageWeight ?? p?.weight ?? 0) * l.quantity;
  }, 0);

  async function save() {
    await fetch("/api/importations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: initial?.id,
        kind,
        reference: form.reference,
        supplierName: form.supplierName,
        expectedDate: form.expectedDate,
        transferFee: form.transferFee,
        freight: form.freight,
        delivery: form.delivery,
        duties: form.duties,
        customs: form.customs,
        otherCosts: form.otherCosts,
        lines: form.lines.map((l) => ({
          productId: l.productId,
          draftName: l.name,
          quantity: l.quantity,
          purchaseUnitCost: l.purchaseUnitCost,
        })),
      }),
    });
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "INTERNATIONAL" ? "International" : "Domestic"} importation
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Code</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
          </div>
          <div>
            <Label>Expected</Label>
            <Input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
          </div>
        </div>
        <DataGrid
          rows={form.lines.map((l, i) => ({ ...l, id: String(i) }))}
          getRowId={(l) => l.id}
          columns={[
            { key: "productId", label: "ID", render: (l) => products.find((p) => p.id === l.productId)?.code ?? "—" },
            { key: "name", label: "Name" },
            { key: "quantity", label: "Qnt", numeric: true },
            { key: "purchaseUnitCost", label: "Cost", numeric: true, render: (l) => formatMoney(l.purchaseUnitCost) },
            { key: "total", label: "Total", numeric: true, render: (l) => formatMoney(l.quantity * l.purchaseUnitCost) },
          ]}
        />
        <Button
          variant="ghost"
          onClick={() =>
            setForm({
              ...form,
              lines: [...form.lines, { productId: products[0]?.id ?? null, name: "", quantity: 1, purchaseUnitCost: 0 }],
            })
          }
        >
          <Plus className="mr-1" /> Add product
        </Button>
        <div className="grid grid-cols-3 gap-3">
          {(["transferFee", "freight", "customs", "delivery", "duties", "otherCosts"] as const).map((k) => (
            <div key={k}>
              <Label className="capitalize">{k.replace(/([A-Z])/g, " $1")}</Label>
              <Input
                type="number"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
        <Card className="p-3 text-sm">
          <div>CBM: {roundMoney(cbm, 4)}</div>
          <div>Total weight: {roundMoney(kg, 1)}Kg / {roundMoney(kg * 2.20462, 0)}lbs</div>
          <div className="text-muted-foreground">Products {formatMoney(subtotal)}</div>
          <div className="text-muted-foreground">Additional {formatMoney(additional)}</div>
          <div className="font-semibold">Total amount {formatMoney(subtotal + additional)}</div>
        </Card>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
