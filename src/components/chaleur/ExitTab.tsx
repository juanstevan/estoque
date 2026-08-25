"use client";

import { useEffect, useState } from "react";
import { ChevronUp, Copy, Info, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { StatusBadge, statusLabel } from "@/components/chaleur/StatusBadge";
import { formatDayMonth, formatMoney, YEAR_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ExitRow = {
  id: string;
  externalRef: string;
  customerName: string | null;
  seller: string | null;
  assignedTo: string | null;
  address: string | null;
  deliverBy: string | null;
  status:
    | "PENDING"
    | "PREPARING"
    | "IN_TRANSIT"
    | "TO_DELIVER"
    | "DELAYED"
    | "COMPLETED";
  onKanban: boolean;
  notes: string | null;
  photos: string | null;
  totalAmount: number;
};

const COLS = [
  "PENDING",
  "PREPARING",
  "IN_TRANSIT",
  "TO_DELIVER",
  "DELAYED",
] as const;

export function ExitTab({
  exits,
  onReload,
}: {
  exits: ExitRow[];
  onReload: () => void;
}) {
  const [selected, setSelected] = useState<ExitRow | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  async function setStatus(id: string, status: ExitRow["status"]) {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", id, status }),
    });
    onReload();
  }

  async function toKanban(id: string) {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kanban", id }),
    });
    onReload();
  }

  const board = exits.filter((e) => e.onKanban && e.status !== "COMPLETED");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
        {COLS.map((col) => {
          const cards = board.filter((e) => e.status === col);
          return (
            <div
              key={col}
              className="flex min-w-56 flex-1 flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                const row = exits.find((x) => x.id === id);
                if (!row) return;
                if (!row.onKanban) void toKanban(id);
                else void setStatus(id, col);
              }}
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
                  cards.map((ex) => (
                    <ExitCard
                      key={ex.id}
                      ex={ex}
                      onOpen={() => setSelected(ex)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
        <button
          type="button"
          className="flex h-10 w-full items-center justify-center gap-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          onClick={() => setTableOpen((v) => !v)}
        >
          <ChevronUp
            className={cn(
              "size-4 transition-transform duration-[120ms]",
              tableOpen && "rotate-180",
            )}
          />
          All invoices
        </button>
        {tableOpen && (
          <div className="flex h-72 flex-col gap-2 border-t border-border p-3">
            <DataGrid
              rows={exits}
              getRowId={(e) => e.id}
              draggable
              onRowClick={(e) => setSelected(e)}
              selectedId={selected?.id}
              empty="No invoices yet"
              emptyHint="Invoices are created in the billing system and appear here automatically."
              columns={[
                {
                  key: "deliverBy",
                  label: "Date",
                  width: "88px",
                  render: (e) =>
                    e.deliverBy ? (
                      formatDayMonth(e.deliverBy)
                    ) : (
                      <span className="text-gray-400">—</span>
                    ),
                },
                {
                  key: "externalRef",
                  label: "Invoice",
                  mono: true,
                  width: "112px",
                },
                {
                  key: "customerName",
                  label: "Client",
                  render: (e) =>
                    e.customerName ?? <span className="text-gray-400">—</span>,
                },
                {
                  key: "seller",
                  label: "Seller",
                  render: (e) =>
                    e.seller ?? <span className="text-gray-400">—</span>,
                },
                {
                  key: "status",
                  label: "Status",
                  width: "128px",
                  filterValue: (e) => statusLabel(e.status),
                  render: (e) => <StatusBadge status={e.status} />,
                },
                {
                  key: "totalAmount",
                  label: "Total",
                  numeric: true,
                  width: "112px",
                  render: (e) => formatMoney(e.totalAmount),
                },
              ]}
            />
            <p className="text-xs text-gray-500">
              Drag a row onto Pending to place it on the board.
            </p>
          </div>
        )}
      </div>

      <ExitDrawer
        exit={selected}
        onClose={() => setSelected(null)}
        onSaved={onReload}
      />
    </div>
  );
}

function ExitCard({ ex, onOpen }: { ex: ExitRow; onOpen: () => void }) {
  const year = ex.deliverBy
    ? new Date(ex.deliverBy).getFullYear().toString()
    : "";
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", ex.id)}
      className="cursor-pointer rounded-lg border border-border bg-surface p-3 transition-colors duration-[80ms] hover:border-gray-300"
      onClick={onOpen}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-xs whitespace-nowrap text-gray-600">
          {ex.externalRef}
        </span>
        <span className="truncate text-sm font-medium text-gray-900">
          {ex.customerName ?? "No client"}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-600 tabular-nums">
        {ex.deliverBy ? (
          <>
            {formatDayMonth(ex.deliverBy)}
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
      </div>

      <div className="mt-0.5 text-xs text-gray-500">
        {ex.assignedTo ?? "Unassigned"}
      </div>

      {(ex.address || ex.notes) && (
        <Popover>
          <PopoverTrigger
            className="mt-2 flex items-center gap-1 rounded-sm text-xs text-gray-500 outline-none hover:text-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="size-3.5" />
            Details
          </PopoverTrigger>
          <PopoverContent
            className="w-72 gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm text-gray-900">
                {ex.address || "No address"}
              </span>
              {ex.address && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Copy address"
                        onClick={() =>
                          navigator.clipboard.writeText(ex.address || "")
                        }
                      />
                    }
                  >
                    <Copy />
                  </TooltipTrigger>
                  <TooltipContent>Copy address</TooltipContent>
                </Tooltip>
              )}
            </div>
            {ex.notes && <p className="text-xs text-gray-600">{ex.notes}</p>}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function ExitDrawer({
  exit,
  onClose,
  onSaved,
}: {
  exit: ExitRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(exit);
  useEffect(() => {
    setForm(exit);
  }, [exit]);

  async function save() {
    if (!form) return;
    await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: form.id,
        customerName: form.customerName,
        assignedTo: form.assignedTo,
        address: form.address,
        deliverBy: form.deliverBy,
        notes: form.notes,
      }),
    });
    onSaved();
    onClose();
  }

  return (
    <Sheet open={Boolean(exit)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-panel">
        {form && (
          <>
            <SheetHeader className="h-14 shrink-0 justify-center border-b border-border px-6">
              <SheetTitle className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-600">
                  {form.externalRef}
                </span>
                <StatusBadge status={form.status} />
              </SheetTitle>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-6">
              <div className="grid gap-1">
                <Label htmlFor="exit-client">Client</Label>
                <Input
                  id="exit-client"
                  value={form.customerName ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, customerName: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="exit-assigned">Assigned to</Label>
                <Input
                  id="exit-assigned"
                  value={form.assignedTo ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, assignedTo: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>Status</Label>
                <div className="flex h-control-md items-center">
                  <StatusBadge status={form.status} />
                </div>
                <p className="text-xs text-gray-500">
                  Drag the card to another column to change status.
                </p>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="exit-address">Address</Label>
                <Input
                  id="exit-address"
                  value={form.address ?? ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="exit-date">Deliver by</Label>
                <Input
                  id="exit-date"
                  type="date"
                  className="w-50"
                  value={form.deliverBy?.slice(0, 10) ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, deliverBy: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-1 border-t border-gray-150 pt-5">
                <Label>Photos</Label>
                <button
                  type="button"
                  className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
                >
                  <Upload className="size-4" />
                  Drop files, or click to browse
                </button>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="exit-notes">Notes</Label>
                <Textarea
                  id="exit-notes"
                  value={form.notes ?? ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-t border-border px-6">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void save()}>Save changes</Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
