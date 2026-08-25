"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { DataGrid } from "@/components/chaleur/DataGrid";
import {
  KindChip,
  StatusBadge,
  statusLabel,
} from "@/components/chaleur/StatusBadge";
import { formatDayMonth, formatMoney, YEAR_COLORS } from "@/lib/format";
import {
  additionalImportCosts,
  packageCbmM3,
  roundMoney,
} from "@/lib/inventory/math";
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

const KIND_LABELS: Record<string, string> = {
  ALL: "All types",
  DOMESTIC: "Domestic",
  INTERNATIONAL: "International",
};

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
  const [search, setSearch] = useState("");
  const [fullDate, setFullDate] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [createKind, setCreateKind] = useState<
    "DOMESTIC" | "INTERNATIONAL" | null
  >(null);

  const active = imports.filter((i) => {
    if (i.status === "COMPLETED") return false;
    if (kind !== "ALL" && i.kind !== kind) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [i.reference, i.supplierName].some((v) =>
      String(v ?? "").toLowerCase().includes(q),
    );
  });

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
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
            <Input
              className="pl-9"
              placeholder="Search reference or supplier"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={kind}
            onValueChange={(v) => setKind(v as typeof kind)}
          >
            <SelectTrigger className="w-40">
              <SelectValue>
                {(value: string) => KIND_LABELS[value] ?? KIND_LABELS.ALL}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={fullDate ? "default" : "secondary"}
            onClick={() => setFullDate((v) => !v)}
          >
            Full date
          </Button>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button />}>
              <Plus /> Add importation
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setCreateKind("INTERNATIONAL")}>
                International importation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateKind("DOMESTIC")}>
                Domestic importation
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => (window.location.href = "/api/import-export")}
              >
                <Download /> Export spreadsheet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
          {COLS.map((col) => {
            const cards = active.filter((i) => i.status === col);
            return (
              <div
                key={col}
                className="flex w-75 shrink-0 flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(col, e)}
              >
                <div className="flex h-10 items-center gap-2 px-1">
                  <span className="text-sm font-medium text-gray-900">
                    {statusLabel(col)}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {cards.length}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1">
                  {cards.length === 0 ? (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-500">
                      Drop here
                    </div>
                  ) : (
                    cards.map((imp) => (
                      <ImportCard
                        key={imp.id}
                        imp={imp}
                        fullDate={fullDate}
                        onOpen={() => setEditing(imp)}
                        onAdvance={() =>
                          void move(
                            imp.id,
                            col === "PENDING" ? "IN_TRANSIT" : "COMPLETED",
                          )
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="flex h-10 w-32 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            <Plus className="size-3.5" /> Add column
          </button>
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="secondary"
              className="h-full w-7 self-stretch"
              onClick={() => setTableOpen((v) => !v)}
              aria-label={tableOpen ? "Hide all imports" : "Show all imports"}
            />
          }
        >
          {tableOpen ? <ChevronRight /> : <ChevronLeft />}
        </TooltipTrigger>
        <TooltipContent>
          {tableOpen ? "Hide all imports" : "Show all imports"}
        </TooltipContent>
      </Tooltip>

      {tableOpen && (
        <div className="flex min-h-0 w-[440px] shrink-0 flex-col gap-4">
          <div className="flex h-8 items-center text-sm font-medium text-gray-900">
            All imports
          </div>
          <DataGrid
            rows={imports}
            getRowId={(i) => i.id}
            onRowClick={(i) => setEditing(i)}
            empty="No imports yet"
            emptyHint="Add an importation to start tracking landed cost."
            columns={[
              {
                key: "expectedDate",
                label: "Date",
                width: "88px",
                render: (i) =>
                  i.expectedDate ? (
                    formatDayMonth(i.expectedDate)
                  ) : (
                    <span className="text-gray-400">—</span>
                  ),
              },
              { key: "reference", label: "Ref.", mono: true, width: "104px" },
              {
                key: "status",
                label: "Status",
                width: "120px",
                filterValue: (i) => statusLabel(i.status),
                render: (i) => <StatusBadge status={i.status} />,
              },
              {
                key: "coefficient",
                label: "Coef.",
                numeric: true,
                width: "72px",
                render: (i) => `${i.coefficient}×`,
              },
              {
                key: "total",
                label: "Total",
                numeric: true,
                width: "112px",
                sortValue: (i) => i.productSubtotal + i.totalAdditionalCosts,
                render: (i) =>
                  formatMoney(i.productSubtotal + i.totalAdditionalCosts),
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
  const year = imp.expectedDate
    ? new Date(imp.expectedDate).getFullYear().toString()
    : "";
  const advancing = imp.status === "PENDING";
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", imp.id)}
      className="group relative cursor-pointer rounded-lg border border-border bg-surface p-3 transition-colors duration-[80ms] hover:border-gray-300"
      onClick={onOpen}
    >
      <div className="flex items-center gap-2 pr-7">
        <span className="shrink-0 font-mono text-xs whitespace-nowrap text-gray-600">
          {imp.reference}
        </span>
        <span className="truncate text-sm font-medium text-gray-900">
          {imp.supplierName ?? "Unassigned"}
        </span>
      </div>

      <div className="mt-1 font-mono text-xs text-gray-500 tabular-nums">
        {imp.coefficient}× landed
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-600 tabular-nums">
          {imp.expectedDate ? (
            <>
              {fullDate
                ? new Date(imp.expectedDate).toLocaleDateString("en-US")
                : formatDayMonth(imp.expectedDate)}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className="inline-block size-1.5 rounded-full"
                      style={{ background: YEAR_COLORS[year] ?? "#A2ABB8" }}
                    />
                  }
                />
                <TooltipContent>{year}</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <span className="text-gray-400">No date</span>
          )}
        </span>
        <span className="font-mono text-xs font-medium text-gray-900 tabular-nums">
          {formatMoney(imp.productSubtotal + imp.totalAdditionalCosts)}
        </span>
      </div>

      <div className="mt-2">
        <KindChip kind={imp.kind} />
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="secondary"
              className="absolute top-2 right-2 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-100"
              aria-label={advancing ? "Move to in transit" : "Confirm receipt"}
              onClick={(e) => {
                e.stopPropagation();
                onAdvance();
              }}
            />
          }
        >
          {advancing ? <ArrowRight /> : <Check />}
        </TooltipTrigger>
        <TooltipContent>
          {advancing ? "Move to in transit" : "Confirm receipt"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const COST_FIELDS = [
  ["transferFee", "Transfer fee"],
  ["freight", "Freight"],
  ["customs", "Customs"],
  ["delivery", "Delivery"],
  ["duties", "Duties"],
  ["otherCosts", "Other"],
] as const;

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
      : [
          {
            productId: products[0]?.id ?? null,
            name: products[0]?.name ?? "",
            quantity: 1,
            purchaseUnitCost: 0,
          },
        ],
  }));

  const subtotal = form.lines.reduce(
    (s, l) => s + l.quantity * l.purchaseUnitCost,
    0,
  );
  const additional = additionalImportCosts(form);
  const cbm = useMemo(() => {
    return form.lines.reduce((s, l) => {
      const p = products.find((x) => x.id === l.productId);
      return (
        s +
        packageCbmM3(
          p?.packageLength ?? p?.length,
          p?.packageWidth ?? p?.width,
          p?.packageHeight ?? p?.height,
        ) *
          l.quantity
      );
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
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-[720px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>
              {initial ? "Importation" : "New importation"}
            </DialogTitle>
            <KindChip kind={kind} />
            {initial && <StatusBadge status={initial.status} />}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1">
            <Label htmlFor="imp-code">Code</Label>
            <Input
              id="imp-code"
              className="font-mono text-xs"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="imp-supplier">Supplier</Label>
            <Input
              id="imp-supplier"
              value={form.supplierName}
              onChange={(e) =>
                setForm({ ...form, supplierName: e.target.value })
              }
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="imp-date">Expected</Label>
            <Input
              id="imp-date"
              type="date"
              value={form.expectedDate}
              onChange={(e) =>
                setForm({ ...form, expectedDate: e.target.value })
              }
            />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="h-56">
            <DataGrid
              rows={form.lines.map((l, i) => ({ ...l, id: String(i) }))}
              getRowId={(l) => l.id}
              empty="No products yet"
              emptyHint="Add the products arriving in this shipment."
              columns={[
                {
                  key: "productId",
                  label: "ID",
                  mono: true,
                  width: "104px",
                  render: (l) =>
                    products.find((p) => p.id === l.productId)?.code ?? "—",
                },
                { key: "name", label: "Name" },
                {
                  key: "quantity",
                  label: "Qnt",
                  numeric: true,
                  width: "72px",
                },
                {
                  key: "purchaseUnitCost",
                  label: "Cost",
                  numeric: true,
                  width: "104px",
                  render: (l) => formatMoney(l.purchaseUnitCost),
                },
                {
                  key: "total",
                  label: "Total",
                  numeric: true,
                  width: "112px",
                  sortValue: (l) => l.quantity * l.purchaseUnitCost,
                  render: (l) => formatMoney(l.quantity * l.purchaseUnitCost),
                },
              ]}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() =>
              setForm({
                ...form,
                lines: [
                  ...form.lines,
                  {
                    productId: products[0]?.id ?? null,
                    name: "",
                    quantity: 1,
                    purchaseUnitCost: 0,
                  },
                ],
              })
            }
          >
            <Plus /> Add product
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-x-3 gap-y-5">
          {COST_FIELDS.map(([key, label]) => (
            <div key={key} className="grid gap-1">
              <Label htmlFor={`cost-${key}`}>{label}</Label>
              <Input
                id={`cost-${key}`}
                className="tabular-nums"
                inputMode="decimal"
                value={form[key]}
                onChange={(e) =>
                  setForm({ ...form, [key]: Number(e.target.value) || 0 })
                }
              />
            </div>
          ))}
        </div>

        <div className="grid gap-2 rounded-lg border border-border bg-sunken p-4">
          <SummaryRow label="CBM" value={`${roundMoney(cbm, 4)} m³`} />
          <SummaryRow
            label="Total weight"
            value={`${roundMoney(kg, 1)} kg · ${roundMoney(kg * 2.20462, 0)} lbs`}
          />
          <div className="my-1 h-px bg-gray-200" />
          <SummaryRow label="Products" value={formatMoney(subtotal)} />
          <SummaryRow label="Additional costs" value={formatMoney(additional)} />
          <SummaryRow
            label="Total amount"
            value={formatMoney(subtotal + additional)}
            strong
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={cn(strong ? "font-medium text-gray-900" : "text-gray-600")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          strong ? "font-medium text-gray-900" : "text-gray-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}
