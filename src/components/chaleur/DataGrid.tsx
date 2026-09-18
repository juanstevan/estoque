"use client";

import { memo, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Filter, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  /** Header + cells. Numeric columns default to end if omitted. */
  align?: "start" | "center" | "end";
};

type Sort = { key: string; dir: "asc" | "desc" };
type CmpOp = "gt" | "lt";

const CMP_OPS = [
  ["gt", "Higher than"],
  ["lt", "Lower than"],
] as const;

const CMP_LABEL: Record<string, string> = {
  all: "All Values",
  gt: "Higher than",
  lt: "Lower than",
};

function rawValue<T extends object>(col: GridCol<T>, row: T) {
  if (col.filterValue) return col.filterValue(row);
  return String((row as Record<string, unknown>)[String(col.key)] ?? "");
}

function numValue<T extends object>(col: GridCol<T>, row: T) {
  const v = col.sortValue
    ? col.sortValue(row)
    : (row as Record<string, unknown>)[String(col.key)];
  return Number(v);
}

function cmpOk(n: number, op: CmpOp, t: number) {
  return op === "gt" ? n > t : n < t;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

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
  selectable,
  checkedIds,
  onCheckedIdsChange,
  visibleIdsRef,
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
  selectable?: boolean;
  checkedIds?: ReadonlySet<string>;
  onCheckedIdsChange?: (ids: Set<string>) => void;
  visibleIdsRef?: { current: string[] | null };
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [exclude, setExclude] = useState<Record<string, boolean>>({});
  const [compare, setCompare] = useState<
    Record<string, { op?: CmpOp; value: string }>
  >({});
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const onRowClickRef = useRef(onRowClick);
  onRowClickRef.current = onRowClick;
  const toggleRef = useRef<(id: string) => void>(() => {});
  const fireRowClick = useRef((row: T) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onRowClickRef.current?.(row);
  }).current;
  const fireToggle = useRef((id: string) => {
    toggleRef.current(id);
  }).current;

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        columns.every((col) => {
          const key = String(col.key);
          const q = filters[key]?.toLowerCase().trim();
          const cmp = compare[key];
          const t = cmp?.value?.trim() ? Number(cmp.value) : NaN;
          const hasText = Boolean(q);
          const hasCmp = Boolean(col.numeric && cmp?.op && !Number.isNaN(t));
          if (!hasText && !hasCmp) return true;
          let textOk =
            !hasText || rawValue(col, row).toLowerCase().includes(q);
          if (exclude[key] && hasText) textOk = !textOk;
          if (!hasCmp) return textOk;
          const n = numValue(col, row);
          return textOk && !Number.isNaN(n) && cmpOk(n, cmp.op!, t);
        }),
      ),
    [rows, columns, filters, exclude, compare],
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

  const hasFilters = columns.some((col) => {
    const key = String(col.key);
    const cmp = compare[key];
    return Boolean(
      filters[key]?.trim() || (cmp?.op && cmp.value.trim()),
    );
  });
  const filteredToNothing = rows.length > 0 && sorted.length === 0;
  const colSpan = columns.length + (selectable ? 1 : 0);
  const checked = checkedIds ?? EMPTY_SET;
  const allVisibleChecked =
    selectable &&
    sorted.length > 0 &&
    sorted.every((row) => checked.has(getRowId(row)));
  const someVisibleChecked =
    selectable && sorted.some((row) => checked.has(getRowId(row)));

  if (visibleIdsRef) visibleIdsRef.current = sorted.map(getRowId);

  function toggleChecked(id: string) {
    if (!onCheckedIdsChange) return;
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onCheckedIdsChange(next);
  }
  toggleRef.current = toggleChecked;

  function toggleAllVisible() {
    if (!onCheckedIdsChange || sorted.length === 0) return;
    if (allVisibleChecked) {
      onCheckedIdsChange(new Set());
      return;
    }
    const next = new Set(checked);
    for (const row of sorted) next.add(getRowId(row));
    onCheckedIdsChange(next);
  }

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
              {selectable && (
                <th
                  scope="col"
                  style={{ width: 40 }}
                  className={cn(
                    "w-10 border-b border-border bg-sunken px-3 text-center align-middle",
                    scrolled && "shadow-xs",
                  )}
                >
                  <Checkbox
                    aria-label="Select all"
                    checked={Boolean(allVisibleChecked)}
                    indeterminate={Boolean(
                      someVisibleChecked && !allVisibleChecked,
                    )}
                    onCheckedChange={() => toggleAllVisible()}
                  />
                </th>
              )}
              {columns.map((col, colIndex) => {
                const key = String(col.key);
                const isSorted = sort?.key === key;
                const textFilter = filters[key]?.trim() ?? "";
                const cmp = compare[key];
                const hasCmp = Boolean(cmp?.op && cmp.value.trim());
                const isExcluded = Boolean(exclude[key] && textFilter);
                const isFiltered = Boolean(textFilter || hasCmp);
                function clearColumn() {
                  setFilters((f) => ({ ...f, [key]: "" }));
                  setExclude((e) => ({ ...e, [key]: false }));
                  setCompare((c) => {
                    const next = { ...c };
                    delete next[key];
                    return next;
                  });
                  if (isSorted) setSort(null);
                }
                return (
                  <th
                    scope="col"
                    key={key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "h-9 border-b border-border bg-sunken align-middle text-xs font-medium text-gray-600",
                      col.align === "center" ? "text-center" : "text-left",
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
                            "group/th -mx-1 inline-flex h-7 max-w-full items-center gap-1.5 rounded-sm px-1 outline-none hover:text-gray-900 data-popup-open:text-gray-900",
                            (isSorted || isFiltered) && "text-gray-900",
                          )}
                        >
                          <span className="truncate">{col.label}</span>
                          {isExcluded ? (
                            <EyeOff className="size-3 shrink-0" />
                          ) : isFiltered ? (
                            <Filter className="size-3 shrink-0 fill-current" />
                          ) : null}
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
                        <PopoverContent align="center" className="w-max gap-2 p-2">
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
                          {col.numeric && (
                            <div className="flex items-center gap-2 border-t border-gray-150 pt-2">
                              <Select
                                value={cmp?.op ?? "all"}
                                onValueChange={(v) => {
                                  const next = String(v);
                                  setCompare((c) => {
                                    if (next === "all") {
                                      const cur = c[key];
                                      if (!cur?.value.trim()) {
                                        const copy = { ...c };
                                        delete copy[key];
                                        return copy;
                                      }
                                      return { ...c, [key]: { value: cur.value } };
                                    }
                                    return {
                                      ...c,
                                      [key]: {
                                        op: next as CmpOp,
                                        value: c[key]?.value ?? "",
                                      },
                                    };
                                  });
                                }}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="w-36 shrink-0 focus-visible:border-gray-800 data-popup-open:border-gray-300 data-popup-open:focus-visible:border-gray-300 data-popup-open:[&_svg]:rotate-180"
                                >
                                  <SelectValue>
                                    {(v: string) => CMP_LABEL[v] ?? CMP_LABEL.all}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent
                                  align="start"
                                  alignItemWithTrigger={false}
                                >
                                  <SelectItem value="all">All Values</SelectItem>
                                  {CMP_OPS.map(([op, label]) => (
                                    <SelectItem key={op} value={op}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                aria-label="Amount"
                                className="h-control-sm w-20 shrink-0 px-2 text-right tabular-nums focus-visible:border-gray-800"
                                value={cmp?.value ?? ""}
                                onChange={(e) =>
                                  setCompare((c) => ({
                                    ...c,
                                    [key]: {
                                      op: c[key]?.op,
                                      value: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                          )}
                          <div className="h-px bg-gray-150" />
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              className="h-control-sm min-w-0 flex-1"
                              placeholder={`Filter ${col.label.toLowerCase()}`}
                              value={filters[key] ?? ""}
                              onChange={(e) =>
                                setFilters((f) => ({
                                  ...f,
                                  [key]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              type="button"
                              size="icon-sm"
                              variant={exclude[key] ? "default" : "secondary"}
                              aria-label={
                                exclude[key]
                                  ? "Show matching rows"
                                  : "Hide matching rows"
                              }
                              aria-pressed={Boolean(exclude[key])}
                              onClick={() =>
                                setExclude((e) => ({
                                  ...e,
                                  [key]: !e[key],
                                }))
                              }
                            >
                              {exclude[key] ? <EyeOff /> : <Eye />}
                            </Button>
                          </div>
                          {(isFiltered || isSorted || exclude[key]) && (
                            <MenuAction onClick={clearColumn}>
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
                <td colSpan={colSpan} className="p-0">
                  {filteredToNothing ? (
                    <EmptyState
                      title="No results for these filters"
                      action={
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setFilters({});
                            setExclude({});
                            setCompare({});
                          }}
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
                return (
                  <GridRow
                    key={id}
                    row={row}
                    id={id}
                    columns={columns}
                    selectable={selectable}
                    isChecked={checked.has(id)}
                    isSelected={selectedId === id}
                    clickable={Boolean(onRowClick)}
                    onRowClick={fireRowClick}
                    onToggleChecked={fireToggle}
                    draggable={draggable}
                    dragged={dragged}
                  />
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
            onClick={() => {
              setFilters({});
              setExclude({});
              setCompare({});
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

type GridRowProps<T extends object> = {
  row: T;
  id: string;
  columns: GridCol<T>[];
  selectable?: boolean;
  isChecked: boolean;
  isSelected: boolean;
  clickable: boolean;
  onRowClick: (row: T) => void;
  onToggleChecked: (id: string) => void;
  draggable?: boolean;
  dragged: { current: boolean };
};

function GridRowInner<T extends object>({
  row,
  id,
  columns,
  selectable,
  isChecked,
  isSelected,
  clickable,
  onRowClick,
  onToggleChecked,
  draggable,
  dragged,
}: GridRowProps<T>) {
  return (
    <tr
      aria-selected={isSelected || undefined}
      className={cn(
        "group h-10 transition-colors duration-[80ms]",
        clickable && "cursor-pointer",
        isSelected ? "bg-selected" : clickable && "hover:bg-gray-50",
      )}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onRowClick(row);
      }}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        dragged.current = true;
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          dragged.current = false;
        }, 0);
      }}
    >
      {selectable && (
        <td
          className={cn(
            "w-10 border-b border-gray-150 px-3 text-center align-middle",
            isSelected && "shadow-[inset_2px_0_0_0_var(--blue-600)]",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            aria-label="Select row"
            checked={isChecked}
            onCheckedChange={() => onToggleChecked(id)}
          />
        </td>
      )}
      {columns.map((col, colIndex) => (
        <td
          key={String(col.key)}
          className={cn(
            "truncate border-b border-gray-150 align-middle",
            colIndex === 0 && !selectable ? "px-4" : "px-3",
            !selectable &&
              colIndex === 0 &&
              isSelected &&
              "shadow-[inset_2px_0_0_0_var(--blue-600)]",
            col.align === "center"
              ? "text-center"
              : col.numeric && "text-right",
            col.numeric && "tabular-nums",
            col.mono && "font-mono text-xs text-gray-600",
          )}
        >
          {col.render
            ? col.render(row)
            : String((row as Record<string, unknown>)[String(col.key)] ?? "")}
        </td>
      ))}
    </tr>
  );
}

const GridRow = memo(GridRowInner) as typeof GridRowInner;

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
