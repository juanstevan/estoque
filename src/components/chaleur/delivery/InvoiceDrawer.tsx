"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { cn } from "@/lib/utils";
import { StatusChip } from "./parts";
import { leadDelivery } from "./ListView";
import { monthDay, nyDay, orderChip, type Order } from "./model";

/**
 * Every invoice in a side table, like All imports on the Imports board. Completed ones live
 * here (the board has no Completed column). Rows drag onto a board column or a calendar day.
 */
const DRAWER_WIDTH = 640;

export function InvoiceDrawer({
  open,
  orders,
  selectedId,
  flush,
  onOpenChange,
  onOpen,
}: {
  open: boolean;
  orders: Order[];
  selectedId: string | null;
  /** Reaches the window edge (no order panel beside it). */
  flush: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: (order: Order) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = orders.filter((o) => !q || `${o.externalRef} ${o.customerName ?? ""}`.toLowerCase().includes(q));
  return (
    <div className={cn("absolute top-0 right-0 bottom-0 z-30 flex items-stretch", flush && "-mr-6")}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="z-10 my-auto flex h-[100px] w-6 shrink-0 items-center justify-center rounded-l-[24px] border-1 border-r-0 border-border bg-white"
              onClick={() => onOpenChange(!open)}
              aria-label={open ? "Hide all invoices" : "Show all invoices"}
            />
          }
        >
          {open ? <ChevronRight /> : <ChevronLeft />}
        </TooltipTrigger>
        <TooltipContent>{open ? "Hide all invoices" : "Show all invoices"}</TooltipContent>
      </Tooltip>
      <div className="min-w-0 overflow-hidden rounded-l-[14px] bg-white transition-[width] duration-300 ease-in-out" style={{ width: open ? DRAWER_WIDTH : 0 }} aria-hidden={!open}>
        <div className="flex h-full min-h-0 flex-col gap-4 rounded-[inherit] border-1 border-r-0 border-border bg-white p-1.5" style={{ width: DRAWER_WIDTH }}>
          <div className="flex h-8 items-center px-3 text-sm font-medium text-gray-900">All invoices</div>
          <div className="relative mx-1.5">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-gray-400" />
            <Input className="h-control-sm pl-8" placeholder="Search invoice or customer" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <p className="px-3 text-xs text-gray-500">Drag a new invoice onto Pending, or any invoice onto a calendar day.</p>
          <DataGrid
            rows={rows}
            getRowId={(o) => `order:${o.id}`}
            selectedId={selectedId ? `order:${selectedId}` : null}
            draggable
            onRowClick={onOpen}
            empty="No invoices"
            columns={[
              { key: "externalRef", label: "Invoice", mono: true, width: "104px" },
              { key: "customerName", label: "Customer", render: (o) => <span className="font-medium text-gray-900">{o.customerName || "—"}</span> },
              { key: "status", label: "Status", width: "150px", filterValue: (o) => orderChip(o).label, render: (o) => <StatusChip chip={orderChip(o)} /> },
              {
                key: "scheduled",
                label: "Scheduled",
                width: "120px",
                sortValue: (o) => leadDelivery(o)?.deliverBy ?? "",
                render: (o) => {
                  const day = nyDay(leadDelivery(o)?.deliverBy);
                  return day ? monthDay(day) : <span className="text-gray-500">Not scheduled</span>;
                },
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
