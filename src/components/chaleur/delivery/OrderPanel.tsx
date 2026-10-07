"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  Circle,
  CircleDashed,
  Clock,
  Ellipsis,
  MapPin,
  MessageSquare,
  Plus,
  ScanBarcode,
  Store,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Avatar, Steps, StatusChip } from "./parts";
import {
  CompleteDialog,
  DelayDialog,
  PrepareDialog,
  ProcessingTypeDialog,
  ScanDialog,
  SchedulePicker,
  SplitDialog,
  linesOf,
} from "./Dialogs";
import {
  DELAY_REASONS,
  MODE_LABEL,
  dayWord,
  deliveryChip,
  isPaid,
  mediumDay,
  money,
  monthDay,
  nyDay,
  orderChip,
  paymentChip,
  post,
  prepared,
  stageOf,
  stamp,
  timeOf,
  waitingForPayment,
  windowRange,
  type Delivery,
  type Detail,
  type Person,
  type Prefs,
} from "./model";

type DialogName = "prepare" | "scan" | "complete" | "delay" | "split" | "type" | "back" | null;

const ITEMS_KEY = "delivery.items.open";

function readOpen() {
  try {
    return localStorage.getItem(ITEMS_KEY) !== "0";
  } catch {
    return true;
  }
}

function Eyebrow({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-medium tracking-[0.04em] text-gray-500 uppercase">{children}</span>
      {aside && <span className="text-gray-600">{aside}</span>}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-gray-600">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-gray-900">{children}</div>
    </div>
  );
}

/** Click to edit; Enter or leaving saves, Escape cancels. */
function InlineText({ value, placeholder, disabled, onSave }: { value: string; placeholder: string; disabled?: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className={cn("-mx-1.5 w-full truncate rounded-md px-1.5 py-1 text-left enabled:hover:bg-gray-100", !value && "text-gray-400")}
      >
        {value || placeholder}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      className="h-8"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(value);
          setEditing(false);
        }
      }}
      onBlur={() => {
        setEditing(false);
        if (text.trim() !== value) onSave(text.trim());
      }}
    />
  );
}

function ActionCard({
  icon: Icon,
  title,
  aside,
  tone,
  children,
}: {
  icon: typeof Clock;
  title: string;
  aside?: React.ReactNode;
  tone?: "danger" | "success";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        tone === "danger" ? "border-danger-border bg-danger-fill/40" : tone === "success" ? "border-success-border bg-success-fill/50" : "border-gray-150 bg-gray-50",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4 shrink-0", tone === "danger" ? "text-danger-text" : tone === "success" ? "text-success-text" : "text-primary")} />
        <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">{title}</span>
        {aside && <span className="font-mono text-xs text-gray-600 tabular-nums">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-600">{children}</p>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function OrderPanel({
  orderId,
  prefs,
  users,
  canEdit,
  onClose,
  onChanged,
}: {
  orderId: string;
  prefs: Prefs | null;
  users: Person[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: (detail: Detail) => void;
}) {
  const [order, setOrder] = useState<Detail | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => setItemsOpen(readOpen()), []);

  useEffect(() => {
    let cancelled = false;
    setOrder(null);
    setError("");
    void fetch(`/api/orders?id=${orderId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't open the invoice");
        if (!cancelled) setOrder(data);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function apply(detail: Detail) {
    setOrder(detail);
    onChanged(detail);
  }

  async function run(body: object) {
    setBusy(true);
    setError("");
    try {
      apply(await post(body));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!order) return;
    try {
      const { token } = await post<{ token: string }>({ action: "track", orderId: order.id });
      await navigator.clipboard.writeText(`${location.origin}/track/${token}`);
      setNotice("Tracking link copied");
      setTimeout(() => setNotice(""), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't copy the link");
    }
  }

  if (!order) {
    return (
      <aside className="flex w-[480px] shrink-0 flex-col border-l border-border bg-surface">
        <div className="flex h-14 items-center justify-end border-b border-border px-4">
          <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        <p className="p-6 text-sm text-gray-500">{error || "Loading invoice…"}</p>
      </aside>
    );
  }

  const deliveries = order.deliveries;
  const active =
    deliveries.find((d) => d.id === activeId) ?? deliveries.find((d) => d.status !== "COMPLETED") ?? deliveries.at(-1) ?? null;
  const stage = active ? stageOf(active) : null;
  const pickup = active?.mode === "PICKUP";
  const prep = active ? prepared(active) : null;
  const scan = prefs?.prepMethod === "scan";
  const blocked = waitingForPayment(order, prefs);
  const collectOnly = !isPaid(order) && prefs ? !prefs.allowUnpaid : false;
  const leftStock = deliveries.some((d) => d.stockOutAt || d.dispatchedAt || d.status === "COMPLETED");
  const physicalUnits = order.lines.filter((l) => l.physical).reduce((sum, l) => sum + l.orderedQty, 0);
  const reserved = order.lines.reduce((sum, l) => sum + l.reservedQty, 0);
  const delivered = order.lines.reduce((sum, l) => sum + l.deliveredQty, 0);
  const busyDays = new Set(deliveries.flatMap((d) => (d.deliverBy && d.id !== active?.id ? [nyDay(d.deliverBy)] : [])));
  const editable = canEdit && !order.voided;
  const open = active && active.status !== "COMPLETED" && editable;
  const delay = active?.delayReason ? DELAY_REASONS.find((r) => r.id === active.delayReason)?.label : null;
  const items = active
    ? linesOf(order, active)
    : order.lines.filter((l) => l.physical).map((line) => ({ id: line.id, orderLineId: line.id, qty: line.orderedQty, preparedQty: 0, line }));
  const services = order.lines.filter((l) => !l.physical);
  const otherQty = (orderLineId: string) =>
    deliveries.filter((d) => d.id !== active?.id && d.status !== "COMPLETED").reduce((sum, d) => sum + (d.lines.find((l) => l.orderLineId === orderLineId)?.qty ?? 0), 0);

  function moveToProcessing() {
    setDialog("type");
  }

  function actionCard(d: Delivery) {
    const proofs = d.proofs ?? [];
    const s = stageOf(d);
    if (d.status === "COMPLETED") {
      return (
        <ActionCard icon={CircleCheck} tone="success" title={`${pickup ? "Collected" : "Delivered"}${d.completedBy ? ` by ${d.completedBy}` : ""}`} aside={d.completedAt ? timeOf(d.completedAt) : undefined}>
          {proofs.length > 0 && (
            <div className="flex gap-2">
              {proofs.slice(0, 4).map((proof) => (
                <a key={proof.id} href={`/api/orders/file?id=${proof.id}`} target="_blank" rel="noreferrer" className="size-16 overflow-hidden rounded-md bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={proof.kind === "signed" ? "Signed invoice" : "Delivery photo"} className="size-full object-cover" src={`/api/orders/file?id=${proof.id}`} />
                </a>
              ))}
            </div>
          )}
          <Hint>
            {prepared(d).all} {prepared(d).all === 1 ? "unit" : "units"} taken out of stock.
          </Hint>
          <Actions>
            <Button size="sm" variant="secondary" onClick={() => void copyLink()}>
              Copy tracking link
            </Button>
          </Actions>
        </ActionCard>
      );
    }
    if (d.status === "DELAYED") {
      return (
        <ActionCard icon={AlertTriangle} tone="danger" title={`Delayed${delay ? ` · ${delay}` : ""}`} aside={d.deliverBy ? mediumDay(nyDay(d.deliverBy)) : undefined}>
          <Hint>The units stay reserved. Resume when it’s back on track.</Hint>
          {open && (
            <Actions>
              <Button size="sm" disabled={busy} onClick={() => void run({ action: "move", deliveryId: d.id, status: s })}>
                Resume
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("delay")}>
                Change date
              </Button>
            </Actions>
          )}
        </ActionCard>
      );
    }
    if (s === "PENDING") {
      return (
        <ActionCard icon={Clock} title="Pending" aside={d.deliverBy ? dayWord(nyDay(d.deliverBy)) : "Not scheduled"}>
          <Hint>Schedule it in Details below, then start preparing when the items are picked.</Hint>
          {open && (
            <Actions>
              <Button size="sm" disabled={busy} onClick={() => void run({ action: "move", deliveryId: d.id, status: "PREPARING" })}>
                Start preparing
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog("split")} disabled={prepared(d).all < 2}>
                Split delivery
              </Button>
            </Actions>
          )}
        </ActionCard>
      );
    }
    if (s === "PREPARING") {
      const p = prepared(d);
      return (
        <ActionCard icon={ScanBarcode} title={scan ? "Scan the items" : "Count the items"} aside={`${p.done} of ${p.all}`}>
          <div className="h-1 overflow-hidden rounded-xs bg-gray-150">
            <div className="h-1 rounded-xs bg-primary" style={{ width: `${p.all ? (100 * p.done) / p.all : 100}%` }} />
          </div>
          <Hint>
            {scan
              ? `Scan each unit with the barcode reader. Move to processing unlocks when all ${p.all} are scanned.`
              : `Type how many units of each product you took. Move to processing unlocks when all ${p.all} are counted.`}
          </Hint>
          {open && (
            <Actions>
              <Button size="sm" onClick={() => setDialog(scan ? "scan" : "prepare")}>
                {scan ? "Scan products" : "Count items"}
              </Button>
              <Button size="sm" variant="secondary" disabled={!p.complete} onClick={moveToProcessing}>
                Move to processing
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog("split")} disabled={p.all < 2}>
                Split delivery
              </Button>
            </Actions>
          )}
        </ActionCard>
      );
    }
    if (s === "TO_DELIVER" && pickup) {
      return (
        <ActionCard icon={Store} title="Ready to collect">
          <Hint>When the customer picks it up, complete it with a photo of the signed invoice.</Hint>
          {open && (
            <Actions>
              <Button size="sm" onClick={() => setDialog("complete")}>
                Complete collection
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("delay")}>
                Mark delayed
              </Button>
            </Actions>
          )}
        </ActionCard>
      );
    }
    if (s === "TO_DELIVER") {
      return (
        <ActionCard icon={Truck} title="Ready to go">
          <Hint>Mark it out for delivery when the driver leaves, or complete it at the door.</Hint>
          {open && (
            <Actions>
              <Button size="sm" disabled={busy} onClick={() => void run({ action: "move", deliveryId: d.id, status: "IN_TRANSIT" })}>
                Out for delivery
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog("complete")}>
                Complete delivery
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog("delay")}>
                Mark delayed
              </Button>
            </Actions>
          )}
        </ActionCard>
      );
    }
    return (
      <ActionCard icon={Truck} title="Complete delivery" aside={d.dispatchedAt ? `Left ${timeOf(d.dispatchedAt)}` : undefined}>
        <Hint>
          Take at least one photo at the door.{d.stockOutAt ? "" : " The units leave stock when you complete."}
        </Hint>
        {open && (
          <Actions>
            <Button size="sm" onClick={() => setDialog("complete")}>
              Complete delivery
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("delay")}>
              Mark delayed
            </Button>
          </Actions>
        )}
      </ActionCard>
    );
  }

  return (
    <aside className="flex w-[480px] shrink-0 flex-col border-l border-border bg-surface" aria-label={`Invoice ${order.externalRef}`}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-6 pr-4">
        <span className="font-mono text-sm font-medium text-gray-900">{order.externalRef}</span>
        <StatusChip chip={orderChip(order)} />
        <span className="flex-1" />
        {notice && <span className="text-xs text-success-text">{notice}</span>}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More actions" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void copyLink()}>Copy tracking link</DropdownMenuItem>
              {active && open && !active.stockOutAt && !active.dispatchedAt && prepared(active).all > 1 && (
                <DropdownMenuItem onClick={() => setDialog("split")}>Split delivery</DropdownMenuItem>
              )}
              {active && open && active.status !== "DELAYED" && <DropdownMenuItem onClick={() => setDialog("delay")}>Mark delayed</DropdownMenuItem>}
              {deliveries.length > 0 && !leftStock && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDialog("back")}>Back to New</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-md font-semibold text-gray-900">{order.customerName || "No customer"}</h2>
            <span className="font-mono text-md font-medium text-gray-900 tabular-nums">{money(order.totalAmount)}</span>
          </div>
          {(order.address || order.qbAddress) && (
            <p className="flex items-start gap-1.5 text-sm text-gray-600">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              {order.address || order.qbAddress}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <StatusChip chip={paymentChip(order)} />
            <span>
              {order.invoiceDate ? `Invoiced ${monthDay(nyDay(order.invoiceDate))}` : "Not invoiced"}
              {deliveries.length > 0 &&
                ` · ${[delivered && `${delivered} delivered`, reserved && `${reserved} ${reserved === 1 ? "unit" : "units"} reserved`].filter(Boolean).join(" · ") || "nothing reserved"}`}
              {!isPaid(order) && order.amountPaid > 0 && ` · ${money(order.amountPaid)} of ${money(order.totalAmount)} paid`}
            </span>
          </div>
        </div>

        {order.issues && (
          <p className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-fill px-3 py-2 text-sm text-warning-text">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="whitespace-pre-line">{order.issues}</span>
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-danger-border bg-danger-fill px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        {deliveries.length > 1 && (
          <section className="flex flex-col gap-1">
            <Eyebrow>Deliveries</Eyebrow>
            <div className="flex flex-col divide-y divide-gray-150 rounded-lg border border-gray-150">
              {deliveries.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={d.id === active?.id}
                  onClick={() => setActiveId(d.id)}
                  className={cn("flex items-center gap-3 px-3 py-2.5 text-left first:rounded-t-lg last:rounded-b-lg", d.id === active?.id ? "bg-selected" : "hover:bg-gray-50")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">
                      Delivery {d.number} <span className="font-mono text-xs font-normal text-gray-500">{prepared(d).all} units</span>
                    </span>
                    <span className="block truncate text-xs text-gray-600">
                      {[
                        d.completedAt ? stamp(d.completedAt) : d.deliverBy ? `${mediumDay(nyDay(d.deliverBy))}${d.windowStart ? ` · ${windowRange(d.windowStart, d.windowEnd)}` : ""}` : "Not scheduled",
                        d.assignee?.name,
                        d.status === "COMPLETED" ? null : `${prepared(d).all} reserved`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <StatusChip chip={deliveryChip(d)} />
                </button>
              ))}
            </div>
          </section>
        )}

        {active && stage && (
          <Steps index={active.status === "COMPLETED" ? 3 : stage === "PENDING" ? 0 : stage === "PREPARING" ? 1 : 2} done={active.status === "COMPLETED"} />
        )}

        {order.voided ? (
          <ActionCard icon={AlertTriangle} tone="danger" title="Voided in QuickBooks">
            <Hint>Voided invoices don’t go out. Nothing here can change.</Hint>
          </ActionCard>
        ) : active ? (
          actionCard(active)
        ) : (
          <ActionCard icon={Plus} title="Add to workflow" aside={`${physicalUnits} units`}>
            <Hint>
              {blocked
                ? "Waiting for payment. Unpaid invoices are off in Settings › Preferences › Delivery, so this one can start as soon as QuickBooks marks it paid."
                : "Reserves its units and moves it to Pending."}
            </Hint>
            {editable && (
              <Actions>
                <Button size="sm" disabled={busy || blocked} onClick={() => void run({ action: "add", orderId: order.id })}>
                  Add to workflow
                </Button>
              </Actions>
            )}
          </ActionCard>
        )}

        <section className="flex flex-col gap-1">
          <Eyebrow>Details</Eyebrow>
          {active && (
            <>
              <DetailRow label="Processing">
                {open && !active.dispatchedAt ? (
                  <Select
                    value={active.mode}
                    onValueChange={(mode) => void run({ action: "delivery", deliveryId: active.id, mode })}
                  >
                    <SelectTrigger size="sm" className="-ml-2 w-40 border-transparent shadow-none hover:border-border" aria-label="Processing">
                      <SelectValue>{(value: string) => MODE_LABEL[value as "DELIVERY" | "PICKUP"]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DELIVERY" disabled={collectOnly}>
                        Delivery
                      </SelectItem>
                      <SelectItem value="PICKUP">Collect</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  MODE_LABEL[active.mode]
                )}
              </DetailRow>
              <DetailRow label="Date">
                {open ? (
                  <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                    <PopoverTrigger className={cn("-mx-1.5 rounded-md px-1.5 py-1 text-left hover:bg-gray-100", !active.deliverBy && "text-gray-400")}>
                      {active.deliverBy ? `${dayWord(nyDay(active.deliverBy))}, ${monthDay(nyDay(active.deliverBy))}` : "Not scheduled"}
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-4">
                      <SchedulePicker
                        delivery={active}
                        busyDays={busyDays}
                        onSave={async (input) => {
                          apply(await post({ action: "schedule", deliveryId: active.id, ...input }));
                          setScheduleOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                ) : active.deliverBy ? (
                  `${dayWord(nyDay(active.deliverBy))}, ${monthDay(nyDay(active.deliverBy))}`
                ) : (
                  <span className="text-gray-400">Not scheduled</span>
                )}
              </DetailRow>
              <DetailRow label="Time window">
                {active.windowStart || active.windowEnd ? windowRange(active.windowStart, active.windowEnd) : <span className="text-gray-400">—</span>}
              </DetailRow>
              <DetailRow label="Assignee">
                {open ? (
                  <Select
                    value={active.assigneeId ?? ""}
                    onValueChange={(value) => void run({ action: "delivery", deliveryId: active.id, assigneeId: value || null })}
                  >
                    <SelectTrigger size="sm" className="-ml-2 w-56 border-transparent shadow-none hover:border-border" aria-label="Assignee">
                      <SelectValue>
                        {(value: string) => {
                          const person = users.find((u) => u.id === value) ?? active.assignee;
                          return (
                            <span className="flex items-center gap-2">
                              <Avatar name={value ? person?.name : null} />
                              {value ? person?.name : "Unassigned"}
                            </span>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="flex items-center gap-2">
                    <Avatar name={active.assignee?.name} />
                    {active.assignee?.name ?? "Unassigned"}
                  </span>
                )}
              </DetailRow>
            </>
          )}
          <DetailRow label="Phone">
            <InlineText
              value={order.customerPhone ?? ""}
              placeholder="Add a phone"
              disabled={!editable}
              onSave={(customerPhone) => void run({ action: "order", orderId: order.id, customerPhone })}
            />
          </DetailRow>
          <DetailRow label="Address">
            <InlineText
              value={order.address ?? order.qbAddress ?? ""}
              placeholder="Add an address"
              disabled={!editable}
              onSave={(address) => void run({ action: "order", orderId: order.id, address })}
            />
          </DetailRow>
        </section>

        <section className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={itemsOpen}
            onClick={() => {
              const next = !itemsOpen;
              setItemsOpen(next);
              try {
                localStorage.setItem(ITEMS_KEY, next ? "1" : "0");
              } catch {}
            }}
            className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50"
          >
            <span className="flex-1 text-left">
              <Eyebrow
                aside={
                  active
                    ? `${prep!.all} ${prep!.all === 1 ? "unit" : "units"} · ${prep!.done === prep!.all ? (scan ? "all scanned" : "all counted") : `${prep!.done} ${scan ? "scanned" : "counted"}`}`
                    : `${physicalUnits} ${physicalUnits === 1 ? "unit" : "units"}`
                }
              >
                Items
              </Eyebrow>
            </span>
            <ChevronDown className={cn("size-4 text-gray-500 transition-transform", !itemsOpen && "-rotate-90")} />
          </button>
          {itemsOpen && (
            <ul className="flex flex-col">
              {items.map((row) => {
                const done = row.preparedQty >= row.qty;
                const others = otherQty(row.orderLineId);
                const deliveredHere = active?.status === "COMPLETED";
                return (
                  <li key={row.id} className="flex items-center gap-3 border-b border-gray-150 py-3 last:border-b-0">
                    {!active ? (
                      <Circle className="size-4 shrink-0 text-gray-300" />
                    ) : done ? (
                      <CircleCheck className="size-4 shrink-0 text-success-text" />
                    ) : row.preparedQty > 0 ? (
                      scan ? <ScanBarcode className="size-4 shrink-0 text-primary" /> : <CircleDashed className="size-4 shrink-0 text-primary" />
                    ) : (
                      <Circle className="size-4 shrink-0 text-gray-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-gray-900">{row.line.product.name}</div>
                      <div className="truncate font-mono text-xs text-gray-500">
                        {row.line.product.code} · {row.line.product.sku}
                        {deliveredHere ? " · delivered" : others ? ` · ${others} in a later delivery` : ""}
                      </div>
                    </div>
                    <span className={cn("font-mono text-sm tabular-nums", done && active ? "text-success-text" : "text-gray-900")}>
                      {active ? `${Math.min(row.preparedQty, row.qty)}/${row.qty}` : `×${row.qty}`}
                    </span>
                  </li>
                );
              })}
              {services.map((line) => (
                <li key={line.id} className="flex items-center gap-3 border-b border-gray-150 py-3 last:border-b-0">
                  <Circle className="size-4 shrink-0 text-gray-200" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-gray-900">{line.product.name}</div>
                    <div className="font-mono text-xs text-gray-500">Service</div>
                  </div>
                  <span className="text-xs text-gray-400">No count</span>
                </li>
              ))}
              {!items.length && !services.length && <li className="py-3 text-sm text-gray-500">No items matched in QuickBooks.</li>}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <Eyebrow>Activity</Eyebrow>
          {editable && <NoteBox onAdd={(text, isPublic) => run({ action: "note", orderId: order.id, text, public: isPublic })} />}
          <ol className="flex flex-col gap-3">
            {order.events.map((event) => {
              const note = event.kind === "note";
              return (
                <li key={event.id} className="flex gap-3">
                  {note ? (
                    <MessageSquare className={cn("mt-0.5 size-4 shrink-0", event.public ? "text-primary" : "text-gray-500")} />
                  ) : (
                    <span className="mt-[7px] ml-[5px] size-1.5 shrink-0 rounded-full bg-gray-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm text-gray-900", note && "rounded-md px-2.5 py-1.5", note && (event.public ? "bg-blue-50" : "bg-gray-50"))}>{event.message}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[event.actor, note ? (event.public ? "Shown to customer" : "Internal") : null, stamp(event.createdAt)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {active && dialog === "prepare" && (
        <PrepareDialog order={order} delivery={active} onClose={() => setDialog(null)} onDone={apply} onProcess={() => setDialog("type")} />
      )}
      {active && dialog === "scan" && (
        <ScanDialog order={order} delivery={active} onClose={() => setDialog(null)} onDone={apply} onProcess={() => setDialog("type")} />
      )}
      {active && dialog === "type" && (
        <ProcessingTypeDialog order={order} delivery={active} unpaidCollectOnly={collectOnly} onClose={() => setDialog(null)} onDone={apply} />
      )}
      {active && dialog === "complete" && (
        <CompleteDialog order={order} delivery={active} stockOutNow={!active.stockOutAt} onClose={() => setDialog(null)} onDone={apply} />
      )}
      {active && dialog === "delay" && <DelayDialog order={order} delivery={active} onClose={() => setDialog(null)} onDone={apply} />}
      {active && dialog === "split" && <SplitDialog order={order} delivery={active} onClose={() => setDialog(null)} onDone={apply} />}
      {dialog === "back" && (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Back to New?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              {order.externalRef} leaves the workflow and its {reserved} reserved {reserved === 1 ? "unit goes" : "units go"} back to available stock. Counts and dates are cleared.
            </p>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDialog(null);
                  void run({ action: "remove", orderId: order.id });
                }}
              >
                Back to New
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </aside>
  );
}

function NoteBox({ onAdd }: { onAdd: (text: string, isPublic: boolean) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <Textarea
        aria-label="Add a note"
        className="min-h-14 resize-none border-0 p-1.5 shadow-none focus-visible:ring-0"
        placeholder="Add a note…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="Who sees it" className="flex gap-0.5 rounded-md bg-sunken p-0.5">
          {(
            [
              [false, "Internal"],
              [true, "Customer"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={isPublic === value}
              onClick={() => setIsPublic(value)}
              className={cn("h-6 rounded-sm px-2 text-xs font-medium", isPublic === value ? "bg-surface text-gray-900 shadow-xs" : "text-gray-500")}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="secondary"
          disabled={!text.trim()}
          onClick={() =>
            void onAdd(text, isPublic).then((saved) => {
              if (!saved) return;
              setText("");
              setIsPublic(false);
            })
          }
        >
          Add note
        </Button>
      </div>
    </div>
  );
}
