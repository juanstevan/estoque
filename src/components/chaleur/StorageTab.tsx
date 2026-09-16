"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns3, Download, Pencil, Plus, Search, Upload } from "lucide-react";
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

const COLUMNS_KEY = "chaleur.storage.columns";

const LOCKED = new Set(["code", "name"]);
const DEFAULT_VISIBLE = [
  "code",
  "name",
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
    label: "Type",
    width: "120px",
    render: (p) => p.type || "—",
  },
  { key: "sku", label: "SKU", mono: true, width: "120px" },
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
    render: (p) => (p.weight == null ? "—" : `${p.weight} kg`),
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.includes("code")) return;
      setVisibleKeys(parsed.map(String));
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
      .filter((p) => hit(p.code) || hit(p.name) || hit(p.sku) || hit(p.type))
      .sort((a, b) => rank(a) - rank(b));
  }, [products, search]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
          <Input
            className="pl-9"
            placeholder="Search products by name, ID, SKU or type"
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
            <DropdownMenuItem
              onClick={() => (window.location.href = "/api/import-export")}
            >
              <Download /> Export spreadsheet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input id="sheet-import" type="file" hidden accept=".xlsx,.csv" />
      </div>

      <DataGrid
        rows={visible}
        getRowId={(p) => p.id}
        onRowClick={(p) => setSelected(p.id)}
        selectedId={selected}
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
        onClose={() => setSelected(null)}
        onSaved={onReload}
      />

      <ProductDialog
        open={creating}
        productId={null}
        mode="create"
        reasons={reasons}
        types={uniqueProductTypes(products)}
        onClose={() => setCreating(false)}
        onSaved={onReload}
      />
    </div>
  );
}
