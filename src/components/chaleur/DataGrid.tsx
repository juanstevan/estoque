"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Filter, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type GridCol<T> = {
  key: keyof T | string;
  label: string;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
  /** Record IDs, SKUs, codes — mono, one step down, secondary color. */
  mono?: boolean;
  render?: (row: T) => React.ReactNode;
  filterValue?: (row: T) => string;
  sortValue?: (row: T) => string | number;
  /** Decorative column (row actions) — no header menu. */
  plain?: boolean;
  width?: string;
};

type Sort = { key: string; dir: "asc" | "desc" };

function rawValue<T extends object>(col: GridCol<T>, row: T) {
  if (col.filterValue) return col.filterValue(row);
  return String((row as Record<string, unknown>)[String(col.key)] ?? "");
}

export function DataGrid<T extends object>({
  rows,
  columns,
  onRowClick,
  getRowId,
  selectedId,
  empty = "Nothing here yet",
  emptyHint,
  emptyAction,
  draggable,
  className,
}: {
  rows: T[];
  columns: GridCol<T>[];
  onRowClick?: (row: T) => void;
  getRowId: (row: T) => string;
  selectedId?: string | null;
  empty?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  draggable?: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        columns.every((col) => {
          const q = filters[String(col.key)]?.toLowerCase().trim();
          if (!q) return true;
          return rawValue(col, row).toLowerCase().includes(q);
        }),
      ),
    [rows, columns, filters],
  );

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => String(c.key) === sort.key);
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col?.sortValue
        ? col.sortValue(a)
        : (a as Record<string, unknown>)[sort.key];
      const bv = col?.sortValue
        ? col.sortValue(b)
        : (b as Record<string, unknown>)[sort.key];
      const an = Number(av);
      const bn = Number(bv);
      const numeric =
        !Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "";
      const cmp = numeric
        ? an - bn
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, columns]);

  const hasFilters = Object.values(filters).some((v) => v?.trim());
  const filteredToNothing = rows.length > 0 && sorted.length === 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface",
        className,
      )}
    >
      <div
        ref={scrollRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
        className="min-h-0 flex-1 overflow-auto"
      >
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              {columns.map((col, colIndex) => {
                const key = String(col.key);
                const isSorted = sort?.key === key;
                const isFiltered = Boolean(filters[key]?.trim());
                return (
                  <th
                    scope="col"
                    key={key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "h-9 border-b border-border bg-sunken text-left align-middle text-xs font-medium text-gray-600",
                      colIndex === 0 ? "px-4" : "px-3",
                      scrolled && "shadow-xs",
                    )}
                  >
                    {col.plain || !col.label ? (
                      <span className="sr-only">Actions</span>
                    ) : (
                      <Popover>
                        <PopoverTrigger
                          className={cn(
                            "group/th -mx-1 flex h-7 w-full items-center gap-1.5 rounded-sm px-1 outline-none hover:text-gray-900 data-popup-open:text-gray-900",
                            col.numeric && "justify-end",
                            (isSorted || isFiltered) && "text-gray-900",
                          )}
                        >
                          <span className="truncate">{col.label}</span>
                          {isFiltered && (
                            <Filter className="size-3 shrink-0 fill-current" />
                          )}
                          {isSorted &&
                            (sort.dir === "asc" ? (
                              <ArrowUp className="size-3 shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 shrink-0" />
                            ))}
                          {!isSorted && !isFiltered && (
                            <ListFilter className="size-3 shrink-0 text-gray-400 opacity-0 transition-opacity duration-[80ms] group-hover/th:opacity-100" />
                          )}
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-60 gap-2 p-2">
                          <div className="px-1 py-0.5 text-2xs font-medium tracking-caps text-gray-500 uppercase">
                            {col.label}
                          </div>
                          <div className="grid gap-0.5">
                            <MenuAction
                              active={isSorted && sort.dir === "asc"}
                              onClick={() => setSort({ key, dir: "asc" })}
                            >
                              <ArrowUp className="size-3.5 text-gray-500" />
                              {col.numeric ? "Low to high" : "A to Z"}
                            </MenuAction>
                            <MenuAction
                              active={isSorted && sort.dir === "desc"}
                              onClick={() => setSort({ key, dir: "desc" })}
                            >
                              <ArrowDown className="size-3.5 text-gray-500" />
                              {col.numeric ? "High to low" : "Z to A"}
                            </MenuAction>
                          </div>
                          <div className="h-px bg-gray-150" />
                          <Input
                            autoFocus
                            className="h-control-sm"
                            placeholder={`Filter ${col.label.toLowerCase()}`}
                            value={filters[key] ?? ""}
                            onChange={(e) =>
                              setFilters((f) => ({ ...f, [key]: e.target.value }))
                            }
                          />
                          {(isFiltered || isSorted) && (
                            <MenuAction
                              onClick={() => {
                                setFilters((f) => ({ ...f, [key]: "" }));
                                if (isSorted) setSort(null);
                              }}
                            >
                              Clear sort and filter
                            </MenuAction>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {filteredToNothing ? (
                    <EmptyState
                      title="No results for these filters"
                      action={
                        <Button
                          variant="secondary"
                          onClick={() => setFilters({})}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      title={empty}
                      hint={emptyHint}
                      action={emptyAction}
                    />
                  )}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const id = getRowId(row);
                const isSelected = selectedId === id;
                return (
                  <tr
                    key={id}
                    aria-selected={isSelected || undefined}
                    className={cn(
                      "group h-10 transition-colors duration-[80ms]",
                      onRowClick && "cursor-pointer",
                      isSelected
                        ? "bg-selected"
                        : onRowClick && "hover:bg-gray-50",
                    )}
                    onClick={() => onRowClick?.(row)}
                    draggable={draggable}
                    onDragStart={(e) => {
                      if (draggable) e.dataTransfer.setData("text/plain", id);
                    }}
                  >
                    {columns.map((col, colIndex) => (
                      <td
                        key={String(col.key)}
                        className={cn(
                          "truncate border-b border-gray-150 align-middle",
                          colIndex === 0
                            ? "px-4"
                            : "px-3",
                          colIndex === 0 &&
                            isSelected &&
                            "shadow-[inset_2px_0_0_0_var(--blue-600)]",
                          col.numeric && "text-right tabular-nums",
                          col.mono && "font-mono text-xs text-gray-600",
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : String(
                              (row as Record<string, unknown>)[
                                String(col.key)
                              ] ?? "",
                            )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {hasFilters && sorted.length > 0 && (
        <div className="flex h-10 shrink-0 items-center justify-between border-t border-border px-4 text-xs text-gray-600">
          <span>
            {sorted.length} of {rows.length}
          </span>
          <button
            type="button"
            className="text-gray-600 hover:text-gray-900"
            onClick={() => setFilters({})}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-90 flex-col items-center gap-2 px-4 py-16 text-center">
      <div className="text-md font-semibold text-gray-900">{title}</div>
      {hint && <p className="text-sm text-gray-600">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function MenuAction({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[30px] items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap",
        active
          ? "bg-gray-100 text-gray-900"
          : "text-gray-800 hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}
