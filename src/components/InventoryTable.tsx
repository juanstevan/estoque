"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnResizeMode,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { formatMoney, formatQty } from "@/lib/format";

type Props = {
  data: Product[];
  onSelect: (product: Product) => void;
  globalFilter: string;
};

const COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  name: "Nome",
  sku: "SKU",
  physicalQty: "Qtd",
  availableQty: "Disponível",
  reservedQty: "Reservado",
  waitingPickupQty: "Aguardando retirada",
  avgCost: "Custo médio",
  b2bPrice: "B2B",
  b2cPrice: "B2C",
  inventoryValue: "Valor estoque",
};

export function InventoryTable({ data, onSelect, globalFilter }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: false,
  });
  const [columnResizeMode] = useState<ColumnResizeMode>("onChange");
  const [showCols, setShowCols] = useState(false);

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        size: 120,
        cell: (info) => (
          <span className="num" style={{ fontSize: 12 }}>
            {String(info.getValue()).slice(0, 8)}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Nome",
        size: 220,
      },
      {
        accessorKey: "sku",
        header: "SKU",
        size: 130,
        cell: (info) => <span className="num">{String(info.getValue())}</span>,
      },
      {
        accessorKey: "physicalQty",
        header: "Qtd",
        size: 80,
        cell: (info) => (
          <span className="num">{formatQty(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "availableQty",
        header: "Disponível",
        size: 100,
        cell: (info) => (
          <span className="num">{formatQty(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "reservedQty",
        header: "Reservado",
        size: 100,
        cell: (info) => (
          <span className="num">{formatQty(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "waitingPickupQty",
        header: "Aguardando retirada",
        size: 140,
        cell: (info) => (
          <span className="num">{formatQty(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "avgCost",
        header: "Custo médio",
        size: 110,
        cell: (info) => (
          <span className="num">{formatMoney(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "b2bPrice",
        header: "B2B",
        size: 100,
        cell: (info) => (
          <span className="num">{formatMoney(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "b2cPrice",
        header: "B2C",
        size: 100,
        cell: (info) => (
          <span className="num">{formatMoney(info.getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "inventoryValue",
        header: "Valor estoque",
        size: 120,
        cell: (info) => (
          <span className="num">{formatMoney(info.getValue() as number)}</span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode,
    initialState: { pagination: { pageSize: 25 } },
    globalFilterFn: (row, _columnId, filter) => {
      const q = String(filter || "").toLowerCase();
      if (!q) return true;
      const p = row.original;
      return [p.name, p.sku, p.secondarySku, p.ean, p.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {table.getFilteredRowModel().rows.length} produtos
        </div>
        <div style={{ position: "relative" }}>
          <button className="btn" type="button" onClick={() => setShowCols((v) => !v)}>
            Colunas
          </button>
          {showCols && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "110%",
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "0.6rem 0.75rem",
                zIndex: 10,
                minWidth: 200,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >
              {table.getAllLeafColumns().map((col) => (
                <label
                  key={col.id}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    padding: "0.25rem 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                  />
                  {COLUMN_LABELS[col.id] ?? col.id}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="table-wrap" style={{ maxHeight: "calc(100vh - 220px)" }}>
        <table className="data-table" style={{ width: table.getCenterTotalSize() }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      position: "relative",
                      cursor: header.column.getCanSort() ? "pointer" : "default",
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: " ↑",
                      desc: " ↓",
                    }[header.column.getIsSorted() as string] ?? null}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        height: "100%",
                        width: 4,
                        cursor: "col-resize",
                        userSelect: "none",
                        touchAction: "none",
                      }}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="empty">Nenhum produto encontrado</div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} onClick={() => onSelect(row.original)}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.5rem",
          alignItems: "center",
        }}
      >
        <button
          className="btn"
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Anterior
        </button>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Página {table.getState().pagination.pageIndex + 1} de{" "}
          {table.getPageCount() || 1}
        </span>
        <button
          className="btn"
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
