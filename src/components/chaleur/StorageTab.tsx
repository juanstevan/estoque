"use client";

import { useState } from "react";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { ProductDialog, type ProductRow } from "@/components/chaleur/ProductDialog";
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
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [creating, setCreating] = useState(false);

  async function createProduct() {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sku }),
    });
    const data = await res.json();
    if (res.ok) {
      setCreating(false);
      setName("");
      setSku("");
      onReload();
      setSelected(data.id);
    }
  }

  const visible = products.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return [p.name, p.code, p.sku, p.id].some((v) =>
      String(v).toLowerCase().includes(q),
    );
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          className="h-10 flex-1"
          placeholder="Search products by name, ID, SKU…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <Button size="icon" onClick={() => setCreating(true)}>
          <Plus />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Export
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => (window.location.href = "/api/import-export")}>
              <Download className="mr-2 size-4" /> Export
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => document.getElementById("sheet-import")?.click()}
            >
              <Upload className="mr-2 size-4" /> Import
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input id="sheet-import" type="file" hidden accept=".xlsx,.csv" />
      </div>

      <DataGrid
        rows={visible}
        getRowId={(p) => p.id}
        onRowClick={(p) => setSelected(p.id)}
        columns={[
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "physicalQty", label: "QNT", numeric: true, render: (p) => formatQty(p.physicalQty) },
          { key: "avgCost", label: "Cost", numeric: true, render: (p) => formatMoney(p.avgCost) },
          { key: "inventoryValue", label: "Total", numeric: true, render: (p) => formatMoney(p.inventoryValue) },
          { key: "b2bPrice", label: "B2B Price", numeric: true, render: (p) => formatMoney(p.b2bPrice) },
          { key: "b2cPrice", label: "B2C Price", numeric: true, render: (p) => formatMoney(p.b2cPrice) },
          {
            key: "edit",
            label: "",
            render: (p) => (
              <Pencil className="size-4 opacity-0 group-hover:opacity-100" />
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
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-xl bg-card p-4 shadow-lg">
            <div className="mb-3 font-medium">New product</div>
            <Input className="mb-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input className="mb-3" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button onClick={() => void createProduct()}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
