"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  KindBookmark,
  StatusBadge,
  kindColor,
  statusLabel,
} from "@/components/chaleur/StatusBadge";
import { ProductDialog } from "@/components/chaleur/ProductDialog";
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
type CoreFn = (typeof COLS)[number];

const COL_CHROME: Record<
  (typeof COLS)[number],
  { label: string; color: string }
> = {
  PENDING: { label: "Pending", color: "#0091FF" },
  IN_TRANSIT: { label: "In Transit", color: "#FF9230" },
  DELAYED: { label: "Delayed", color: "#FF4245" },
};

const KIND_LABELS: Record<string, string> = {
  ALL: "All types",
  DOMESTIC: "Domestic",
  INTERNATIONAL: "International",
};

const TABLE_WIDTH = 800;
const COL_COLORS = [
  "#0091FF",
  "#FF9230",
  "#FF4245",
  "#22c55e",
  "#a855f7",
  "#14b8a6",
  "#eab308",
  "#64748b",
];

type ExtraCol = {
  id: string;
  label: string;
  color: string;
  core: CoreFn;
  importIds: string[];
};

function normName(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}

function parseExtras(raw: unknown): ExtraCol[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c, i) => {
    if (!c || typeof c !== "object") return [];
    const row = c as Record<string, unknown>;
    const core = COLS.includes(row.core as CoreFn)
      ? (row.core as CoreFn)
      : "DELAYED";
    return [
      {
        id: String(row.id ?? `col_${i}`),
        label: String(row.label ?? ""),
        color: String(row.color ?? COL_COLORS[3]),
        core,
        importIds: Array.isArray(row.importIds)
          ? row.importIds.map(String)
          : [],
      },
    ];
  });
}

function nameTaken(label: string, names: string[]) {
  const n = normName(label);
  if (!n) return false;
  return names.some((name) => normName(name) === n);
}

function extrasIn(extras: ExtraCol[], core: CoreFn) {
  return extras.filter((c) => c.core === core);
}

function placeInCore(
  cols: ExtraCol[],
  id: string,
  core: CoreFn,
  index: number,
) {
  const item = cols.find((c) => c.id === id);
  if (!item) return cols;
  const fromIndex = extrasIn(cols, item.core).findIndex((c) => c.id === id);
  const rest = cols.filter((c) => c.id !== id);
  const groups: Record<CoreFn, ExtraCol[]> = {
    PENDING: extrasIn(rest, "PENDING"),
    IN_TRANSIT: extrasIn(rest, "IN_TRANSIT"),
    DELAYED: extrasIn(rest, "DELAYED"),
  };
  let i = Math.max(0, Math.min(index, groups[core].length));
  if (item.core === core && fromIndex !== -1 && fromIndex < i) i -= 1;
  groups[core] = [
    ...groups[core].slice(0, i),
    { ...item, core },
    ...groups[core].slice(i),
  ];
  return [...groups.PENDING, ...groups.IN_TRANSIT, ...groups.DELAYED];
}

let dragGhost: HTMLElement | null = null;

function startCardDrag(el: HTMLElement, e: React.DragEvent) {
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.style.cssText = [
    "position:absolute",
    "top:-1000px",
    "left:0",
    `width:${el.offsetWidth}px`,
    "transform:rotate(4deg)",
    "box-shadow:0 8px 20px rgb(13 16 21 / 0.14)",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  dragGhost = ghost;
}

function endCardDrag() {
  dragGhost?.remove();
  dragGhost = null;
}

export function ImportsTab({
  imports,
  products,
  reasons,
  onReload,
}: {
  imports: ImportRow[];
  products: ProductRow[];
  reasons: string[];
  onReload: () => void;
}) {
  const [kind, setKind] = useState<"ALL" | "DOMESTIC" | "INTERNATIONAL">("ALL");
  const [search, setSearch] = useState("");
  const [fullDate, setFullDate] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overDelete, setOverDelete] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ImportRow | null>(null);
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [addingImport, setAddingImport] = useState(false);
  const [extras, setExtras] = useState<ExtraCol[]>([]);
  const [tableQuery, setTableQuery] = useState("");
  const [addingCol, setAddingCol] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState(COL_COLORS[3]);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [savedSuppliers, setSavedSuppliers] = useState<string[]>([]);
  const knownSuppliers = useMemo(() => {
    const names = new Set(savedSuppliers);
    for (const row of imports) {
      if (row.supplierName) names.add(row.supplierName);
    }
    for (const product of products) {
      for (const name of splitSuppliers(product.suppliers)) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [savedSuppliers, imports, products]);
  const [doneNotice, setDoneNotice] = useState<{
    id: string;
    reference: string;
    status: ImportRow["status"];
    extraId?: string;
  } | null>(null);
  const [doneFading, setDoneFading] = useState(false);
  const doneTimer = useRef(0);

  const columnNames = useMemo(
    () => [
      ...Object.values(COL_CHROME).map((c) => c.label),
      ...extras.map((c) => c.label),
    ],
    [extras],
  );

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        try {
          setExtras(parseExtras(JSON.parse(s.settings?.importColumns ?? "[]")));
        } catch {
          /* keep empty */
        }
        setSavedSuppliers(
          Array.isArray(s.suppliers)
            ? s.suppliers.map((row: { name: string }) => row.name).filter(Boolean)
            : [],
        );
      });
    return () => window.clearTimeout(doneTimer.current);
  }, []);

  const customIds = new Set(extras.flatMap((c) => c.importIds));
  const active = imports.filter((i) => {
    if (i.status === "COMPLETED") return false;
    if (kind !== "ALL" && i.kind !== kind) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [i.reference, i.supplierName].some((v) =>
      String(v ?? "").toLowerCase().includes(q),
    );
  });
  const tableRows = imports.filter((i) =>
    i.reference.toLowerCase().includes(tableQuery.toLowerCase().trim()),
  );

  function saveExtras(next: ExtraCol[]) {
    setExtras(next);
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importColumns: next }),
    });
  }

  function pullFromExtras(id: string, cols = extras) {
    return cols.map((c) => ({
      ...c,
      importIds: c.importIds.filter((x) => x !== id),
    }));
  }

  async function move(id: string, status: ImportRow["status"]) {
    const res = await fetch("/api/importations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", id, status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't update status");
    }
    onReload();
  }

  function showDone(imp: ImportRow, extraId?: string) {
    setDoneFading(false);
    setDoneNotice({
      id: imp.id,
      reference: imp.reference,
      status: imp.status,
      extraId,
    });
    window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(() => {
      setDoneFading(true);
      doneTimer.current = window.setTimeout(() => setDoneNotice(null), 300);
    }, 2000);
  }

  async function completeImport(imp: ImportRow, extraId?: string) {
    await move(imp.id, "COMPLETED");
    saveExtras(pullFromExtras(imp.id));
    showDone(imp, extraId);
  }

  async function undoComplete() {
    if (!doneNotice) return;
    const { id, status, extraId } = doneNotice;
    setDoneNotice(null);
    setDoneFading(false);
    window.clearTimeout(doneTimer.current);
    await move(id, status);
    if (extraId) {
      saveExtras(
        pullFromExtras(id).map((c) =>
          c.id === extraId ? { ...c, importIds: [...c.importIds, id] } : c,
        ),
      );
    }
  }

  async function assign(id: string, colId: string) {
    if ((COLS as readonly string[]).includes(colId)) {
      await move(id, colId as ImportRow["status"]);
      saveExtras(pullFromExtras(id));
      return;
    }
    const extra = extras.find((c) => c.id === colId);
    if (!extra) return;
    const row = imports.find((i) => i.id === id);
    if (row?.status !== extra.core) await move(id, extra.core);
    saveExtras(
      pullFromExtras(id).map((c) =>
        c.id === colId ? { ...c, importIds: [...c.importIds, id] } : c,
      ),
    );
  }

  async function removeCustomColumn(col: ExtraCol) {
    try {
      for (const id of col.importIds) {
        await move(id, col.core);
      }
      saveExtras(extras.filter((c) => c.id !== col.id));
      setEditingCol(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't delete column");
    }
  }

  function onDrop(colId: string, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    void assign(id, colId).catch((err: Error) => window.alert(err.message));
  }

  async function remove(id: string) {
    await fetch("/api/importations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    onReload();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
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

          <Button variant="secondary" onClick={() => setOrganizeOpen(true)}>
            <List /> Organize
          </Button>

          <Button
            variant="secondary"
            onClick={() => (window.location.href = "/api/import-export")}
          >
            <Download /> Export
          </Button>
          <Button onClick={() => setAddingImport(true)}>
            <Plus /> Add
          </Button>
        </div>

        <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
            {COLS.map((col) => {
              const cards = active.filter(
                (i) => i.status === col && !customIds.has(i.id),
              );
              const chrome = COL_CHROME[col];
              return (
                <Fragment key={col}>
                <BoardColumn
                  label={chrome.label}
                  color={chrome.color}
                  count={cards.length}
                  onDrop={(e) => onDrop(col, e)}
                >
                  {cards.map((imp) => (
                    <ImportCard
                      key={imp.id}
                      imp={imp}
                      fullDate={fullDate}
                      faded={draggingId === imp.id}
                      onOpen={() => setEditing(imp)}
                      onAdvance={() =>
                        void (col === "PENDING"
                          ? move(imp.id, "IN_TRANSIT")
                          : completeImport(imp)
                        ).catch((err: Error) => window.alert(err.message))
                      }
                      onDragBegin={(el, e) => {
                        e.dataTransfer.setData("text/plain", imp.id);
                        e.dataTransfer.effectAllowed = "move";
                        startCardDrag(el, e);
                        setDraggingId(imp.id);
                      }}
                      onDragEnd={() => {
                        endCardDrag();
                        setDraggingId(null);
                        setOverDelete(false);
                      }}
                    />
                  ))}
                </BoardColumn>
                {extrasIn(extras, col).map((custom) => {
              const customCards = custom.importIds
                .map((id) => active.find((i) => i.id === id))
                .filter((i): i is ImportRow => Boolean(i));
              return (
                <BoardColumn
                  key={custom.id}
                  label={custom.label}
                  color={custom.color}
                  count={customCards.length}
                  onDrop={(e) => onDrop(custom.id, e)}
                  header={
                    editingCol === custom.id ? (
                      <ColumnEditor
                        label={custom.label}
                        color={custom.color}
                        onDone={(label, color) => {
                          if (!label.trim()) {
                            setEditingCol(null);
                            return;
                          }
                          if (
                            nameTaken(
                              label,
                              columnNames.filter((n) => n !== custom.label),
                            )
                          ) {
                            return "A column with this name already exists.";
                          }
                          saveExtras(
                            extras.map((c) =>
                              c.id === custom.id
                                ? { ...c, label: label.trim(), color }
                                : c,
                            ),
                          );
                          setEditingCol(null);
                        }}
                        onRemove={() => void removeCustomColumn(custom)}
                      />
                    ) : undefined
                  }
                  onHeaderClick={() => setEditingCol(custom.id)}
                >
                  {customCards.map((imp) => (
                    <ImportCard
                      key={imp.id}
                      imp={imp}
                      fullDate={fullDate}
                      faded={draggingId === imp.id}
                      showCheck
                      onOpen={() => setEditing(imp)}
                      onAdvance={() =>
                        void completeImport(imp, custom.id).catch((err: Error) =>
                          window.alert(err.message),
                        )
                      }
                      onDragBegin={(el, e) => {
                        e.dataTransfer.setData("text/plain", imp.id);
                        e.dataTransfer.effectAllowed = "move";
                        startCardDrag(el, e);
                        setDraggingId(imp.id);
                      }}
                      onDragEnd={() => {
                        endCardDrag();
                        setDraggingId(null);
                        setOverDelete(false);
                      }}
                    />
                  ))}
                </BoardColumn>
              );
                })}
                </Fragment>
              );
            })}

            {addingCol ? (
              <div className="flex w-[264px] shrink-0 flex-col gap-1.5 rounded-xl p-1.5">
                <ColumnEditor
                  label={draftLabel}
                  color={draftColor}
                  placeholder="Column title"
                  onDone={(label, color) => {
                    if (!label.trim()) {
                      setDraftLabel("");
                      setDraftColor(COL_COLORS[3]);
                      setAddingCol(false);
                      return;
                    }
                    if (nameTaken(label, columnNames)) {
                      return "A column with this name already exists.";
                    }
                    saveExtras([
                      ...extras,
                      {
                        id: `col_${Date.now().toString(36)}`,
                        label: label.trim(),
                        color,
                        core: "DELAYED",
                        importIds: [],
                      },
                    ]);
                    setDraftLabel("");
                    setDraftColor(COL_COLORS[3]);
                    setAddingCol(false);
                  }}
                  onRemove={() => {
                    setDraftLabel("");
                    setDraftColor(COL_COLORS[3]);
                    setAddingCol(false);
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="flex h-10 w-32 shrink-0 items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setAddingCol(true)}
              >
                <Plus className="size-3.5" /> Add column
              </button>
            )}
          </div>

          {doneNotice && !draggingId && (
            <div
              role="status"
              className={cn(
                "absolute bottom-3 left-1/2 z-20 flex h-12 -translate-x-1/2 items-center gap-3 rounded-md border border-success-border bg-success-fill px-3 text-xs font-medium text-success-text transition-opacity duration-300",
                doneFading && "opacity-0",
              )}
            >
              <span className="whitespace-nowrap">
                {doneNotice.reference} was completed
              </span>
              <button
                type="button"
                className="underline decoration-success-text/40 underline-offset-2 outline-none hover:decoration-success-text"
                onClick={() =>
                  void undoComplete().catch((err: Error) =>
                    window.alert(err.message),
                  )
                }
              >
                Undo
              </button>
            </div>
          )}

          {draggingId && (
          <div
            className={cn(
              "absolute bottom-3 left-1/2 z-10 flex h-12 w-60 -translate-x-1/2 items-center justify-center gap-3 rounded-md border border-dashed text-xs font-medium",
              overDelete
                ? "border-danger-text bg-danger-fill text-danger-text"
                : "border-[#c00] bg-[#fff0f0] text-[#c00]",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOverDelete(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverDelete(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOverDelete(false);
              const id = e.dataTransfer.getData("text/plain");
              const row = imports.find((i) => i.id === id);
              if (row) setPendingDelete(row);
            }}
          >
            <Trash2 className="size-3.5" />
            Delete Import
          </div>
          )}
        </div>

      <div className="absolute top-0 right-0 bottom-3 -mr-6 z-10 flex items-stretch">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="z-10 my-auto flex h-[100px] w-6 shrink-0 items-center justify-center rounded-l-[24px] border-1 border-r-0 border-border bg-white"
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

          <div
            className="min-w-0 overflow-hidden rounded-l-[14px] bg-white transition-[width] duration-300 ease-in-out"
            style={{ width: tableOpen ? TABLE_WIDTH : 0 }}
            aria-hidden={!tableOpen}
          >
          <div
            className="flex h-full min-h-0 flex-col gap-4 rounded-[inherit] border-1 border-r-0 border-border bg-white p-1.5"
            style={{ width: TABLE_WIDTH }}
          >
            <div className="flex h-8 items-center px-3 text-sm font-medium text-gray-900">
              All imports
            </div>
            <div className="relative w-[320px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                className="h-control-sm pl-8 focus:border-gray-900 focus-visible:border-gray-900"
                placeholder="Search reference"
                value={tableQuery}
                onChange={(e) => setTableQuery(e.target.value)}
              />
            </div>
            <DataGrid
              rows={tableRows}
              getRowId={(i) => i.id}
              draggable
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
        </div>
      </div>
        </div>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(v) => !v && setPendingDelete(null)}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete importation?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `Delete ${pendingDelete.reference}? This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>
              No
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) void remove(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrganizeDialog
        open={organizeOpen}
        extras={extras}
        onChange={(next) => {
          const prev = new Map(extras.map((c) => [c.id, c]));
          saveExtras(next);
          for (const col of next) {
            const old = prev.get(col.id);
            if (!old || old.core === col.core) continue;
            for (const id of col.importIds) {
              void move(id, col.core).catch((err: Error) =>
                window.alert(err.message),
              );
            }
          }
        }}
        onClose={() => setOrganizeOpen(false)}
      />

      {(editing || addingImport) && (
        <ImportDialog
          open
          initial={editing}
          kind={editing?.kind ?? "INTERNATIONAL"}
          products={products}
          suppliers={knownSuppliers}
          reasons={reasons}
          onClose={() => {
            setEditing(null);
            setAddingImport(false);
          }}
          onSaved={() => {
            setEditing(null);
            setAddingImport(false);
            onReload();
          }}
          onCatalogChange={onReload}
        />
      )}
    </div>
  );
}

function OrganizeDialog({
  open,
  extras,
  onChange,
  onClose,
}: {
  open: boolean;
  extras: ExtraCol[];
  onChange: (next: ExtraCol[]) => void;
  onClose: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  function drop(core: CoreFn, index: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/plain");
    if (!id || !extras.some((c) => c.id === id)) return;
    onChange(placeInCore(extras, id, core, index));
    setDragId(null);
    endCardDrag();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[840px]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Organize columns</DialogTitle>
          <DialogDescription>
            Drag custom columns to change their stage or order. Default columns stay put.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[360px] gap-4">
          {COLS.map((core) => {
            const chrome = COL_CHROME[core];
            const custom = extrasIn(extras, core);
            return (
              <div
                key={core}
                data-organize-core={core}
                className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl p-1.5"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(core, custom.length, e)}
              >
                <div
                  className="flex h-10 items-center gap-3 rounded-md px-3"
                  style={{
                    color: chrome.color,
                    backgroundColor: `color-mix(in srgb, ${chrome.color} 5%, transparent)`,
                  }}
                >
                  <span className="text-sm font-medium">{chrome.label}</span>
                </div>
                <div
                  className="rounded-md bg-[#f0f2f5] px-3 py-2.5 text-sm font-medium text-gray-700"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(core, 0, e)}
                >
                  {chrome.label}
                </div>
                {custom.map((col, i) => (
                  <div
                    key={col.id}
                    role="button"
                    aria-label={col.label}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", col.id);
                      e.dataTransfer.effectAllowed = "move";
                      startCardDrag(e.currentTarget, e);
                      setDragId(col.id);
                    }}
                    onDragEnd={() => {
                      endCardDrag();
                      setDragId(null);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => drop(core, i, e)}
                    className={cn(
                      "cursor-grab rounded-md bg-[#fcfcfc] px-3 py-2.5 text-sm font-medium text-gray-900 hover:shadow-[inset_0_0_0_1px_#999] active:cursor-grabbing",
                      dragId === col.id && "opacity-35",
                    )}
                  >
                    {col.label}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BoardColumn({
  label,
  color,
  count,
  children,
  header,
  onDrop,
  onHeaderClick,
}: {
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
  header?: React.ReactNode;
  onDrop: (e: React.DragEvent) => void;
  onHeaderClick?: () => void;
}) {
  return (
    <div
      className="flex w-[264px] shrink-0 flex-col gap-1.5 rounded-xl p-1.5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {header ?? (
        <div
          role={onHeaderClick ? "button" : undefined}
          tabIndex={onHeaderClick ? 0 : undefined}
          className="flex h-10 items-center gap-3 rounded-md px-3"
          style={{
            color,
            backgroundColor: `color-mix(in srgb, ${color} 5%, transparent)`,
          }}
          onClick={onHeaderClick}
        >
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-gray-500 tabular-nums">{count}</span>
        </div>
      )}
      <div className="flex min-h-20 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {children}
      </div>
    </div>
  );
}

function ColumnEditor({
  label,
  color,
  placeholder,
  onDone,
  onRemove,
}: {
  label: string;
  color: string;
  placeholder?: string;
  onDone: (label: string, color: string) => string | void;
  onRemove?: () => void;
}) {
  const [title, setTitle] = useState(label);
  const [tone, setTone] = useState(color);
  const [swatches, setSwatches] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const skip = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  function commit(nextLabel: string, nextColor: string) {
    const msg = onDone(nextLabel, nextColor);
    if (msg) {
      skip.current = false;
      setHint(msg);
      return false;
    }
    return true;
  }

  useEffect(() => {
    function down(e: PointerEvent) {
      if (skip.current || root.current?.contains(e.target as Node)) return;
      skip.current = true;
      commit(title, tone);
    }
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [title, tone, onDone]);

  return (
    <div
      ref={root}
      className="relative rounded-md"
      style={{
        color: tone,
        backgroundColor: `color-mix(in srgb, ${tone} 5%, transparent)`,
      }}
    >
      <div className="flex items-center gap-3 py-2.5 pr-2.5 pl-3">
      <input
        autoFocus
        aria-label="Column title"
        className="min-w-0 flex-1 rounded-none border-0 border-b border-current/40 bg-transparent pb-0.5 text-sm font-medium outline-none placeholder:text-current/50 focus-visible:border-current"
        value={title}
        placeholder={placeholder}
        onChange={(e) => {
          setTitle(e.target.value);
          setHint(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            skip.current = true;
            if (!commit(title, tone)) skip.current = false;
          }
          if (e.key === "Escape") {
            skip.current = true;
            onDone(label, color);
          }
        }}
      />
      <button
        type="button"
        aria-label="Column color"
        aria-expanded={swatches}
        className="size-4 shrink-0 rounded-full outline-none"
        style={{ background: tone }}
        onClick={() => setSwatches((v) => !v)}
      />
      {onRemove && (
        <button
          type="button"
          aria-label="Remove column"
          className="flex size-4 shrink-0 items-center justify-center text-gray-400 outline-none hover:text-gray-700"
          onClick={() => {
            skip.current = true;
            onRemove();
          }}
        >
          <Minus className="size-3.5" />
        </button>
      )}
      {swatches && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-20 flex items-center gap-2.5 rounded-lg border border-border bg-white p-3 shadow-sm">
          {COL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={tone === c}
              className="flex size-5 items-center justify-center rounded-full outline-none"
              style={{ background: c }}
              onClick={() => setTone(c)}
            >
              {tone === c && (
                <Check className="size-3 text-white drop-shadow" strokeWidth={3} />
              )}
            </button>
          ))}
        </div>
      )}
      </div>
      {hint ? (
        <p className="px-3 pb-2 text-[11px] leading-tight text-danger-text">{hint}</p>
      ) : null}
    </div>
  );
}

function ImportCard({
  imp,
  fullDate,
  faded,
  showCheck,
  onOpen,
  onAdvance,
  onDragBegin,
  onDragEnd,
}: {
  imp: ImportRow;
  fullDate: boolean;
  faded: boolean;
  showCheck?: boolean;
  onOpen: () => void;
  onAdvance: () => void;
  onDragBegin: (el: HTMLElement, e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const year = imp.expectedDate
    ? new Date(imp.expectedDate).getFullYear().toString()
    : "";
  const advancing = !showCheck && imp.status === "PENDING";
  const intl = imp.kind === "INTERNATIONAL";
  const tone = kindColor(imp.kind);
  return (
    <div
      draggable
      tabIndex={0}
      aria-label={`${imp.reference} ${imp.supplierName ?? "Unassigned"}`}
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          e.preventDefault();
          return;
        }
        onDragBegin(e.currentTarget, e);
      }}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative flex h-[100px] w-[240px] shrink-0 cursor-pointer flex-col justify-between rounded-md bg-[#fcfcfc] p-3 transition-[box-shadow,opacity] duration-[80ms] hover:[box-shadow:inset_0_0_0_1px_var(--kind-border)] active:[box-shadow:inset_0_0_0_1px_var(--kind-border)]",
        faded && "opacity-35",
      )}
      style={{ "--kind-border": tone } as CSSProperties}
      onClick={onOpen}
    >
      <button
        type="button"
        className="absolute top-0 right-0 flex h-[22px] w-[30px] items-center justify-center rounded-tr-md rounded-bl-md text-[10px] font-semibold text-white"
        style={{ background: tone }}
        aria-label={advancing ? "Move to in transit" : "Confirm receipt"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onAdvance();
        }}
      >
        <span className="font-mono group-hover:hidden">
          {intl ? "INT" : "DOM"}
        </span>
        {advancing ? (
          <ArrowRight className="hidden size-3.5 group-hover:block" />
        ) : (
          <Check className="hidden size-3.5 group-hover:block" />
        )}
      </button>

      <div className="flex min-w-0 gap-1.5 pr-6">
        <div className="flex shrink-0 flex-col gap-3 py-0.5 font-mono text-xs leading-none">
          <div className="flex items-center gap-1.5 font-medium text-gray-500">
            <span>{imp.reference}</span>
            <span>•</span>
          </div>
          <div className="tabular-nums text-gray-400">
            {imp.coefficient.toFixed(2)}×
          </div>
        </div>
        <div className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px] font-medium text-gray-900">
          {imp.supplierName ?? "Unassigned"}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500 tabular-nums">
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
        <span className="font-mono text-base font-medium text-gray-900 tabular-nums">
          {formatMoney(imp.productSubtotal + imp.totalAdditionalCosts)}
        </span>
      </div>
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
  kind: initialKind,
  products,
  suppliers,
  reasons,
  onClose,
  onSaved,
  onCatalogChange,
}: {
  open: boolean;
  initial: ImportRow | null;
  kind: "DOMESTIC" | "INTERNATIONAL";
  products: ProductRow[];
  suppliers: string[];
  reasons: string[];
  onClose: () => void;
  onSaved: () => void;
  onCatalogChange: () => void;
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
    lines: (initial?.lines ?? []).map((l) => ({
      productId: l.productId,
      name: l.product?.name ?? l.draftName ?? "",
      quantity: l.quantity,
      purchaseUnitCost: l.purchaseUnitCost,
    })),
  }));
  const [adding, setAdding] = useState(form.lines.length === 0);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<number | null>(null);
  const [focusQty, setFocusQty] = useState<number | null>(
    form.lines.length ? form.lines.length - 1 : null,
  );
  const [kind, setKind] = useState(initialKind);
  const [catalog, setCatalog] = useState(products);
  const clickTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  useEffect(() => {
    setCatalog(products);
  }, [products]);

  const subtotal = form.lines.reduce(
    (s, l) => s + l.quantity * l.purchaseUnitCost,
    0,
  );
  const additional = additionalImportCosts(form);
  const cbm = useMemo(() => {
    return form.lines.reduce((s, l) => {
      const p = catalog.find((x) => x.id === l.productId);
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
  }, [form.lines, catalog]);
  const kg = form.lines.reduce((s, l) => {
    const p = catalog.find((x) => x.id === l.productId);
    return s + (p?.packageWeight ?? p?.weight ?? 0) * l.quantity;
  }, 0);

  const q = query.trim().toLowerCase();
  const matches = catalog.filter(
    (p) =>
      !q ||
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q),
  );

  function addLine(product: { id: string; code: string; name: string }) {
    const priced = catalog.find((p) => p.id === product.id);
    const nextIndex = form.lines.length;
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          purchaseUnitCost: priced?.fobCost || priced?.cifCost || 0,
        },
      ],
    }));
    setFocusQty(nextIndex);
    setAdding(false);
    setQuery("");
  }

  function replaceLine(
    index: number,
    product: { id: string; code: string; name: string },
  ) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line, j) =>
        j === index
          ? { ...line, productId: product.id, name: product.name }
          : line,
      ),
    }));
    setReplacing(null);
    setQuery("");
  }

  function removeLine(index: number) {
    setForm((f) => {
      const lines = f.lines.filter((_, j) => j !== index);
      if (lines.length === 0) setAdding(true);
      return { ...f, lines };
    });
    setFocusQty((cur) => {
      if (cur == null) return cur;
      if (cur === index) return null;
      return cur > index ? cur - 1 : cur;
    });
    setReplacing((cur) => {
      if (cur == null) return cur;
      if (cur === index) return null;
      return cur > index ? cur - 1 : cur;
    });
  }

  function openProduct(productId: string | null) {
    if (!productId) return;
    window.clearTimeout(clickTimer.current);
    setViewingId(productId);
  }

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
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-[1080px]">
        <DialogTitle className="sr-only">
          {initial ? "Importation" : "New importation"}
        </DialogTitle>
        <KindBookmark
          kind={kind}
          onClick={() =>
            setKind((k) =>
              k === "INTERNATIONAL" ? "DOMESTIC" : "INTERNATIONAL",
            )
          }
        />

        <div className="flex items-center gap-3 pr-10">
          <HugInput
            mono
            placeholder="CODE"
            value={form.reference}
            onChange={(reference) => setForm({ ...form, reference })}
          />
          <span className="text-md font-semibold text-gray-900">•</span>
          <SupplierPicker
            value={form.supplierName}
            options={suppliers}
            onChange={(supplierName) => setForm({ ...form, supplierName })}
          />
          <ImportProgress status={initial?.status ?? "PENDING"} />
        </div>

        <div className="flex h-[360px] flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="grid h-9 shrink-0 grid-cols-[104px_minmax(0,1fr)_72px_104px_112px_36px] border-b border-border bg-sunken text-xs font-medium text-gray-600">
            <div className="flex items-center px-3">ID</div>
            <div className="flex items-center px-3">Name</div>
            <div className="flex items-center justify-end px-3">Qnt</div>
            <div className="flex items-center justify-end px-3">Cost</div>
            <div className="flex items-center justify-end px-3">Total</div>
            <div />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {form.lines.map((l, i) => {
              const code =
                catalog.find((p) => p.id === l.productId)?.code ?? "—";
              const changing = replacing === i;
              return (
                <div
                  key={`${l.productId ?? "draft"}-${i}`}
                  className="group/line grid cursor-pointer grid-cols-[104px_minmax(0,1fr)_72px_104px_112px_36px] items-center border-b border-border py-1.5 text-xs hover:bg-gray-50"
                  onClick={(e) => {
                    if (
                      changing ||
                      (e.target as HTMLElement).closest("button, input")
                    ) {
                      return;
                    }
                    window.clearTimeout(clickTimer.current);
                    clickTimer.current = window.setTimeout(
                      () => openProduct(l.productId),
                      220,
                    );
                  }}
                  onDoubleClick={(e) => {
                    if (changing || (e.target as HTMLElement).closest("button, input")) {
                      return;
                    }
                    window.clearTimeout(clickTimer.current);
                    openProduct(l.productId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setReplacing(null);
                      setQuery("");
                    }
                  }}
                >
                  <div className="truncate px-3 text-left font-mono">
                    {code}
                  </div>
                  {changing ? (
                    <ProductPicker
                      query={query}
                      matches={matches}
                      onQuery={setQuery}
                      onPick={(p) => replaceLine(i, p)}
                      onCreate={() => setCreating(true)}
                      onDismiss={() => {
                        if (creating) return;
                        setReplacing(null);
                        setQuery("");
                      }}
                    />
                  ) : (
                    <div className="flex min-w-0 items-center gap-1.5 px-3">
                      <span className="min-w-0 truncate">{l.name}</span>
                      <button
                        type="button"
                        aria-label={`Change ${l.name || code}`}
                        className="flex size-6 shrink-0 items-center justify-center text-gray-400 opacity-0 group-hover/line:opacity-100 hover:text-gray-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.clearTimeout(clickTimer.current);
                          setAdding(false);
                          setReplacing(i);
                          setQuery("");
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <Input
                    autoFocus={focusQty === i}
                    className="h-7 border-0 bg-transparent text-right shadow-none"
                    type="number"
                    min={0}
                    step="any"
                    aria-label={`${l.name || code} quantity`}
                    value={Number.isFinite(l.quantity) ? l.quantity : 0}
                    onFocus={() => setFocusQty(i)}
                    onChange={(e) => {
                      const lines = [...form.lines];
                      lines[i] = {
                        ...l,
                        quantity: Number(e.target.value) || 0,
                      };
                      setForm({ ...form, lines });
                    }}
                  />
                  <Input
                    className="h-7 border-0 bg-transparent text-right font-mono shadow-none"
                    type="number"
                    min={0}
                    step="any"
                    aria-label={`${l.name || code} cost`}
                    value={Number.isFinite(l.purchaseUnitCost) ? l.purchaseUnitCost : 0}
                    onChange={(e) => {
                      const lines = [...form.lines];
                      lines[i] = {
                        ...l,
                        purchaseUnitCost: Number(e.target.value) || 0,
                      };
                      setForm({ ...form, lines });
                    }}
                  />
                  <div className="px-3 text-right font-mono tabular-nums">
                    {formatMoney(l.quantity * l.purchaseUnitCost)}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${l.name || code}`}
                    className="flex size-9 items-center justify-center text-gray-400 hover:text-danger-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLine(i);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
            {adding ? (
              <div className="relative grid grid-cols-[104px_minmax(0,1fr)_72px_104px_112px_36px] items-center border-b border-border py-1.5">
                <div />
                <ProductPicker
                  query={query}
                  matches={matches}
                  onQuery={setQuery}
                  onPick={addLine}
                  onCreate={() => setCreating(true)}
                  onDismiss={() => {
                    if (creating) return;
                    setAdding(form.lines.length === 0);
                    setQuery("");
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400"
                onClick={() => {
                  setAdding(true);
                  setQuery("");
                }}
              >
                <Plus className="size-3.5" /> Add Product
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-x-3 gap-y-4">
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
          <div className="grid min-w-0 flex-1 gap-1.5 rounded-lg border border-border bg-sunken px-6 py-4">
            <SummaryRow label="CBM" value={`${roundMoney(cbm, 4)} m³`} />
            <SummaryRow
              label="Total weight"
              value={`${roundMoney(kg, 1)} kg · ${roundMoney(kg * 2.20462, 0)} lbs`}
            />
            <div className="my-1 h-px bg-gray-200" />
            <SummaryRow label="Products" value={formatMoney(subtotal)} />
            <SummaryRow
              label="Additional costs"
              value={formatMoney(additional)}
            />
            <SummaryRow
              label="Total amount"
              value={formatMoney(subtotal + additional)}
              strong
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>

      <ProductDialog
        open={creating || Boolean(viewingId)}
        productId={creating ? null : viewingId}
        mode={creating ? "create" : "edit"}
        reasons={reasons}
        onClose={() => {
          setCreating(false);
          setViewingId(null);
          setReplacing(null);
        }}
        onSaved={(saved) => {
          if (saved) {
            setCatalog((c) =>
              c.some((p) => p.id === saved.id)
                ? c.map((p) =>
                    p.id === saved.id ? { ...p, ...saved } : p,
                  )
                : [
                    ...c,
                    {
                      ...saved,
                      sku: "",
                      physicalQty: 0,
                      availableQty: 0,
                      reservedQty: 0,
                      avgCost: 0,
                      inventoryValue: 0,
                      b2bPrice: 0,
                      b2cPrice: 0,
                      fobCost: 0,
                      cifCost: 0,
                      lastSoldPrice: 0,
                      amazonUrl: null,
                      imageUrl: null,
                      notes: null,
                      suppliers: null,
                      weight: null,
                      length: null,
                      width: null,
                      height: null,
                      packageLength: null,
                      packageWidth: null,
                      packageHeight: null,
                      packageWeight: null,
                      cutoutLength: null,
                      cutoutWidth: null,
                      cutoutHeight: null,
                    },
                  ],
            );
            if (creating) {
              if (replacing != null) replaceLine(replacing, saved);
              else addLine(saved);
            }
            else {
              setForm((f) => ({
                ...f,
                lines: f.lines.map((line) =>
                  line.productId === saved.id
                    ? { ...line, name: saved.name }
                    : line,
                ),
              }));
            }
          }
          setCreating(false);
          setViewingId(null);
          onCatalogChange();
        }}
      />
    </Dialog>
  );
}

function ProductPicker({
  query,
  matches,
  onQuery,
  onPick,
  onCreate,
  onDismiss,
}: {
  query: string;
  matches: Array<{ id: string; code: string; name: string }>;
  onQuery: (query: string) => void;
  onPick: (product: { id: string; code: string; name: string }) => void;
  onCreate: () => void;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function down(e: PointerEvent) {
      if (root.current?.contains(e.target as Node)) return;
      onDismiss();
    }
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [onDismiss]);

  return (
    <div ref={root} className="relative min-w-0 px-3">
      <Input
        autoFocus
        className="h-7"
        placeholder="Search name or ID"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDismiss();
        }}
      />
      <div className="absolute top-full right-3 left-3 z-20 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover py-1 shadow-sm">
        {matches.slice(0, 8).map((p) => (
          <button
            key={p.id}
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-gray-50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(p)}
          >
            <span className="w-[52px] shrink-0 font-mono text-gray-500">
              {p.code}
            </span>
            <span className="min-w-0 truncate">{p.name}</span>
          </button>
        ))}
        {matches.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-gray-500">No match</div>
        )}
        <button
          type="button"
          className="flex w-full items-center gap-1.5 border-t border-border px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCreate}
        >
          <Plus className="size-3.5" /> Add product
        </button>
      </div>
    </div>
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

function splitSuppliers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* plain string */
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function SupplierPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = options.filter(
    (name) =>
      name.toLowerCase() !== q &&
      (!q || name.toLowerCase().includes(q)),
  );

  useEffect(() => {
    function down(e: PointerEvent) {
      if (root.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, []);

  return (
    <div ref={root} className="relative">
      <HugInput
        placeholder="Supplier"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(next) => {
          onChange(next);
          setOpen(true);
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 z-30 mt-1 max-h-48 min-w-48 overflow-auto rounded-md border border-border bg-popover py-1 shadow-sm">
          {matches.slice(0, 8).map((name) => (
            <button
              key={name}
              type="button"
              className="flex w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HugInput({
  value,
  onChange,
  placeholder,
  mono,
  onFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mono?: boolean;
  onFocus?: () => void;
}) {
  return (
    <input
      className={cn(
        "min-w-[3ch] bg-transparent text-md font-semibold text-gray-900 outline-none placeholder:text-gray-400",
        mono && "font-mono",
      )}
      style={{
        width: `${Math.max(value.length, placeholder.length, 3) + 1}ch`,
      }}
      value={value}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const PROGRESS_STEPS = ["PENDING", "IN_TRANSIT", "DELAYED", "COMPLETED"] as const;

function ImportProgress({
  status,
  className,
}: {
  status: ImportRow["status"];
  className?: string;
}) {
  const filled = PROGRESS_STEPS.indexOf(status) + 1;
  const on = status === "COMPLETED" ? "#147247" : "#171b21";
  const off = "#dfe3e8";
  const r = 2.5;
  const x0 = r;
  const x1 = 56 - r;
  const step = (x1 - x0) / 3;
  const railEnd = filled <= 1 ? x0 : x0 + step * (filled - 1);
  return (
    <svg
      className={className}
      width={56}
      height={10}
      viewBox="0 0 56 10"
      aria-label={statusLabel(status)}
    >
      <line x1={x0} y1={5} x2={x1} y2={5} stroke={off} strokeWidth="1.5" />
      <line x1={x0} y1={5} x2={railEnd} y2={5} stroke={on} strokeWidth="1.5" />
      {PROGRESS_STEPS.map((_, i) => (
        <circle
          key={i}
          cx={x0 + step * i}
          cy={5}
          r={r}
          fill={i < filled ? on : off}
        />
      ))}
    </svg>
  );
}
