"use client";

import { useState } from "react";
import { CircleCheck, Store, Truck } from "lucide-react";
import { DataGrid, type GridCol } from "@/components/chaleur/DataGrid";
import { cn } from "@/lib/utils";
import { Avatar, StatusChip, TextTabs } from "./parts";
import {
  MODE_LABEL,
  areaOf,
  dayWord,
  isPaid,
  money,
  monthDay,
  nyDay,
  orderChip,
  orderUnits,
  shortName,
  stamp,
  todayDay,
  windowLabel,
  type Delivery,
  type Order,
} from "./model";

type ListTab = "all" | "new" | "progress" | "completed" | "voided";

function bucket(order: Order): Exclude<ListTab, "all"> {
  if (order.voided) return "voided";
  if (order.status === "COMPLETED" && (!order.deliveries.length || order.deliveries.every((d) => d.status === "COMPLETED"))) return "completed";
  if (!order.deliveries.length) return "new";
  return "progress";
}

/** The delivery the row talks about: the next open one, else the last. */
export function leadDelivery(order: Order): Delivery | null {
  return order.deliveries.find((d) => d.status !== "COMPLETED") ?? order.deliveries.at(-1) ?? null;
}

export function scheduledText(d: Delivery | null) {
  if (!d) return null;
  if (d.status === "COMPLETED" && d.completedAt) return stamp(d.completedAt);
  const day = nyDay(d.deliverBy);
  if (!day) return null;
  const window = windowLabel(d.windowStart, d.windowEnd);
  const late = day < todayDay() && d.status !== "COMPLETED";
  return { text: `${dayWord(day)}${window ? ` · ${window}` : ""}${late ? " · overdue" : ""}`, late };
}

export function ModeCell({ d }: { d: Delivery | null }) {
  const mode = d?.mode ?? "DELIVERY";
  const Icon = mode === "PICKUP" ? Store : Truck;
  return (
    <span className="flex items-center gap-2 text-gray-900">
      <Icon className="size-4 text-gray-500" />
      {MODE_LABEL[mode]}
    </span>
  );
}

/** A faint green, just enough to spot paid invoices. */
export const PAID_ROW = "bg-[#f1f9f4]/50";

export function PaidCell({ order }: { order: Order }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono", order.amountPaid || isPaid(order) ? "text-gray-900" : "text-gray-400")}>
      {isPaid(order) && <CircleCheck className="size-3.5 text-success-text" aria-label="Paid" />}
      {money(isPaid(order) ? order.totalAmount : order.amountPaid)}
    </span>
  );
}

/** Shared people and money columns for the invoice tables; `pick` says which delivery a row shows. */
export function invoiceColumns<T extends Order>(pick: (row: T) => Delivery | null = leadDelivery): GridCol<T>[] {
  return [
    {
      key: "assignee",
      label: "Assignee",
      width: "150px",
      filterValue: (o) => pick(o)?.assignee?.name ?? "Unassigned",
      render: (o) => {
        const name = pick(o)?.assignee?.name;
        return (
          <span className={cn("flex items-center gap-2", !name && "text-gray-500")}>
            <Avatar name={name} />
            {name ? shortName(name) : "Unassigned"}
          </span>
        );
      },
    },
    { key: "items", label: "Items", numeric: true, width: "84px", sortValue: (o) => orderUnits(o), render: (o) => orderUnits(o) },
    { key: "taxAmount", label: "Tax", numeric: true, width: "100px", render: (o) => <span className="font-mono">{money(o.taxAmount)}</span> },
    { key: "totalAmount", label: "Total", numeric: true, width: "120px", render: (o) => <span className="font-mono">{money(o.totalAmount)}</span> },
    { key: "amountPaid", label: "Amount paid", numeric: true, width: "140px", render: (o) => <PaidCell order={o} /> },
  ];
}

export function ListView({
  orders,
  selectedId,
  onOpen,
}: {
  orders: Order[];
  selectedId: string | null;
  onOpen: (order: Order) => void;
}) {
  const [tab, setTab] = useState<ListTab>("all");
  const counts = { all: orders.length, new: 0, progress: 0, completed: 0, voided: 0 };
  for (const order of orders) counts[bucket(order)]++;
  const rows = tab === "all" ? orders : orders.filter((o) => bucket(o) === tab);
  const label = (text: string, n: number) => (
    <>
      {text} <span className="text-xs font-normal text-gray-500 tabular-nums">{n}</span>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="border-b border-border">
        <TextTabs
          value={tab}
          onChange={setTab}
          options={[
            { id: "all", label: label("All", counts.all) },
            { id: "new", label: label("New", counts.new) },
            { id: "progress", label: label("In progress", counts.progress) },
            { id: "completed", label: label("Completed", counts.completed) },
            { id: "voided", label: label("Voided", counts.voided) },
          ]}
        />
      </div>
      <DataGrid
        rows={rows}
        getRowId={(o) => o.id}
        selectedId={selectedId}
        onRowClick={onOpen}
        rowClassName={(o) => (isPaid(o) && !o.voided ? PAID_ROW : o.voided ? "text-gray-400" : undefined)}
        empty="No invoices here"
        emptyHint="QuickBooks invoices from October 1 show up here."
        columns={[
          { key: "externalRef", label: "Invoice", mono: true, width: "110px" },
          {
            key: "invoiceDate",
            label: "Date",
            width: "88px",
            sortValue: (o) => o.invoiceDate ?? "",
            render: (o) => (o.invoiceDate ? monthDay(nyDay(o.invoiceDate)) : <span className="text-gray-400">—</span>),
          },
          {
            key: "customerName",
            label: "Customer",
            render: (o) => <span className="font-medium text-gray-900">{o.customerName || "—"}</span>,
          },
          { key: "area", label: "Area", width: "130px", filterValue: (o) => areaOf(o), render: (o) => <span className="text-gray-600">{areaOf(o) || "—"}</span> },
          { key: "mode", label: "Processing", width: "120px", filterValue: (o) => MODE_LABEL[leadDelivery(o)?.mode ?? "DELIVERY"], render: (o) => <ModeCell d={leadDelivery(o)} /> },
          {
            key: "scheduled",
            label: "Scheduled",
            width: "160px",
            sortValue: (o) => leadDelivery(o)?.deliverBy ?? "",
            render: (o) => {
              const when = scheduledText(leadDelivery(o));
              if (!when) return <span className="text-gray-500">{o.voided ? "—" : "Not scheduled"}</span>;
              return typeof when === "string" ? when : <span className={cn(when.late && "text-danger-text")}>{when.text}</span>;
            },
          },
          { key: "status", label: "Status", width: "150px", filterValue: (o) => orderChip(o).label, render: (o) => <StatusChip chip={orderChip(o)} /> },
          ...invoiceColumns(),
        ]}
      />
    </div>
  );
}
