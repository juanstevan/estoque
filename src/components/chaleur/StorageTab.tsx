"use client";

import { useState } from "react";
import { Download, Pencil, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataGrid } from "@/components/chaleur/DataGrid";
import {
  ProductDialog,
  type ProductRow,
} from "@/components/chaleur/ProductDialog";
import { formatMoney, formatQty } from "@/lib/format";

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

  const visible = products.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return [p.name, p.code, p.sku, p.id].some((v) =>
      String(v).toLowerCase().includes(q),
    );
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
          <Input
            className="pl-9"
            placeholder="Search products by name, ID or SKU"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

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
        empty={
          search ? `No matches for “${search}”` : "No products yet"
        }
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
        columns={[
          { key: "code", label: "ID", mono: true, width: "128px" },
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
            key: "physicalQty",
            label: "Qnt",
            numeric: true,
            width: "104px",
            render: (p) => `${formatQty(p.physicalQty)}un`,
          },
          {
            key: "avgCost",
            label: "Cost",
            numeric: true,
            width: "128px",
            render: (p) => formatMoney(p.avgCost),
          },
          {
            key: "inventoryValue",
            label: "Total",
            numeric: true,
            width: "144px",
            render: (p) => formatMoney(p.inventoryValue),
          },
          {
            key: "b2bPrice",
            label: "B2B price",
            numeric: true,
            width: "128px",
            render: (p) => formatMoney(p.b2bPrice),
          },
          {
            key: "b2cPrice",
            label: "B2C price",
            numeric: true,
            width: "128px",
            render: (p) => formatMoney(p.b2cPrice),
          },
          {
            key: "edit",
            label: "",
            plain: true,
            width: "44px",
            render: () => (
              <Pencil className="size-3.5 text-gray-500 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-100" />
            ),
          },
        ]}
      />

      <ProductDialog
        open={Boolean(selected)}
        productId={selected}
        reasons={reasons}
        onClose={() => setSelected(null)}
        onSaved={onReload}
      />

      <ProductDialog
        open={creating}
        productId={null}
        mode="create"
        reasons={reasons}
        onClose={() => setCreating(false)}
        onSaved={onReload}
      />
    </div>
  );
}
