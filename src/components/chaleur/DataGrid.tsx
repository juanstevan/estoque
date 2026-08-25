"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type GridCol<T> = {
  key: keyof T | string;
  label: string;
  numeric?: boolean;
  render?: (row: T) => React.ReactNode;
  filterValue?: (row: T) => string;
};

export function DataGrid<T extends object>({
  rows,
  columns,
  onRowClick,
  getRowId,
  empty = "No rows",
  draggable,
}: {
  rows: T[];
  columns: GridCol<T>[];
  onRowClick?: (row: T) => void;
  getRowId: (row: T) => string;
  empty?: string;
  draggable?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    return rows.filter((row) =>
      columns.every((col) => {
        const q = filters[String(col.key)]?.toLowerCase().trim();
        if (!q) return true;
        const raw = col.filterValue
          ? col.filterValue(row)
          : String((row as Record<string, unknown>)[String(col.key)] ?? "");
        return raw.toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, filters]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sort.key];
      const bv = (b as Record<string, unknown>)[sort.key];
      const an = Number(av);
      const bn = Number(bv);
      let cmp = 0;
      if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") {
        cmp = an - bn;
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort]);

  return (
    <div className="overflow-auto rounded-lg border bg-card">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <TableRow>
            {columns.map((col) => {
              const key = String(col.key);
              const active = sort?.key === key;
              return (
                <TableHead key={key} className="align-top">
                  <button
                    type="button"
                    className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
                    onClick={() =>
                      setSort((s) =>
                        s?.key !== key
                          ? { key, dir: col.numeric ? "desc" : "asc" }
                          : { key, dir: s.dir === "asc" ? "desc" : "asc" },
                      )
                    }
                  >
                    {col.label}
                    {active ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                  </button>
                  <Input
                    className="h-7 text-xs"
                    placeholder="Filter"
                    value={filters[key] ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, [key]: e.target.value }))
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => (
              <TableRow
                key={getRowId(row)}
                className={cn("group", onRowClick && "cursor-pointer")}
                onClick={() => onRowClick?.(row)}
                draggable={draggable}
                onDragStart={(e) => {
                  if (draggable) {
                    e.dataTransfer.setData("text/plain", getRowId(row));
                  }
                }}
              >
                {columns.map((col) => (
                  <TableCell
                    key={String(col.key)}
                    className={col.numeric ? "font-mono tabular-nums" : undefined}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[String(col.key)] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
