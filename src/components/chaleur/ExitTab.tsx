"use client";

import { useEffect, useState } from "react";
import { ChevronUp, Copy, Info } from "lucide-react";
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
import { DataGrid } from "@/components/chaleur/DataGrid";
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
  status: "PENDING" | "PREPARING" | "IN_TRANSIT" | "TO_DELIVER" | "DELAYED" | "COMPLETED";
  onKanban: boolean;
  notes: string | null;
  photos: string | null;
  totalAmount: number;
};

const COLS = ["PENDING", "PREPARING", "IN_TRANSIT", "TO_DELIVER", "DELAYED"] as const;

export function ExitTab({ exits, onReload }: { exits: ExitRow[]; onReload: () => void }) {
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
    <div className="flex h-full flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-2">
        {COLS.map((col) => (
          <div
            key={col}
            className="flex flex-col rounded-xl bg-muted/40 p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/plain");
              const row = exits.find((x) => x.id === id);
              if (!row) return;
              if (!row.onKanban) void toKanban(id);
              else void setStatus(id, col);
            }}
          >
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {col.replace("_", " ")}
            </div>
            <div className="flex flex-col gap-2 overflow-auto">
              {board
                .filter((e) => e.status === col)
                .map((ex) => (
                  <ExitCard key={ex.id} ex={ex} onOpen={() => setSelected(ex)} />
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
          onClick={() => setTableOpen((v) => !v)}
        >
          <ChevronUp className={cn("size-4 transition", tableOpen && "rotate-180")} />
          Invoices
        </button>
        {tableOpen && (
          <div className="max-h-64 overflow-auto p-2">
            <DataGrid
              rows={exits}
              getRowId={(e) => e.id}
              draggable
              onRowClick={(e) => setSelected(e)}
              columns={[
                {
                  key: "deliverBy",
                  label: "Date",
                  render: (e) => (e.deliverBy ? formatDayMonth(e.deliverBy) : "—"),
                },
                { key: "externalRef", label: "Invoice" },
                { key: "customerName", label: "Client" },
                { key: "seller", label: "Seller" },
                { key: "status", label: "Status" },
                { key: "totalAmount", label: "Total", numeric: true, render: (e) => formatMoney(e.totalAmount) },
              ]}
            />
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Drag a row onto Pending to place it on the board. Invoices cannot be created here.
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
  const year = ex.deliverBy ? new Date(ex.deliverBy).getFullYear().toString() : "";
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", ex.id)}
      className="cursor-pointer rounded-lg bg-card p-2.5 shadow-sm"
      onClick={onOpen}
    >
      <div className="truncate text-sm font-medium">
        {ex.externalRef} {ex.customerName}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {ex.deliverBy ? formatDayMonth(ex.deliverBy) : "—"}
        <span className="inline-block size-2 rounded-full" style={{ background: YEAR_COLORS[year] ?? "#94a3b8" }} />
      </div>
      <div className="text-xs text-muted-foreground">{ex.assignedTo}</div>
      <Popover>
        <PopoverTrigger
          className="mt-1 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent className="w-64 text-sm" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-2">
            <span>{ex.address || "No address"}</span>
            {ex.address && (
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(ex.address || "")}
              >
                <Copy />
              </Button>
            )}
          </div>
          {ex.notes && <p className="mt-2 text-muted-foreground">{ex.notes}</p>}
        </PopoverContent>
      </Popover>
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
      <SheetContent side="right" className="w-full sm:max-w-md">
        {form && (
          <div className="flex h-full flex-col gap-4 overflow-auto">
            <SheetHeader>
              <SheetTitle>
                <Input
                  className="h-8 font-semibold"
                  value={form.externalRef}
                  disabled
                />
              </SheetTitle>
            </SheetHeader>
            <div>
              <Label>Client</Label>
              <Input
                value={form.customerName ?? ""}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </div>
            <div className="grid gap-3">
              <div>
                <Label>Assigned</Label>
                <Input
                  value={form.assignedTo ?? ""}
                  onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input value={form.status.replace("_", " ")} disabled />
                <p className="mt-1 text-xs text-muted-foreground">Change status by dragging the card.</p>
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div>
                <Label>Deliver by</Label>
                <Input
                  type="date"
                  value={form.deliverBy?.slice(0, 10) ?? ""}
                  onChange={(e) => setForm({ ...form, deliverBy: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Photos</Label>
              <div className="mt-1 flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Drop or click to import
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1"
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="mt-auto flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => void save()}>Save</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
