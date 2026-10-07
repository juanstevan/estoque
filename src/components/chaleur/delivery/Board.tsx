"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, StageHeader, WhenLine } from "./parts";
import {
  MODE_COLOR,
  areaOf,
  columnOf,
  dayWord,
  deliveryUnits,
  nyDay,
  orderUnits,
  prepared,
  shortDay,
  todayDay,
  units,
  waitingForPayment,
  windowLabel,
  type Column,
  type Delivery,
  type Order,
  type Prefs,
} from "./model";

export type Card = { order: Order; delivery: Delivery | null };

/** What the date line of a card says, and whether it's a warning. */
export function cardWhen(order: Order, d: Delivery | null, prefs: Prefs | null): { text: string; tone?: "danger" | "warning" } {
  if (!d) {
    if (waitingForPayment(order, prefs)) return { text: "Waiting for payment", tone: "warning" };
    if (!order.invoiceDate) return { text: "Not invoiced" };
    const word = dayWord(nyDay(order.invoiceDate));
    return { text: `Invoiced ${word === "Today" || word === "Yesterday" ? word.toLowerCase() : word}` };
  }
  const day = nyDay(d.deliverBy);
  if (d.status === "DELAYED") return { text: day ? `Delayed · ${shortDay(day)}` : "Delayed", tone: "danger" };
  if (day && day < todayDay() && d.status !== "COMPLETED") return { text: `${shortDay(day)} · overdue`, tone: "danger" };
  if (!day) return { text: "Not scheduled" };
  const window = windowLabel(d.windowStart, d.windowEnd);
  return { text: `${dayWord(day)}${window ? ` · ${window}` : ""}` };
}

let ghost: HTMLElement | null = null;

function startDrag(el: HTMLElement, e: React.DragEvent, payload: string) {
  e.dataTransfer.setData("text/plain", payload);
  e.dataTransfer.effectAllowed = "move";
  const copy = el.cloneNode(true) as HTMLElement;
  copy.style.cssText = `position:absolute;top:-1000px;left:0;width:${el.offsetWidth}px;transform:rotate(4deg);box-shadow:0 8px 20px rgb(13 16 21 / 0.14);pointer-events:none`;
  document.body.appendChild(copy);
  e.dataTransfer.setDragImage(copy, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  ghost = copy;
}

function endDrag() {
  ghost?.remove();
  ghost = null;
}

export function BoardCard({
  card,
  prefs,
  canEdit,
  selected,
  onOpen,
  compact,
}: {
  card: Card;
  prefs: Prefs | null;
  canEdit: boolean;
  selected?: boolean;
  onOpen: () => void;
  compact?: boolean;
}) {
  const { order, delivery: d } = card;
  const column = d ? columnOf(d) : "NEW";
  const processing = column === "PROCESSING";
  const color = d ? MODE_COLOR[d.mode] : undefined;
  const many = order.deliveries.length > 1;
  const count = d ? deliveryUnits(d) : orderUnits(order);
  const prep = d && column === "PREPARING" ? prepared(d) : null;
  const when = cardWhen(order, d, prefs);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canEdit}
      aria-label={`${order.externalRef} ${order.customerName ?? ""}`}
      onDragStart={(e) => startDrag(e.currentTarget, e, d ? `delivery:${d.id}` : `order:${order.id}`)}
      onDragEnd={endDrag}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative flex w-full shrink-0 cursor-pointer flex-col gap-3 rounded-md bg-[#fcfcfc] p-3 outline-none transition-[box-shadow] duration-[80ms] focus-visible:ring-2 focus-visible:ring-ring",
        !processing && !selected && "hover:[box-shadow:inset_0_0_0_1px_var(--color-gray-400)]",
      )}
      // Selected: a thin black border. Processing cards otherwise keep their Delivery / Collect color.
      style={{ boxShadow: selected ? "inset 0 0 0 1px #000" : processing ? `inset 0 0 0 1.5px ${color}` : undefined }}
    >
      <div className={cn("flex min-w-0 items-end gap-1.5", processing && "pr-16")}>
        <span className="shrink-0 font-mono text-xs font-medium text-gray-500">
          {order.externalRef}
          {many && d ? ` · ${d.number} of ${order.deliveries.length}` : ""}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium text-gray-900">{order.customerName || "No customer"}</span>
      </div>
      {!compact && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-600">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{[areaOf(order), units(count)].filter(Boolean).join(" · ")}</span>
        </span>
      )}
      {prep && (
        <div className="h-1 w-32 overflow-hidden rounded-xs bg-gray-150" role="progressbar" aria-valuenow={prep.done} aria-valuemax={prep.all} aria-label="Prepared">
          <div className="h-1 rounded-xs bg-primary" style={{ width: `${prep.all ? (100 * prep.done) / prep.all : 0}%` }} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <WhenLine text={when.text} tone={when.tone} />
        <Avatar name={d?.assignee?.name} />
      </div>
      {processing && d && (
        <span
          className="absolute top-0 right-0 rounded-tr-md rounded-bl-md px-1.5 py-[3px] font-mono text-[10px] leading-none font-semibold text-white"
          style={{ background: color }}
        >
          {d.mode === "PICKUP" ? "COLLECT" : "DELIVERY"}
        </span>
      )}
    </div>
  );
}

const COLUMNS: Column[] = ["NEW", "PENDING", "PREPARING", "PROCESSING"];

export function Board({
  cards,
  prefs,
  canEdit,
  selectedId,
  onOpen,
  onDrop,
}: {
  cards: Card[];
  prefs: Prefs | null;
  canEdit: boolean;
  selectedId: string | null;
  onOpen: (card: Card) => void;
  onDrop: (payload: string, column: Column) => void;
}) {
  const [over, setOver] = useState<Column | null>(null);
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
      {COLUMNS.map((column) => {
        const list = cards.filter((card) => (card.delivery ? columnOf(card.delivery) : "NEW") === column);
        return (
          <section
            key={column}
            aria-label={column}
            className={cn("flex w-[264px] shrink-0 flex-col gap-1.5 rounded-xl p-1.5 transition-colors", over === column && "bg-gray-50")}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setOver(column);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              endDrag();
              const payload = e.dataTransfer.getData("text/plain");
              if (payload) onDrop(payload, column);
            }}
          >
            <StageHeader column={column} count={list.length} />
            <div className="flex min-h-20 flex-1 flex-col gap-3 overflow-y-auto rounded-md bg-surface p-1.5">
              {list.map((card) => (
                <BoardCard
                  key={card.delivery?.id ?? card.order.id}
                  card={card}
                  prefs={prefs}
                  canEdit={canEdit}
                  selected={selectedId === card.order.id}
                  onOpen={() => onOpen(card)}
                />
              ))}
              {!list.length && (
                <p className="px-2 py-6 text-center text-xs text-gray-400">
                  {column === "NEW" ? "New QuickBooks invoices land here" : "Nothing here"}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
