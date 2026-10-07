"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { cn } from "@/lib/utils";
import { StatusChip } from "./parts";
import { ModeCell, PAID_ROW, invoiceColumns } from "./ListView";
import {
  addDays,
  areaOf,
  dayDate,
  deliveryChip,
  longDay,
  mediumDay,
  monthDay,
  nyDay,
  timeOf,
  todayDay,
  weekStart,
  windowLabel,
  type Delivery,
  type Order,
} from "./model";

export type CalendarMode = "month" | "day";

type Entry = { order: Order; delivery: Delivery };

const MAX_IN_CELL = 3;

function entriesByDay(orders: Order[]) {
  const map = new Map<string, Entry[]>();
  for (const order of orders) {
    if (order.voided) continue;
    for (const delivery of order.deliveries) {
      const day = nyDay(delivery.deliverBy);
      if (!day) continue;
      map.set(day, [...(map.get(day) ?? []), { order, delivery }]);
    }
  }
  for (const list of map.values()) list.sort((a, b) => (a.delivery.windowStart ?? "99").localeCompare(b.delivery.windowStart ?? "99"));
  return map;
}

function label(entry: Entry) {
  const many = entry.order.deliveries.length > 1;
  return `${entry.order.externalRef}${many ? ` · ${entry.delivery.number}/${entry.order.deliveries.length}` : ""} · ${entry.order.customerName ?? "No customer"}`;
}

export function monthTitle(anchor: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(dayDate(anchor));
}

export function CalendarView({
  orders,
  mode,
  anchor,
  canEdit,
  selectedId,
  onAnchor,
  onMode,
  onOpen,
  onDropDay,
}: {
  /** Matching the search. */
  orders: Order[];
  mode: CalendarMode;
  anchor: string;
  canEdit: boolean;
  selectedId: string | null;
  onAnchor: (day: string) => void;
  onMode: (mode: CalendarMode) => void;
  onOpen: (order: Order) => void;
  onDropDay: (payload: string, day: string) => void;
}) {
  const byDay = useMemo(() => entriesByDay(orders), [orders]);
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {mode === "month" ? (
          <Month
            anchor={anchor}
            byDay={byDay}
            canEdit={canEdit}
            onOpen={onOpen}
            onDropDay={onDropDay}
            onShowDay={(day) => {
              onAnchor(day);
              onMode("day");
            }}
          />
        ) : (
          <Day anchor={anchor} entries={byDay.get(anchor) ?? []} selectedId={selectedId} onAnchor={onAnchor} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
}

function Month({
  anchor,
  byDay,
  canEdit,
  onOpen,
  onDropDay,
  onShowDay,
}: {
  anchor: string;
  byDay: Map<string, Entry[]>;
  canEdit: boolean;
  onOpen: (order: Order) => void;
  onDropDay: (payload: string, day: string) => void;
  onShowDay: (day: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const month = anchor.slice(0, 7);
  const start = weekStart(`${month}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days.at(35)!.slice(0, 7) === month ? 6 : 5;
  const today = todayDay();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
      <div className="grid shrink-0 grid-cols-7 border-b border-border bg-gray-50">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2.5 py-2 text-xs text-gray-600">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.slice(0, weeks * 7).map((day, i) => {
          const entries = byDay.get(day) ?? [];
          const inMonth = day.startsWith(month);
          return (
            <div
              key={day}
              className={cn(
                "flex min-h-0 flex-col gap-1 overflow-hidden border-gray-150 p-1.5",
                i % 7 !== 6 && "border-r",
                i < (weeks - 1) * 7 && "border-b",
                !inMonth && "bg-gray-50",
                over === day && "bg-blue-50 outline-1 outline-blue-500 outline-dashed -outline-offset-1",
              )}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setOver(day);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const payload = e.dataTransfer.getData("text/plain");
                if (payload) onDropDay(payload, day);
              }}
            >
              <button
                type="button"
                onClick={() => onShowDay(day)}
                aria-label={`Open ${longDay(day)}`}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                  day === today ? "bg-primary font-medium text-white" : inMonth ? "text-gray-700 hover:bg-gray-100" : "text-gray-400",
                )}
              >
                {Number(day.slice(8))}
              </button>
              {entries.slice(0, MAX_IN_CELL).map((entry) => {
                const chip = deliveryChip(entry.delivery);
                return (
                  <button
                    key={entry.delivery.id}
                    type="button"
                    draggable={canEdit && entry.delivery.status !== "COMPLETED"}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", `delivery:${entry.delivery.id}`);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onOpen(entry.order)}
                    className={cn(
                      "flex min-w-0 shrink-0 items-center gap-2 rounded-md border border-gray-150 bg-surface px-2 py-1 text-left hover:border-gray-300",
                      entry.delivery.status === "COMPLETED" && "opacity-70",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-900">{label(entry)}</span>
                    <StatusChip chip={chip} className="hidden xl:inline-flex" />
                  </button>
                );
              })}
              {entries.length > MAX_IN_CELL && (
                <button type="button" className="w-fit px-1 text-xs text-gray-600 hover:text-gray-900" onClick={() => onShowDay(day)}>
                  +{entries.length - MAX_IN_CELL} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Day({
  anchor,
  entries,
  selectedId,
  onAnchor,
  onOpen,
}: {
  anchor: string;
  entries: Entry[];
  selectedId: string | null;
  onAnchor: (day: string) => void;
  onOpen: (order: Order) => void;
}) {
  const rows = entries.map((entry) => ({ ...entry.order, entry }));
  const collections = entries.filter((e) => e.delivery.mode === "PICKUP").length;
  const done = entries.filter((e) => e.delivery.status === "COMPLETED").length;
  const today = todayDay();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{longDay(anchor)}</h2>
        <p className="text-sm text-gray-600">
          {[
            anchor === today ? "Today" : null,
            `${entries.length} ${entries.length === 1 ? "invoice" : "invoices"}`,
            collections ? `${collections} ${collections === 1 ? "collection" : "collections"}` : null,
            done ? `${done} completed` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <DataGrid
        rows={rows}
        getRowId={(o) => o.entry.delivery.id}
        selectedId={rows.find((o) => o.id === selectedId)?.entry.delivery.id ?? null}
        onRowClick={(o) => onOpen(o)}
        rowClassName={(o) => (o.paymentStatus === "Paid" ? PAID_ROW : undefined)}
        empty="Nothing scheduled this day"
        emptyHint="Drag invoices onto a day in the month view, or set the date inside the order."
        columns={[
          {
            key: "externalRef",
            label: "Invoice",
            mono: true,
            width: "110px",
            render: (o) => `${o.externalRef}${o.deliveries.length > 1 ? ` · ${o.entry.delivery.number}/${o.deliveries.length}` : ""}`,
          },
          { key: "invoiceDate", label: "Date", width: "88px", render: (o) => (o.invoiceDate ? monthDay(nyDay(o.invoiceDate)) : "—") },
          { key: "customerName", label: "Customer", render: (o) => <span className="font-medium text-gray-900">{o.customerName || "—"}</span> },
          { key: "area", label: "Area", width: "130px", filterValue: (o) => areaOf(o), render: (o) => <span className="text-gray-600">{areaOf(o) || "—"}</span> },
          { key: "mode", label: "Processing", width: "120px", render: (o) => <ModeCell d={o.entry.delivery} /> },
          {
            key: "time",
            label: "Time",
            width: "130px",
            render: (o) =>
              o.entry.delivery.completedAt
                ? `Done ${timeOf(o.entry.delivery.completedAt)}`
                : windowLabel(o.entry.delivery.windowStart, o.entry.delivery.windowEnd) || <span className="text-gray-400">Any time</span>,
          },
          { key: "status", label: "Status", width: "150px", render: (o) => <StatusChip chip={deliveryChip(o.entry.delivery)} /> },
          ...invoiceColumns<Order & { entry: Entry }>((o) => o.entry.delivery),
        ]}
      />
      <div className="flex shrink-0 items-center justify-between text-xs text-gray-600">
        <span>{entries.length ? `1–${entries.length} of ${entries.length}` : "0 invoices"}</span>
        <span className="flex items-center gap-1">
          <span>{mediumDay(addDays(anchor, -1))}</span>
          <Button size="icon-sm" variant="ghost" aria-label="Previous day" onClick={() => onAnchor(addDays(anchor, -1))}>
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next day" onClick={() => onAnchor(addDays(anchor, 1))}>
            <ChevronRight />
          </Button>
          <span>{mediumDay(addDays(anchor, 1))}</span>
        </span>
      </div>
    </div>
  );
}
