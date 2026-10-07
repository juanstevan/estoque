"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Board, type Card } from "./Board";
import { CalendarView, monthTitle, type CalendarMode } from "./CalendarView";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { ListView } from "./ListView";
import { OrderPanel } from "./OrderPanel";
import { ProcessingTypeDialog } from "./Dialogs";
import { TextTabs, ViewSwitch, type View } from "./parts";
import {
  addDays,
  columnOf,
  isPaid,
  mediumDay,
  nyDay,
  post,
  todayDay,
  weekLabel,
  weekStart,
  type Column,
  type Delivery,
  type Detail,
  type Meta,
  type Order,
  type Prefs,
} from "./model";

const VIEW_KEY = "delivery.view";

function savedView(): View {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return value === "list" || value === "calendar" ? value : "board";
  } catch {
    return "board";
  }
}

function matches(order: Order, q: string) {
  if (!q) return true;
  return [order.externalRef, order.customerName, order.address, ...order.lines.flatMap((l) => [l.product.name, l.product.sku, l.product.code])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function DeliveryTab({ canEdit, prefs: shellPrefs, refreshKey }: { canEdit: boolean; prefs: Prefs | null; refreshKey: number }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<{ mode: "week" | "day"; anchor: string }>(() => ({ mode: "week", anchor: todayDay() }));
  const [calendar, setCalendar] = useState<{ mode: CalendarMode; anchor: string }>(() => ({ mode: "month", anchor: todayDay() }));
  const [drawer, setDrawer] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [choose, setChoose] = useState<{ order: Order; delivery: Delivery } | null>(null);
  const [notice, setNotice] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [syncProblem, setSyncProblem] = useState<string | null>(null);
  const prefs = meta?.prefs ?? shellPrefs;

  useEffect(() => setView(savedView()), []);

  const load = useCallback(async () => {
    try {
      const [list, info] = await Promise.all([
        fetch("/api/orders").then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body.error || "Couldn't load invoices");
          return body as Order[];
        }),
        fetch("/api/orders?view=meta").then((r) => (r.ok ? r.json() : null)),
      ]);
      setOrders(list);
      if (info) setMeta(info);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load invoices");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Others work on the board too.
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 45_000);
    return () => clearInterval(timer);
  }, [load]);

  function flash(text: string) {
    setNotice(text);
    setTimeout(() => setNotice((current) => (current === text ? "" : current)), 4000);
  }

  function changed(detail: Detail) {
    setOrders((list) => (list ? list.map((o) => (o.id === detail.id ? detail : o)) : list));
  }

  async function act(body: object) {
    try {
      changed(await post(body));
    } catch (e) {
      flash(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  function pickView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  }

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => (orders ?? []).filter((o) => matches(o, q)), [orders, q]);
  const today = todayDay();
  const span =
    range.mode === "week"
      ? { from: weekStart(range.anchor), to: addDays(weekStart(range.anchor), 6) }
      : { from: range.anchor, to: range.anchor };

  const cards = useMemo<Card[]>(() => {
    const list: Card[] = [];
    for (const order of visible) {
      if (order.voided) continue;
      if (!order.deliveries.length) {
        if (order.status !== "COMPLETED") list.push({ order, delivery: null });
        continue;
      }
      for (const delivery of order.deliveries) {
        if (delivery.status === "COMPLETED") continue;
        const day = nyDay(delivery.deliverBy);
        // Unscheduled and late ones always show; the rest by the chosen week or day.
        if (day && day >= today && (day < span.from || day > span.to)) continue;
        list.push({ order, delivery });
      }
    }
    return list.sort((a, b) => {
      const da = nyDay(a.delivery?.deliverBy) || "9999";
      const db = nyDay(b.delivery?.deliverBy) || "9999";
      if (!a.delivery && !b.delivery) return (b.order.invoiceDate ?? "").localeCompare(a.order.invoiceDate ?? "");
      return da.localeCompare(db) || (a.delivery?.windowStart ?? "").localeCompare(b.delivery?.windowStart ?? "") || a.order.externalRef.localeCompare(b.order.externalRef);
    });
  }, [visible, today, span.from, span.to]);

  function findDelivery(id: string) {
    for (const order of orders ?? []) {
      const delivery = order.deliveries.find((d) => d.id === id);
      if (delivery) return { order, delivery };
    }
    return null;
  }

  function onBoardDrop(payload: string, column: Column) {
    const [kind, id] = payload.split(":");
    if (kind === "order") {
      if (column === "NEW") return;
      if (column !== "PENDING") return flash("New invoices go to Pending first.");
      return void act({ action: "add", orderId: id });
    }
    const hit = id ? findDelivery(id) : null;
    if (!hit) return;
    const from = columnOf(hit.delivery);
    if (from === column) return;
    if (column === "NEW") return flash("Use Back to New in the order’s menu.");
    if (column === "PROCESSING") return setChoose(hit);
    void act({ action: "move", deliveryId: hit.delivery.id, status: column });
  }

  function onCalendarDrop(payload: string, day: string) {
    const [kind, id] = payload.split(":");
    const hit =
      kind === "delivery" && id
        ? findDelivery(id)
        : (() => {
            const order = (orders ?? []).find((o) => o.id === id);
            const delivery = order?.deliveries.find((d) => d.status !== "COMPLETED");
            if (order && !delivery) flash(order.deliveries.length ? "This invoice is already completed." : "Add it to the workflow first.");
            return order && delivery ? { order, delivery } : null;
          })();
    if (!hit || nyDay(hit.delivery.deliverBy) === day) return;
    if (hit.delivery.status === "COMPLETED") return flash("Completed deliveries keep their date.");
    void act({
      action: "schedule",
      deliveryId: hit.delivery.id,
      date: day,
      windowStart: hit.delivery.windowStart,
      windowEnd: hit.delivery.windowEnd,
    });
  }

  async function syncNow() {
    setSyncing(true);
    let ok = true;
    try {
      await post({ action: "sync" });
      setSyncProblem(null);
    } catch (e) {
      ok = false;
      setSyncProblem(e instanceof Error ? e.message : "Sync failed");
    }
    await load();
    setSyncing(false);
    if (ok) {
      // "Synced" shows for 2 seconds after a click, then fades; a failure stays red.
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2000);
    }
  }

  const searchBox = (
    <div className="relative w-72 shrink-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
      <Input className="pl-9" placeholder="Search invoice, customer or product" aria-label="Search invoices" value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
  );

  const syncError = syncProblem ?? meta?.syncError ?? null;
  const syncFailed = Boolean(syncError);
  const syncControl = (
    <div className="flex items-center gap-2">
      {/* Fixed width and opacity, so nothing moves when the text comes and goes. */}
      <span
        aria-live="polite"
        title={syncError ?? undefined}
        className={cn(
          "w-24 text-right text-xs transition-opacity duration-300",
          syncFailed ? "font-medium text-danger-text opacity-100" : justSynced ? "text-gray-600 opacity-100" : "opacity-0",
        )}
      >
        {syncFailed ? "Not synced" : "Synced just now"}
      </span>
      <Tooltip>
        <TooltipTrigger render={<Button size="icon" variant="ghost" aria-label="Sync with QuickBooks" disabled={syncing} onClick={() => void syncNow()} />}>
          <RefreshCw className={cn(syncing && "animate-spin")} />
        </TooltipTrigger>
        <TooltipContent>Sync with QuickBooks</TooltipContent>
      </Tooltip>
    </div>
  );

  const shift = (n: number) => setRange((r) => ({ ...r, anchor: addDays(r.anchor, r.mode === "week" ? 7 * n : n) }));
  const thisWeek = range.mode === "week" && weekStart(range.anchor) === weekStart(today);
  const calShift = (n: number) =>
    setCalendar((c) => {
      if (c.mode === "day") return { ...c, anchor: addDays(c.anchor, n) };
      const d = new Date(`${c.anchor.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + n);
      return { ...c, anchor: d.toISOString().slice(0, 10) };
    });

  const selected = openId ? (orders ?? []).find((o) => o.id === openId) ?? null : null;
  const collectOnly = (order: Order) => !isPaid(order) && prefs ? !prefs.allowUnpaid : false;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center gap-2">
        {searchBox}
        {view === "calendar" && (
          <div className="ml-2 flex items-center gap-1">
            {calendar.mode === "month" && <h2 className="mr-2 text-lg font-semibold text-gray-900">{monthTitle(calendar.anchor)}</h2>}
            <Button size="icon-sm" variant="ghost" aria-label="Previous" onClick={() => calShift(-1)}>
              <ChevronLeft />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Next" onClick={() => calShift(1)}>
              <ChevronRight />
            </Button>
            <Button size="sm" variant="secondary" className="ml-1" onClick={() => setCalendar((c) => ({ ...c, anchor: today }))}>
              Today
            </Button>
          </div>
        )}
        <span className="flex-1" />
        {view === "board" && (
          <div className="flex items-center gap-2 px-4">
            <Button size="icon" variant="ghost" aria-label={range.mode === "week" ? "Previous week" : "Previous day"} onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button size="icon" variant="ghost" aria-label={range.mode === "week" ? "Next week" : "Next day"} onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
            <span className="min-w-24 text-base font-medium text-gray-900">{range.mode === "week" ? weekLabel(weekStart(range.anchor)) : mediumDay(range.anchor)}</span>
            <TextTabs
              value={thisWeek ? "week" : range.mode === "day" && range.anchor === today ? "today" : null}
              onChange={(tab) => setRange({ mode: tab === "week" ? "week" : "day", anchor: today })}
              options={[
                { id: "week", label: "This week" },
                { id: "today", label: "Today" },
              ]}
            />
          </div>
        )}
        {view === "calendar" && (
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Calendar view" className="flex gap-0.5 rounded-md bg-sunken p-0.5">
              {(["month", "day"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={calendar.mode === mode}
                  onClick={() => setCalendar((c) => ({ ...c, mode }))}
                  className={cn("h-7 rounded-sm px-3 text-sm font-medium", calendar.mode === mode ? "bg-surface text-gray-900 shadow-xs" : "text-gray-500")}
                >
                  {mode === "month" ? "Month" : "Day"}
                </button>
              ))}
            </div>
            <Button variant="secondary" aria-expanded={drawer} onClick={() => setDrawer((v) => !v)}>
              All invoices
            </Button>
          </div>
        )}
        {syncControl}
        <ViewSwitch value={view} onChange={pickView} />
      </div>

      {notice && (
        <div role="alert" className="absolute top-12 left-1/2 z-30 flex min-h-10 -translate-x-1/2 items-center rounded-md border border-danger-border bg-danger-fill px-3 text-sm font-medium text-danger-text shadow-sm">
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {loadError && !orders ? (
            <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 text-center">
              <p className="text-md font-semibold text-gray-900">Couldn’t load invoices</p>
              <p className="text-sm text-gray-600">{loadError}</p>
              <Button variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : !orders ? (
            <p className="mt-16 text-center text-sm text-gray-500">Loading invoices…</p>
          ) : view === "list" ? (
            <ListView orders={visible} selectedId={openId} onOpen={(o) => setOpenId(o.id)} />
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {view === "board" ? (
                <Board cards={cards} prefs={prefs} canEdit={canEdit} selectedId={openId} onOpen={(card) => setOpenId(card.order.id)} onDrop={onBoardDrop} />
              ) : (
                <CalendarView
                  orders={visible}
                  mode={calendar.mode}
                  anchor={calendar.anchor}
                  canEdit={canEdit}
                  selectedId={openId}
                  onAnchor={(anchor) => setCalendar((c) => ({ ...c, anchor }))}
                  onMode={(mode) => setCalendar((c) => ({ ...c, mode }))}
                  onOpen={(o) => setOpenId(o.id)}
                  onDropDay={onCalendarDrop}
                />
              )}
              <InvoiceDrawer
                open={drawer}
                orders={orders.filter((o) => !o.voided)}
                selectedId={openId}
                flush={!selected}
                onOpenChange={setDrawer}
                onOpen={(o) => setOpenId(o.id)}
              />
            </div>
          )}
        </div>
        {selected && (
          <OrderPanel
            key={selected.id}
            orderId={selected.id}
            prefs={prefs}
            users={meta?.users ?? []}
            canEdit={canEdit}
            onClose={() => setOpenId(null)}
            onChanged={changed}
          />
        )}
      </div>

      {choose && (
        <ProcessingTypeDialog
          order={choose.order}
          delivery={choose.delivery}
          unpaidCollectOnly={collectOnly(choose.order)}
          onClose={() => setChoose(null)}
          onDone={changed}
        />
      )}
    </div>
  );
}
