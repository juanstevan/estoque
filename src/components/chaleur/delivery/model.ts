/** Delivery tab: the shapes /api/orders returns, plus labels and dates (New York time). */

export type Status = "PENDING" | "PREPARING" | "TO_DELIVER" | "IN_TRANSIT" | "DELAYED" | "COMPLETED";
export type Mode = "DELIVERY" | "PICKUP";

export type Product = { id: string; name: string; sku: string; code: string; ean: string | null; secondarySku: string | null };
export type OrderLine = {
  id: string;
  productId: string;
  orderedQty: number;
  reservedQty: number;
  deliveredQty: number;
  unitPrice: number;
  physical: boolean;
  product: Product;
};
export type DeliveryLine = { id: string; orderLineId: string; qty: number; preparedQty: number };
export type Proof = { id: string; kind: string; createdAt: string; actor: string; deliveryId: string | null; public: boolean };
export type Person = { id: string; name: string };
export type Delivery = {
  id: string;
  orderId: string;
  number: number;
  status: Status;
  mode: Mode;
  assigneeId: string | null;
  assignee: Person | null;
  deliverBy: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  priorStatus: Status | null;
  delayReason: string | null;
  dispatchedAt: string | null;
  stockOutAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  lines: DeliveryLine[];
  proofs?: Proof[];
};
export type Order = {
  id: string;
  externalRef: string;
  customerName: string | null;
  address: string | null;
  qbAddress: string | null;
  customerPhone: string | null;
  status: Status;
  onKanban: boolean;
  voided: boolean;
  totalAmount: number;
  amountPaid: number;
  taxAmount: number;
  paymentStatus: string | null;
  invoiceDate: string | null;
  issues: string | null;
  notes: string | null;
  trackingToken: string | null;
  trackingExpiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
  lines: OrderLine[];
  deliveries: Delivery[];
};
export type OrderEvent = { id: string; kind: string; message: string; actor: string; public: boolean; createdAt: string; meta: string | null };
export type Detail = Order & { deliveries: (Delivery & { proofs: Proof[] })[]; events: OrderEvent[]; proofs: Proof[] };
export type Prefs = {
  stockStage: "ready" | "out" | "completed";
  allowPaid: boolean;
  allowUnpaid: boolean;
  collectUnpaid: boolean;
  prepMethod: "manual" | "scan";
  trackingDays: number;
};
export type Meta = { users: Person[]; lastSync: string | null; syncError: string | null; prefs: Prefs };

export const DELAY_REASONS = [
  { id: "payment", label: "Waiting for payment" },
  { id: "stock", label: "Unavailable stock" },
  { id: "reschedule", label: "Customer reschedule" },
  { id: "transport", label: "Transportation issue" },
];

export async function post<T = Detail>(body: object): Promise<T> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// ---------------------------------------------------------------- dates

const TZ = "America/New_York";

/** YYYY-MM-DD in New York. */
export function nyDay(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function todayDay() {
  return nyDay(new Date());
}

/** Noon UTC of a YYYY-MM-DD, the way the server stores days. */
export function dayDate(day: string) {
  return new Date(`${day}T12:00:00.000Z`);
}

export function addDays(day: string, n: number) {
  const date = dayDate(day);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week holding `day`. */
export function weekStart(day: string) {
  const weekday = (dayDate(day).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

function fmt(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(dayDate(day));
}

/** "Wed 7" */
export function shortDay(day: string) {
  return `${fmt(day, { weekday: "short" })} ${Number(day.slice(8))}`;
}

/** "Oct 5 – 11" or "Sep 28 – Oct 4" */
export function weekLabel(start: string) {
  const end = addDays(start, 6);
  const sameMonth = start.slice(5, 7) === end.slice(5, 7);
  return `${fmt(start, { month: "short", day: "numeric" })} – ${sameMonth ? fmt(end, { day: "numeric" }) : fmt(end, { month: "short", day: "numeric" })}`;
}

export function longDay(day: string) {
  return fmt(day, { weekday: "long", month: "long", day: "numeric" });
}

export function mediumDay(day: string) {
  return fmt(day, { weekday: "short", month: "short", day: "numeric" });
}

export function monthDay(day: string) {
  return fmt(day, { month: "short", day: "numeric" });
}

/** "Today", "Tomorrow", "Yesterday" or "Wed 7". */
export function dayWord(day: string) {
  const today = todayDay();
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return shortDay(day);
}

export function timeOf(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/** "Today, 9:41 AM", "Oct 3, 2:15 PM" */
export function stamp(value: string | Date) {
  const day = nyDay(value);
  const today = todayDay();
  const prefix = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : monthDay(day);
  return `${prefix}, ${timeOf(value)}`;
}

function hour(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const twelve = h % 12 || 12;
  return m ? `${twelve}:${String(m).padStart(2, "0")}` : String(twelve);
}

/** "9–12", "1–4 PM", "after 2 PM" */
export function windowLabel(start: string | null, end: string | null) {
  if (!start && !end) return "";
  if (start && end) {
    const suffix = start >= "12:00" ? " PM" : end < "12:00" ? " AM" : "";
    return `${hour(start)}–${hour(end)}${suffix}`;
  }
  const at = (start ?? end)!;
  return `${start ? "after" : "before"} ${hour(at)} ${at >= "12:00" ? "PM" : "AM"}`;
}

function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "9:00 AM – 12:00 PM" for the details list. */
export function windowRange(start: string | null, end: string | null) {
  if (start && end) return `${clock(start)} – ${clock(end)}`;
  if (start) return `After ${clock(start)}`;
  if (end) return `Before ${clock(end)}`;
  return "";
}

// ---------------------------------------------------------------- labels

export function stageOf(d: { status: Status; priorStatus: Status | null }): Status {
  return d.status === "DELAYED" ? d.priorStatus ?? "PENDING" : d.status;
}

export type Column = "NEW" | "PENDING" | "PREPARING" | "PROCESSING" | "COMPLETED";

export function columnOf(d: { status: Status; priorStatus: Status | null }): Column {
  const stage = stageOf(d);
  if (stage === "TO_DELIVER" || stage === "IN_TRANSIT") return "PROCESSING";
  return stage as Column;
}

export const COLUMN_LABEL: Record<Column, string> = {
  NEW: "New",
  PENDING: "Pending",
  PREPARING: "Preparing",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
};

/** Stage colors (darkened for 4.5:1 on their tint). */
export const COLUMN_COLOR: Record<Column, string> = {
  NEW: "#5b6472",
  PENDING: "#0a6dc2",
  PREPARING: "#b4540a",
  PROCESSING: "#6b4fbb",
  COMPLETED: "#147247",
};

export const MODE_COLOR: Record<Mode, string> = { DELIVERY: "#6b4fbb", PICKUP: "#0e7c7b" };
export const MODE_LABEL: Record<Mode, string> = { DELIVERY: "Delivery", PICKUP: "Collect" };

export type Chip = { label: string; variant: "neutral" | "info" | "success" | "warning" | "danger" };

export function deliveryChip(d: { status: Status; priorStatus: Status | null; mode: Mode }): Chip {
  if (d.status === "DELAYED") return { label: "Delayed", variant: "danger" };
  if (d.status === "COMPLETED") return { label: "Completed", variant: "success" };
  if (d.status === "TO_DELIVER" || d.status === "IN_TRANSIT") return { label: "Processing", variant: "info" };
  if (d.status === "PREPARING") return { label: "Preparing", variant: "info" };
  return { label: "Pending", variant: "neutral" };
}

/** The invoice as a whole, for the list and the panel header. */
export function orderChip(order: Order): Chip {
  if (order.voided) return { label: "Voided", variant: "danger" };
  if (!order.deliveries.length) return order.status === "COMPLETED" ? { label: "Completed", variant: "success" } : { label: "New", variant: "neutral" };
  const done = order.deliveries.filter((d) => d.status === "COMPLETED");
  if (done.length === order.deliveries.length) return { label: "Completed", variant: "success" };
  if (done.length) return { label: "Partly delivered", variant: "info" };
  const open = order.deliveries.filter((d) => d.status !== "COMPLETED");
  return deliveryChip(open[0]!);
}

export function isPaid(order: Pick<Order, "paymentStatus">) {
  return order.paymentStatus === "Paid";
}

export function paymentChip(order: Order): Chip {
  if (isPaid(order)) return { label: "Paid", variant: "success" };
  if (order.amountPaid > 0) return { label: "Partly paid", variant: "warning" };
  return { label: "Unpaid", variant: "warning" };
}

/** Unpaid and blocked by the rules: it waits in New. */
export function waitingForPayment(order: Order, prefs: Prefs | null) {
  return Boolean(prefs) && !isPaid(order) && !prefs!.allowUnpaid && !prefs!.collectUnpaid;
}

export function initials(name: string | null | undefined) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

/** "Marcos S." */
export function shortName(name: string | null | undefined) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0]!;
}

/** The city out of "street, city, state, zip". */
export function areaOf(order: Pick<Order, "address" | "qbAddress">) {
  const parts = (order.address || order.qbAddress || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3]!;
  return parts[1] ?? parts[0] ?? "";
}

export function units(n: number) {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

export function orderUnits(order: Pick<Order, "lines">) {
  return order.lines.filter((line) => line.physical).reduce((sum, line) => sum + line.orderedQty, 0);
}

export function deliveryUnits(d: Pick<Delivery, "lines">) {
  return d.lines.reduce((sum, line) => sum + line.qty, 0);
}

export function prepared(d: Pick<Delivery, "lines">) {
  const all = deliveryUnits(d);
  const done = d.lines.reduce((sum, line) => sum + Math.min(line.preparedQty, line.qty), 0);
  return { done, all, complete: done >= all };
}

export function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}
