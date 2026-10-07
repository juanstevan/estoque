import type { Metadata } from "next";
import { Check, Flame, MapPin, Truck } from "lucide-react";
import { trackingView } from "@/lib/inventory/orders";

export const metadata: Metadata = { title: "Order tracking", robots: { index: false } };

type View = NonNullable<Awaited<ReturnType<typeof trackingView>>>;
type D = View["deliveries"][number];

const TZ = "America/New_York";

function day(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function short(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(new Date(value));
}

function weekday(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function time(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

function when(value: Date | string) {
  const today = day(new Date());
  const d = day(value);
  return `${d === today ? "Today" : short(value)}, ${time(value)}`;
}

function windowText(d: D) {
  if (d.windowStart && d.windowEnd) return `between ${clock(d.windowStart)} and ${clock(d.windowEnd)}`;
  if (d.windowStart) return `after ${clock(d.windowStart)}`;
  if (d.windowEnd) return `before ${clock(d.windowEnd)}`;
  return "";
}

function stage(d: D) {
  return d.status === "DELAYED" ? d.priorStatus ?? "PENDING" : d.status;
}

/** Headline, sub line, the step reached (0–3) and the step labels. */
function summary(order: View) {
  const all = order.deliveries;
  const done = all.filter((d) => d.status === "COMPLETED");
  const open = all.filter((d) => d.status !== "COMPLETED");
  const pickup = all.length > 0 && all.every((d) => d.mode === "PICKUP");
  const steps = pickup ? ["Confirmed", "Preparing", "Ready", "Collected"] : ["Confirmed", "Preparing", "On the way", "Delivered"];
  const units = (list: D[]) => list.reduce((sum, d) => sum + d.units, 0);
  const today = day(new Date());

  if (!all.length) return { eyebrow: "Order received", title: "Confirmed", sub: "We’ll let you know when it’s scheduled.", step: 0, steps, done: false };
  if (!open.length) {
    const last = done.reduce((a, b) => ((a.completedAt ?? 0) > (b.completedAt ?? 0) ? a : b));
    return {
      eyebrow: last.completedAt && day(last.completedAt) === today ? (pickup ? "Collected today" : "Delivered today") : pickup ? "Collected" : "Delivered",
      title: pickup ? "Collected" : "Delivered",
      sub: last.completedAt ? `${day(last.completedAt) === today ? "Today" : weekday(last.completedAt)} at ${time(last.completedAt)}` : "",
      step: 3,
      steps,
      done: true,
    };
  }
  const next = open[0]!;
  const s = stage(next);
  const date = next.deliverBy ? `${day(next.deliverBy) === today ? "today" : weekday(next.deliverBy)}${windowText(next) ? `, ${windowText(next)}` : ""}` : "";
  if (done.length) {
    return {
      eyebrow: "Partly delivered",
      title: `${units(done)} of ${units(all)} items delivered`,
      sub: date ? `The rest arrives ${date}.` : "We’ll schedule the rest soon.",
      step: s === "IN_TRANSIT" ? 2 : s === "PENDING" ? 0 : 1,
      steps,
      done: false,
    };
  }
  if (next.status === "DELAYED") {
    return {
      eyebrow: "Delayed",
      title: "Running late",
      sub: [next.delayReason, next.deliverBy ? `New date: ${weekday(next.deliverBy)}${windowText(next) ? `, ${windowText(next)}` : ""}` : null].filter(Boolean).join(". "),
      step: s === "IN_TRANSIT" ? 2 : s === "PENDING" ? 0 : 1,
      steps,
      done: false,
    };
  }
  const scheduled = next.deliverBy ? (day(next.deliverBy) === today ? (pickup ? "Ready today" : "Arriving today") : `Scheduled for ${weekday(next.deliverBy)}`) : "Order confirmed";
  const sub = windowText(next) ? windowText(next)[0]!.toUpperCase() + windowText(next).slice(1) : next.deliverBy ? "" : "We’ll let you know when it’s scheduled.";
  if (s === "IN_TRANSIT") return { eyebrow: scheduled, title: "On the way", sub, step: 2, steps, done: false };
  if (s === "TO_DELIVER") {
    return pickup || next.mode === "PICKUP"
      ? { eyebrow: scheduled, title: "Ready to collect", sub: "Bring your invoice when you pick it up.", step: 2, steps, done: false }
      : { eyebrow: scheduled, title: "Ready to go", sub, step: 1, steps, done: false };
  }
  if (s === "PREPARING") return { eyebrow: scheduled, title: "Being prepared", sub, step: 1, steps, done: false };
  return { eyebrow: scheduled, title: "Confirmed", sub, step: 0, steps, done: false };
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-150 bg-white p-4">
      {title && <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-gray-500 uppercase">{title}</h2>}
      {children}
    </section>
  );
}

function Tracker({ steps, step, done, dates }: { steps: string[]; step: number; done: boolean; dates: (string | null)[] }) {
  return (
    <ol className="mt-5 grid grid-cols-4">
      {steps.map((label, i) => {
        const reached = i <= step;
        const current = i === step;
        const color = done ? "bg-success-text" : "bg-primary";
        return (
          <li key={label} className="relative flex flex-col items-center text-center">
            {i > 0 && <span aria-hidden className={`absolute top-[15px] right-1/2 h-0.5 w-full ${reached ? color : "bg-gray-200"}`} />}
            <span className="relative z-10 flex h-8 items-center justify-center">
              {current && (done || step === 2) ? (
                <span className={`flex size-8 items-center justify-center rounded-full text-white ${color}`}>
                  {done ? <Check className="size-4" strokeWidth={3} /> : <Truck className="size-4" />}
                </span>
              ) : (
                <span className={`size-2.5 rounded-full ${reached ? color : "bg-gray-200"}`} />
              )}
            </span>
            <span className={`mt-2 text-xs ${current ? "font-medium text-gray-900" : reached ? "text-gray-600" : "text-gray-400"}`}>{label}</span>
            <span className="text-[11px] text-gray-400">{dates[i] ?? ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await trackingView(token);
  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center">
        <div>
          <p className="text-md font-semibold text-gray-900">This tracking link isn’t active</p>
          <p className="mt-1 text-sm text-gray-600">Links stop working a few days after delivery. Contact us if you need help with your order.</p>
        </div>
      </main>
    );
  }

  const s = summary(order);
  // The dates under the steps follow the delivery still on its way, else the last one.
  const current = order.deliveries.find((d) => d.status !== "COMPLETED") ?? order.deliveries.at(-1);
  const photos = order.deliveries.flatMap((d) => d.photos);
  const latest = order.events[0];
  const subtotal = order.total - order.tax;
  const paid = order.paymentStatus === "Paid";
  const balance = Math.max(0, order.total - order.paid);
  const dates = [
    order.invoiceDate ? short(order.invoiceDate) : null,
    null,
    current?.dispatchedAt ? time(current.dispatchedAt) : null,
    current?.completedAt ? time(current.completedAt) : null,
  ];
  const deliveredOf = (itemId: string) =>
    order.deliveries.filter((d) => d.status === "COMPLETED").reduce((sum, d) => sum + (d.lines.find((l) => l.orderLineId === itemId)?.qty ?? 0), 0);
  const nextFor = (itemId: string) => order.deliveries.find((d) => d.status !== "COMPLETED" && d.lines.some((l) => l.orderLineId === itemId));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex h-14 items-center justify-between border-b border-gray-150 bg-white px-4">
        <span className="flex items-center gap-2">
          {order.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={order.company.logoUrl} alt={order.company.name} className="h-6 w-auto max-w-36 object-contain" />
          ) : (
            <>
              <Flame className="size-5 text-gray-900" />
              <span className="text-base font-semibold text-gray-900">{order.company.name}</span>
            </>
          )}
        </span>
        <span className="font-mono text-sm text-gray-600">Order {order.reference}</span>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-3 px-4 py-4">
        <Card>
          <p className="text-xs font-medium tracking-[0.04em] text-gray-500 uppercase">{s.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{s.title}</h1>
          {s.sub && <p className="mt-1 text-sm text-gray-600">{s.sub}</p>}
          <Tracker steps={s.steps} step={s.step} done={s.done} dates={dates} />
        </Card>

        {photos.length > 0 && (
          <Card title={s.done ? "Delivery photos" : "Photos so far"}>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((id) => (
                <a key={id} href={`/api/track/${token}/file/${id}`} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-md bg-gray-100">
                  {/* Served by the tracking route, which checks the link. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Delivery photo" className="size-full object-cover" src={`/api/track/${token}/file/${id}`} />
                </a>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Tap a photo to see it full size.</p>
          </Card>
        )}

        {order.deliveries.length > 1 && (
          <Card title="Deliveries">
            <ul className="flex flex-col divide-y divide-gray-150">
              {order.deliveries.map((d) => (
                <li key={d.number} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      Delivery {d.number} · {d.units} {d.units === 1 ? "item" : "items"}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {d.completedAt
                        ? `${when(d.completedAt)}${d.photos.length ? ` · ${d.photos.length} ${d.photos.length === 1 ? "photo" : "photos"}` : ""}`
                        : d.deliverBy
                          ? `${weekday(d.deliverBy)}${windowText(d) ? ` · ${windowText(d)}` : ""}`
                          : "Not scheduled yet"}
                    </span>
                  </span>
                  <span
                    className={`inline-flex h-5 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium ${
                      d.status === "COMPLETED" ? "border-success-border bg-success-fill text-success-text" : "border-info-border bg-info-fill text-info-text"
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {d.status === "COMPLETED" ? (d.mode === "PICKUP" ? "Collected" : "Delivered") : d.deliverBy ? "Scheduled" : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {latest && (
          <Card title="Latest update">
            <p className="text-sm text-gray-900">{latest.message}</p>
            <p className="mt-1 text-xs text-gray-500">{when(latest.createdAt)}</p>
          </Card>
        )}

        <Card title="Your order">
          <ul className="flex flex-col gap-3">
            {order.items.map((item) => {
              const got = deliveredOf(item.id);
              const next = nextFor(item.id);
              return (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-900">
                      {item.qty} × {item.name}
                    </span>
                    {order.deliveries.length > 1 && item.physical && (
                      <span className={`block text-xs ${got >= item.qty ? "text-success-text" : "text-gray-500"}`}>
                        {got >= item.qty
                          ? "Delivered"
                          : [got ? `${got} delivered` : null, next ? `${item.qty - got} on ${next.deliverBy ? short(next.deliverBy) : "a later delivery"}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-gray-900">{money(item.amount)}</span>
                </li>
              );
            })}
          </ul>
          <dl className="mt-4 flex flex-col gap-2 border-t border-gray-150 pt-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <dt>Subtotal</dt>
              <dd className="font-mono">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-gray-600">
              <dt>Tax</dt>
              <dd className="font-mono">{money(order.tax)}</dd>
            </div>
            <div className="flex justify-between font-medium text-gray-900">
              <dt>Total</dt>
              <dd className="font-mono">{money(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-2 text-xs text-gray-600">
            <span
              className={`inline-flex h-5 items-center gap-1.5 rounded-sm border px-2 font-medium ${
                paid ? "border-success-border bg-success-fill text-success-text" : "border-warning-border bg-warning-fill text-warning-text"
              }`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {paid ? "Paid" : order.paid > 0 ? "Partly paid" : "Unpaid"}
            </span>
            {paid ? "Nothing left to pay" : `${money(balance)} left to pay`}
          </p>
        </Card>

        {(order.address || order.customerName) && (
          <Card title={s.done ? (order.deliveries.every((d) => d.mode === "PICKUP") ? "Collected by" : "Delivered to") : "Delivering to"}>
            <p className="flex items-start gap-2 text-sm text-gray-900">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gray-500" />
              <span>
                {order.customerName}
                {order.address && <span className="block">{order.address}</span>}
              </span>
            </p>
          </Card>
        )}

        <footer className="py-4 text-center text-xs text-gray-500">
          {order.company.phone && <p>Questions about your order? Call {order.company.phone}</p>}
          <p className="mt-1 text-gray-400">{order.company.name}</p>
        </footer>
      </main>
    </div>
  );
}
