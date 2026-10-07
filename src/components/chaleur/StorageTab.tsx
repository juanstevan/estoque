"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Download, Link2, Pencil, Plus, Search, Upload } from "lucide-react";
import { copyShareLink } from "@/components/chaleur/ProductPhotos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataGrid, type GridCol } from "@/components/chaleur/DataGrid";
import {
  ProductDialog,
  uniqueProductTypes,
  type ProductRow,
} from "@/components/chaleur/ProductDialog";
import { formatMoney, formatQty } from "@/lib/format";
import { splitName } from "@/lib/photos/name";
import { cn } from "@/lib/utils";

const COLUMNS_KEY = "chaleur.storage.columns";
const COLUMNS_MIGRATION_KEY = "chaleur.storage.columns.identity";

const LOCKED = new Set(["code", "name"]);
const IDENTITY = ["type", "category", "model", "variant"];
const DEFAULT_VISIBLE = [
  "code",
  "name",
  "type",
  "category",
  "model",
  "variant",
  "sku",
  "physicalQty",
  "avgCost",
  "inventoryValue",
  "b2bPrice",
  "b2cPrice",
];

const money = (v: number) => formatMoney(v);
const qty = (v: number) => `${formatQty(v)}un`;
const value = { numeric: true, align: "center" as const };
const dash = "—";

function text(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : dash;
}

function measure(n: number | null | undefined) {
  if (n == null) return null;
  return String(n);
}

function size(w: number | null, l: number | null, h: number | null) {
  const parts = [w, l, h].map(measure);
  if (parts.every((part) => part == null)) return dash;
  return `${parts.map((part) => part ?? dash).join(" × ")} in`;
}

function supplierNames(raw: string | null) {
  if (!raw) return dash;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const names = parsed.map(String).filter(Boolean);
      return names.length ? names.join(", ") : dash;
    }
  } catch {
    /* older rows stored a plain list */
  }
  const names = raw.split(",").map((name) => name.trim()).filter(Boolean);
  return names.length ? names.join(", ") : dash;
}

const ALL_COLUMNS: GridCol<ProductRow>[] = [
  { key: "code", label: "ID", mono: true, width: "96px" },
  {
    key: "name",
    label: "Name",
    render: (p) => (
      <span className="font-medium text-gray-900" title={p.name}>
        {p.name}
      </span>
    ),
  },
  {
    key: "type",
    label: "Brand",
    width: "120px",
    render: (p) => text(p.type),
  },
  {
    key: "category",
    label: "Category",
    width: "120px",
    render: (p) => text(p.category),
  },
  {
    key: "model",
    label: "Family",
    width: "120px",
    render: (p) => text(p.model),
  },
  {
    key: "variant",
    label: "Variant",
    width: "140px",
    sortValue: (p) => splitName(p.name, p.category, p.model).variation,
    filterValue: (p) => splitName(p.name, p.category, p.model).variation,
    render: (p) => text(splitName(p.name, p.category, p.model).variation),
  },
  {
    key: "tag",
    label: "Tag",
    width: "120px",
    sortValue: (p) => p.tag?.name ?? "",
    filterValue: (p) => p.tag?.name ?? "",
    render: (p) => text(p.tag?.name),
  },
  { key: "sku", label: "SKU", mono: true, width: "120px" },
  {
    key: "hsCode",
    label: "HS code",
    mono: true,
    width: "120px",
    render: (p) => text(p.hsCode),
  },
  {
    key: "physicalQty",
    label: "Qnt",
    width: "96px",
    ...value,
    render: (p) => qty(p.physicalQty),
  },
  {
    key: "availableQty",
    label: "Available",
    width: "108px",
    ...value,
    render: (p) => qty(p.availableQty),
  },
  {
    key: "reservedQty",
    label: "Reserved",
    width: "108px",
    ...value,
    render: (p) => qty(p.reservedQty),
  },
  {
    key: "avgCost",
    label: "Cost",
    width: "112px",
    ...value,
    render: (p) => money(p.avgCost),
  },
  {
    key: "cifCost",
    label: "CIF cost",
    width: "112px",
    ...value,
    render: (p) => money(p.cifCost),
  },
  {
    key: "fobCost",
    label: "FOB cost",
    width: "112px",
    ...value,
    render: (p) => money(p.fobCost),
  },
  {
    key: "inventoryValue",
    label: "Total",
    width: "128px",
    ...value,
    render: (p) => money(p.inventoryValue),
  },
  {
    key: "lastSoldPrice",
    label: "Last sold",
    width: "112px",
    ...value,
    render: (p) => money(p.lastSoldPrice),
  },
  {
    key: "b2bPrice",
    label: "B2B price",
    width: "112px",
    ...value,
    render: (p) => money(p.b2bPrice),
  },
  {
    key: "b2cPrice",
    label: "B2C price",
    width: "112px",
    ...value,
    render: (p) => money(p.b2cPrice),
  },
  {
    key: "weight",
    label: "Weight",
    width: "108px",
    align: "center",
    render: (p) => (p.weight == null ? dash : `${p.weight} kg`),
  },
  {
    key: "packageWeight",
    label: "Package weight",
    width: "140px",
    align: "center",
    render: (p) => (p.packageWeight == null ? dash : `${p.packageWeight} kg`),
  },
  {
    key: "dimensions",
    label: "Product size",
    width: "160px",
    sortValue: (p) => p.length ?? 0,
    render: (p) => size(p.width, p.length, p.height),
  },
  {
    key: "packageSize",
    label: "Package size",
    width: "160px",
    sortValue: (p) => p.packageLength ?? 0,
    render: (p) => size(p.packageWidth, p.packageLength, p.packageHeight),
  },
  {
    key: "cutoutSize",
    label: "Cut-out size",
    width: "160px",
    sortValue: (p) => p.cutoutLength ?? 0,
    render: (p) => size(p.cutoutWidth, p.cutoutLength, p.cutoutHeight),
  },
  {
    key: "notes",
    label: "Notes",
    width: "180px",
    render: (p) => (
      <span className="block truncate" title={p.notes ?? undefined}>
        {text(p.notes)}
      </span>
    ),
  },
  {
    key: "suppliers",
    label: "Suppliers",
    width: "160px",
    render: (p) => supplierNames(p.suppliers),
  },
];

export function StorageTab({
  products,
  search,
  onSearch,
  reasons,
  onReload,
}: {
  products: ProductRow[];
  search: string;
  onSearch: (v: string) => void;
  reasons: string[];
  onReload: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_VISIBLE);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [shareNote, setShareNote] = useState<{ ok: boolean; text: string } | null>(null);
  const shareTimer = useRef<number | undefined>(undefined);

  function flashShare(note: { ok: boolean; text: string }) {
    setShareNote(note);
    window.clearTimeout(shareTimer.current);
    shareTimer.current = window.setTimeout(() => setShareNote(null), 2500);
  }
  const gridIdsRef = useRef<string[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_KEY);
      let keys = DEFAULT_VISIBLE;
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.includes("code")) keys = parsed.map(String);
      }
      if (!localStorage.getItem(COLUMNS_MIGRATION_KEY)) {
        const at = Math.max(keys.indexOf("name") + 1, 1);
        const missing = IDENTITY.filter((key) => !keys.includes(key));
        keys = [...keys.slice(0, at), ...missing, ...keys.slice(at)];
        localStorage.setItem(COLUMNS_KEY, JSON.stringify(keys));
        localStorage.setItem(COLUMNS_MIGRATION_KEY, "1");
      }
      setVisibleKeys(keys);
    } catch {
      /* keep defaults */
    }
  }, []);

  function toggleColumn(key: string) {
    if (LOCKED.has(key)) return;
    setVisibleKeys((keys) => {
      const next = keys.includes(key)
        ? keys.filter((k) => k !== key)
        : [...keys, key];
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      return next;
    });
  }

  const columns = useMemo(() => {
    const shown = new Set(visibleKeys);
    const cols = ALL_COLUMNS.filter((c) => shown.has(String(c.key)));
    cols.push({
      key: "edit",
      label: "",
      plain: true,
      width: "44px",
      render: () => (
        <Pencil className="size-3.5 text-gray-500 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-100" />
      ),
    });
    return cols;
  }, [visibleKeys]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    const hit = (v: string | null | undefined) =>
      String(v ?? "").toLowerCase().includes(q);
    const rank = (p: ProductRow) =>
      hit(p.code) ? 0 : hit(p.name) ? 1 : hit(p.sku) ? 2 : 3;
    return products
      .filter((p) => {
        const parts = splitName(p.name, p.category, p.model);
        return (
          hit(p.code) ||
          hit(p.name) ||
          hit(p.sku) ||
          hit(p.type) ||
          hit(p.category) ||
          hit(p.model) ||
          hit(parts.variation) ||
          hit(p.tag?.name) ||
          hit(p.hsCode)
        );
      })
      .sort((a, b) => rank(a) - rank(b));
  }, [products, search]);

  async function exportSpreadsheet() {
    const ids =
      checkedIds.size > 0
        ? [...checkedIds]
        : (gridIdsRef.current ?? visible.map((p) => p.id));
    if (ids.length === products.length) {
      window.location.href = "/api/import-export";
      return;
    }
    const res = await fetch("/api/import-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "estoque.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
          <Input
            className="pl-9"
            placeholder="Search products by name, ID, SKU or brand"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon" variant="secondary" aria-label="Columns" />
            }
          >
            <Columns3 />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              {ALL_COLUMNS.map((col) => {
                const key = String(col.key);
                const locked = LOCKED.has(key);
                return (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={visibleKeys.includes(key)}
                    disabled={locked}
                    onCheckedChange={() => toggleColumn(key)}
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {shareNote && (
          <span
            className={cn(
              "shrink-0 text-xs",
              shareNote.ok ? "text-gray-500" : "text-danger-text",
            )}
          >
            {shareNote.text}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                onClick={() => setCreating(true)}
                aria-label="Create product"
              />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipContent>Create product</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon"
                      variant="secondary"
                      aria-label="Import or export"
                    />
                  }
                />
              }
            >
              <Upload />
            </TooltipTrigger>
            <TooltipContent>Import or export</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => document.getElementById("sheet-import")?.click()}
            >
              <Upload /> Import spreadsheet
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void exportSpreadsheet()}>
              <Download /> Export spreadsheet
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                copyShareLink(null)
                  .then(() => flashShare({ ok: true, text: "Photos link copied" }))
                  .catch((e) =>
                    flashShare({
                      ok: false,
                      text: e instanceof Error ? e.message : "Couldn't copy the link",
                    }),
                  )
              }
            >
              <Link2 /> Copy photos share link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          id="sheet-import"
          type="file"
          hidden
          accept=".xlsx,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void (async () => {
              const form = new FormData();
              form.append("file", file);
              const parsed = await fetch("/api/import-export", {
                method: "POST",
                body: form,
              });
              const data = await parsed.json();
              if (!parsed.ok || !data.preview) return;
              await fetch("/api/import-export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  preview: data.preview,
                  confirm: true,
                }),
              });
              onReload();
            })();
          }}
        />
      </div>

      <DataGrid
        rows={visible}
        getRowId={(p) => p.id}
        onRowClick={(p) => setSelected(p.id)}
        selectedId={selected}
        selectable
        checkedIds={checkedIds}
        onCheckedIdsChange={setCheckedIds}
        visibleIdsRef={gridIdsRef}
        empty={search ? `No matches for “${search}”` : "No products yet"}
        emptyHint={
          search
            ? "Try a shorter search, or check the ID and SKU."
            : "Create your first product to start tracking stock."
        }
        emptyAction={
          search ? undefined : (
            <Button onClick={() => setCreating(true)}>Create product</Button>
          )
        }
        columns={columns}
      />

      <ProductDialog
        open={Boolean(selected)}
        productId={selected}
        reasons={reasons}
        types={uniqueProductTypes(products)}
        catalog={products}
        onClose={() => setSelected(null)}
        onSaved={onReload}
      />

      <ProductDialog
        open={creating}
        productId={null}
        mode="create"
        reasons={reasons}
        types={uniqueProductTypes(products)}
        catalog={products}
        onClose={() => setCreating(false)}
        onSaved={onReload}
      />
    </div>
  );
}
