"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload, uploadPresigned } from "@vercel/blob/client";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  Minus,
  Package,
  Plus,
  ScanBarcode,
  Split,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PHOTO_TYPES } from "@/lib/photos/name";
import { cn } from "@/lib/utils";
import {
  DELAY_REASONS,
  MODE_COLOR,
  addDays,
  dayDate,
  mediumDay,
  nyDay,
  post,
  prepared,
  todayDay,
  weekStart,
  type Delivery,
  type Detail,
  type Mode,
  type Order,
} from "./model";

/** A delivery's lines with their products. */
export function linesOf(order: Pick<Order, "lines">, d: Pick<Delivery, "lines">) {
  const byId = new Map(order.lines.map((line) => [line.id, line]));
  return d.lines.flatMap((row) => {
    const line = byId.get(row.orderLineId);
    return line ? [{ ...row, line }] : [];
  });
}

function Heading({ title, order }: { title: string; order: Order }) {
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        {order.externalRef} · {order.customerName || "No customer"}
      </DialogDescription>
    </DialogHeader>
  );
}

function Problem({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-xs text-danger-text">
      <AlertCircle className="mt-px size-3.5 shrink-0" />
      {text}
    </p>
  );
}

function Progress({ done, all }: { done: number; all: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1 w-40 overflow-hidden rounded-xs bg-gray-150">
        <div className="h-1 rounded-xs bg-primary" style={{ width: `${all ? (100 * done) / all : 0}%` }} />
      </div>
      <span className="font-mono text-sm text-gray-600 tabular-nums">
        {done} of {all} units
      </span>
    </div>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 items-center rounded-md border border-border">
        <Button size="icon-sm" variant="ghost" aria-label={`One less ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
          <Minus />
        </Button>
        <input
          aria-label={label}
          inputMode="numeric"
          className="w-8 bg-transparent text-center font-mono text-sm tabular-nums outline-none"
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value.replace(/\D/g, ""));
            onChange(Math.max(0, Math.min(max, next)));
          }}
        />
        <Button size="icon-sm" variant="ghost" aria-label={`One more ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus />
        </Button>
      </div>
      <span className="w-10 text-xs text-gray-500">of {max}</span>
    </div>
  );
}

function ItemName({ name, code, sku }: { name: string; code: string; sku: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm text-gray-900">{name}</div>
      <div className="truncate font-mono text-xs text-gray-500">
        {code} · {sku}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- manual preparation

export function PrepareDialog({
  order,
  delivery,
  onClose,
  onDone,
  onProcess,
}: {
  order: Order;
  delivery: Delivery;
  onClose: () => void;
  onDone: (detail: Detail) => void;
  onProcess: () => void;
}) {
  const rows = linesOf(order, delivery);
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.id, r.preparedQty])));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const done = rows.reduce((sum, r) => sum + Math.min(counts[r.id] ?? 0, r.qty), 0);
  const all = rows.reduce((sum, r) => sum + r.qty, 0);

  async function save(then?: () => void) {
    setSaving(true);
    setError("");
    try {
      onDone(await post({ action: "prepare", deliveryId: delivery.id, counts }));
      (then ?? onClose)();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the counts");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <Heading title="Count the items" order={order} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600">Type how many units of each product you took from the shelf.</p>
          <Button size="sm" variant="ghost" onClick={() => setCounts(Object.fromEntries(rows.map((r) => [r.id, r.qty])))}>
            Took everything
          </Button>
        </div>
        <ul className="-mx-1 flex max-h-[50vh] flex-col overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-gray-150 px-1 py-3 last:border-b-0">
              {(counts[r.id] ?? 0) >= r.qty ? (
                <CircleCheck className="size-4 shrink-0 text-success-text" />
              ) : (
                <Circle className="size-4 shrink-0 text-gray-300" />
              )}
              <ItemName name={r.line.product.name} code={r.line.product.code} sku={r.line.product.sku} />
              <Stepper
                label={r.line.product.name}
                value={counts[r.id] ?? 0}
                max={r.qty}
                onChange={(value) => setCounts((c) => ({ ...c, [r.id]: value }))}
              />
            </li>
          ))}
        </ul>
        <Problem text={error} />
        <DialogFooter className="sm:justify-between">
          <Progress done={done} all={all} />
          <div className="flex gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => void save()}>
              Done
            </Button>
            <Button disabled={saving || done < all} onClick={() => void save(onProcess)}>
              Move to processing
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- scanning

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* sound is optional */
  }
}

export function ScanDialog({
  order,
  delivery,
  onClose,
  onDone,
  onProcess,
}: {
  order: Order;
  delivery: Delivery;
  onClose: () => void;
  onDone: (detail: Detail) => void;
  onProcess: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const scanId = useRef("");
  const lastCode = useRef("");
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; lineId?: string } | null>(null);
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const rows = linesOf(order, delivery);
  const { done, all } = prepared(delivery);
  const todo = rows.filter((r) => r.preparedQty < r.qty);
  const scanned = rows.filter((r) => r.preparedQty > 0);

  useEffect(() => input.current?.focus(), [delivery]);

  async function submit(value: string) {
    const next = value.trim();
    if (!next) return;
    // A retry of the same code reuses its id, so a lost response never counts twice.
    if (next !== lastCode.current) scanId.current = crypto.randomUUID();
    lastCode.current = next;
    try {
      const detail = await post({ action: "scan", deliveryId: delivery.id, code: next, scanId: scanId.current });
      scanId.current = "";
      lastCode.current = "";
      const d = detail.deliveries.find((x) => x.id === delivery.id);
      const hit = d && linesOf(detail, d).find((r) => [r.line.product.sku, r.line.product.ean, r.line.product.code, r.line.product.secondarySku].includes(next));
      setFeedback({ ok: true, text: hit ? `Scanned ${hit.line.product.name} · ${hit.preparedQty} of ${hit.qty}` : `Scanned ${next}`, lineId: hit?.id });
      beep(true);
      onDone(detail);
      setCode("");
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : "Scan failed" });
      beep(false);
    }
    input.current?.focus();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <Heading title="Scan products" order={order} />
        <div className="relative">
          <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary" />
          <Input
            ref={input}
            autoFocus
            aria-label="Scan or type a code"
            className="h-10 border-blue-500 pr-16 pl-10 text-base"
            placeholder="Scan or type a code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit(code);
              }
            }}
          />
          <kbd className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">Enter</kbd>
        </div>
        {feedback && (
          <div
            role="status"
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm",
              feedback.ok ? "border-success-border bg-success-fill text-success-text" : "border-danger-border bg-danger-fill text-danger-text",
            )}
          >
            {feedback.ok ? <CircleCheck className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
            <span className="min-w-0 flex-1">{feedback.text}</span>
            {feedback.ok && feedback.lineId && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium hover:underline"
                onClick={() =>
                  void post({ action: "unscan", deliveryId: delivery.id, lineId: feedback.lineId }).then((detail) => {
                    onDone(detail);
                    setFeedback(null);
                    input.current?.focus();
                  })
                }
              >
                <Undo2 className="size-3.5" /> Undo
              </button>
            )}
          </div>
        )}
        <div role="tablist" className="flex w-fit gap-0.5 rounded-md bg-sunken p-0.5">
          {(
            [
              ["todo", `To scan ${todo.length}`],
              ["done", `Scanned ${scanned.length}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("h-7 rounded-sm px-2.5 text-sm font-medium", tab === id ? "bg-surface text-gray-900 shadow-xs" : "text-gray-500")}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="flex max-h-[40vh] flex-col overflow-y-auto">
          {(tab === "todo" ? todo : scanned).map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-gray-150 py-3 last:border-b-0">
              {r.preparedQty >= r.qty ? (
                <CircleCheck className="size-4 shrink-0 text-success-text" />
              ) : r.preparedQty > 0 ? (
                <ScanBarcode className="size-4 shrink-0 text-primary" />
              ) : (
                <Circle className="size-4 shrink-0 text-gray-300" />
              )}
              <ItemName name={r.line.product.name} code={r.line.product.code} sku={r.line.product.sku} />
              <span className="font-mono text-sm tabular-nums text-gray-900">
                {r.preparedQty}/{r.qty}
              </span>
            </li>
          ))}
          {!(tab === "todo" ? todo : scanned).length && (
            <li className="py-6 text-center text-sm text-gray-500">{tab === "todo" ? "Everything is scanned." : "Nothing scanned yet."}</li>
          )}
        </ul>
        <DialogFooter className="sm:justify-between">
          <Progress done={done} all={all} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button disabled={done < all} onClick={onProcess}>
              Move to processing
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Delivery or Collect

export function ProcessingTypeDialog({
  order,
  delivery,
  unpaidCollectOnly,
  onClose,
  onDone,
}: {
  order: Order;
  delivery: Delivery;
  unpaidCollectOnly: boolean;
  onClose: () => void;
  onDone: (detail: Detail) => void;
}) {
  const [mode, setMode] = useState<Mode>(unpaidCollectOnly ? "PICKUP" : delivery.mode);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const options: { id: Mode; title: string; hint: string }[] = [
    { id: "DELIVERY", title: "Delivery", hint: unpaidCollectOnly ? "Not while the invoice is unpaid." : "We take it to the customer." },
    { id: "PICKUP", title: "Collect", hint: "The customer picks it up at the warehouse." },
  ];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[360px]" showCloseButton={false}>
        <DialogTitle>How does {order.externalRef} leave?</DialogTitle>
        <div role="radiogroup" className="flex flex-col gap-2">
          {options.map((option) => {
            const disabled = option.id === "DELIVERY" && unpaidCollectOnly;
            return (
              <label key={option.id} className={cn("flex items-stretch gap-0", disabled && "opacity-50")}>
                <span className="w-1 shrink-0 rounded-l-sm" style={{ background: MODE_COLOR[option.id] }} />
                <span
                  className={cn(
                    "flex flex-1 cursor-pointer items-start gap-3 rounded-r-lg border border-l-0 px-3 py-3",
                    mode === option.id ? "border-[var(--mode)] bg-[color-mix(in_srgb,var(--mode)_6%,white)]" : "border-border",
                  )}
                  style={{ "--mode": MODE_COLOR[option.id] } as React.CSSProperties}
                >
                  <input
                    type="radio"
                    name="processing-type"
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                    checked={mode === option.id}
                    disabled={disabled}
                    onChange={() => setMode(option.id)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{option.title}</span>
                    <span className="block text-xs text-gray-600">{option.hint}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <Problem text={error} />
        <Button
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void post({ action: "move", deliveryId: delivery.id, status: "TO_DELIVER", mode }).then(
              (detail) => {
                onDone(detail);
                onClose();
              },
              (e: Error) => {
                setError(e.message);
                setSaving(false);
              },
            );
          }}
        >
          Move to Processing
        </Button>
        <p className="text-xs text-gray-600">You can switch it later in the order’s Processing field.</p>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- completion

type Slot = { key: string; name: string; progress: number; error?: string };

async function uploadProof(file: File, deliveryId: string, kind: "delivery" | "signed", onProgress: (p: number) => void): Promise<Detail> {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new Error("Use a JPG, PNG, WebP, AVIF or GIF photo");
  const { storage } = await fetch("/api/photos/upload").then((r) => r.json());
  if (storage === "local") {
    const form = new FormData();
    form.set("deliveryId", deliveryId);
    form.set("kind", kind);
    form.set("file", file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/orders");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 400) reject(new Error(data.error || "Upload failed"));
        else resolve(data);
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(form);
    });
  }
  const send = storage === "oidc" ? uploadPresigned : upload;
  const blob = await send(`proofs/${deliveryId}/${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/photos/upload",
    contentType: file.type,
    onUploadProgress: (e) => onProgress(e.percentage / 100),
  });
  return post({ action: "proof", deliveryId, url: blob.url, kind });
}

export function CompleteDialog({
  order,
  delivery,
  stockOutNow,
  onClose,
  onDone,
}: {
  order: Order;
  delivery: Delivery & { proofs?: { id: string; kind: string }[] };
  stockOutNow: boolean;
  onClose: () => void;
  onDone: (detail: Detail, closed?: boolean) => void;
}) {
  const pickup = delivery.mode === "PICKUP";
  const kind = pickup ? "signed" : "delivery";
  const fileRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [proofs, setProofs] = useState((delivery.proofs ?? []).filter((p) => p.kind === kind));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = linesOf(order, delivery);
  const unitsOut = rows.reduce((sum, r) => sum + r.qty, 0);

  function sync(detail: Detail) {
    onDone(detail);
    const d = detail.deliveries.find((x) => x.id === delivery.id);
    setProofs((d?.proofs ?? []).filter((p) => p.kind === kind));
  }

  function add(files: File[]) {
    for (const file of files) {
      const key = crypto.randomUUID();
      setSlots((s) => [...s, { key, name: file.name, progress: 0 }]);
      void uploadProof(file, delivery.id, kind, (progress) =>
        setSlots((s) => s.map((slot) => (slot.key === key ? { ...slot, progress } : slot))),
      ).then(
        (detail) => {
          setSlots((s) => s.filter((slot) => slot.key !== key));
          sync(detail);
        },
        (e: Error) => setSlots((s) => s.map((slot) => (slot.key === key ? { ...slot, error: e.message } : slot))),
      );
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <Heading title={pickup ? "Complete collection" : "Complete delivery"} order={order} />
        <p className="text-sm text-gray-600">
          {pickup ? "Add a photo of the invoice signed by the person collecting it." : "Add at least one photo of the items at the door."}
        </p>
        <div className="grid grid-cols-4 gap-3">
          {proofs.map((proof) => (
            <div key={proof.id} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              {/* Staff previews go through the signed-in proof route. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Delivery photo" className="size-full object-cover" src={`/api/orders/file?id=${proof.id}`} />
              <Button
                size="icon-xs"
                variant="secondary"
                aria-label="Remove photo"
                className="absolute top-1.5 right-1.5 rounded-full"
                onClick={() => void post({ action: "remove-proof", proofId: proof.id }).then(sync, (e: Error) => setError(e.message))}
              >
                <X />
              </Button>
            </div>
          ))}
          {slots.map((slot) => (
            <div key={slot.key} className="relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-gray-50 p-3 text-center">
              {slot.error ? (
                <>
                  <span className="text-xs text-danger-text">{slot.error}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Dismiss"
                    className="absolute top-1 right-1"
                    onClick={() => setSlots((all) => all.filter((x) => x.key !== slot.key))}
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-700 tabular-nums">{Math.round(slot.progress * 100)}%</span>
                  <div className="h-1 w-full overflow-hidden rounded-xs bg-gray-150">
                    <div className="h-1 bg-primary" style={{ width: `${slot.progress * 100}%` }} />
                  </div>
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Camera className="size-5 text-gray-500" />
            Add photo
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-note">Note to the customer</Label>
          <Textarea id="customer-note" value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-gray-600">Shown on their tracking page.</p>
        </div>
        <p className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
          <Package className="size-4 shrink-0" />
          {stockOutNow
            ? `Completing takes ${unitsOut} ${unitsOut === 1 ? "unit" : "units"} out of stock.`
            : "These units already left stock."}
        </p>
        <Problem text={error} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !proofs.length || slots.some((s) => !s.error)}
            onClick={() => {
              setBusy(true);
              void post({ action: "complete", deliveryId: delivery.id, note }).then(
                (detail) => {
                  onDone(detail, true);
                  onClose();
                },
                (e: Error) => {
                  setError(e.message);
                  setBusy(false);
                },
              );
            }}
          >
            {busy ? "Saving…" : pickup ? "Complete collection" : "Complete delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- delay

export function DelayDialog({
  order,
  delivery,
  onClose,
  onDone,
}: {
  order: Order;
  delivery: Delivery;
  onClose: () => void;
  onDone: (detail: Detail) => void;
}) {
  const [reason, setReason] = useState(delivery.delayReason ?? "reschedule");
  const before = nyDay(delivery.deliverBy);
  const [date, setDate] = useState(before);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <Heading title={delivery.mode === "PICKUP" ? "Delay collection" : "Delay delivery"} order={order} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-gray-700">Reason</legend>
          {DELAY_REASONS.map((r) => (
            <label key={r.id} className="flex h-7 cursor-pointer items-center gap-3 text-sm text-gray-900">
              <input type="radio" name="delay-reason" className="size-4 accent-[var(--primary)]" checked={reason === r.id} onChange={() => setReason(r.id)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delay-date">New date</Label>
          <div className="flex items-center gap-3">
            {before && <span className="text-sm text-gray-400 line-through">{mediumDay(before)}</span>}
            {before && <ArrowRight className="size-4 text-gray-400" />}
            <Input id="delay-date" type="date" className="w-48" value={date} min={todayDay()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delay-note">Message to the customer</Label>
          <Textarea id="delay-note" value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-gray-600">Shown on their tracking page. Leave empty to keep it internal.</p>
        </div>
        <Problem text={error} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              void post({ action: "delay", deliveryId: delivery.id, reason, date: date || null, note }).then(
                (detail) => {
                  onDone(detail);
                  onClose();
                },
                (e: Error) => setError(e.message),
              )
            }
          >
            {delivery.mode === "PICKUP" ? "Delay collection" : "Delay delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- split

export function SplitDialog({
  order,
  delivery,
  onClose,
  onDone,
}: {
  order: Order;
  delivery: Delivery;
  onClose: () => void;
  onDone: (detail: Detail) => void;
}) {
  const rows = linesOf(order, delivery);
  const [keep, setKeep] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.id, Math.min(r.preparedQty, r.qty)])));
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const kept = rows.reduce((sum, r) => sum + (keep[r.id] ?? 0), 0);
  const all = rows.reduce((sum, r) => sum + r.qty, 0);
  const next = Math.max(...order.deliveries.map((d) => d.number)) + 1;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <Heading title="Split delivery" order={order} />
        <p className="text-sm text-gray-600">Choose what goes in this delivery. Everything else stays reserved for the next one and is not taken out of stock.</p>
        <div>
          <div className="flex border-b border-gray-150 pb-2 text-xs text-gray-600">
            <span className="flex-1">Item</span>
            <span className="w-44 text-center">This delivery</span>
            <span className="w-16 text-right">Reserved</span>
          </div>
          <ul className="flex max-h-[40vh] flex-col overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-b border-gray-150 py-3">
                <ItemName name={r.line.product.name} code={r.line.product.code} sku={r.line.product.sku} />
                <div className="flex w-44 justify-center">
                  <Stepper label={r.line.product.name} value={keep[r.id] ?? 0} max={r.qty} onChange={(value) => setKeep((k) => ({ ...k, [r.id]: value }))} />
                </div>
                <span className="w-16 text-right font-mono text-sm tabular-nums text-gray-900">{r.qty - (keep[r.id] ?? 0) || "–"}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-900">
          <Split className="size-4 shrink-0 text-gray-600" />
          Delivery {delivery.number}: {kept} of {all} units. Delivery {next}: {all - kept} {all - kept === 1 ? "unit stays" : "units stay"} reserved.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="split-date">Schedule delivery {next}</Label>
          <Input id="split-date" type="date" className="w-48" value={date} min={todayDay()} onChange={(e) => setDate(e.target.value)} />
          <p className="text-xs text-gray-600">Optional. You can also set it later from the order.</p>
        </div>
        <Problem text={error} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!kept || kept === all}
            onClick={() =>
              void post({ action: "split", deliveryId: delivery.id, keep, date: date || null }).then(
                (detail) => {
                  onDone(detail);
                  onClose();
                },
                (e: Error) => setError(e.message),
              )
            }
          >
            Split delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- schedule

/** Month picker with a dot under days that already have deliveries, and a time window. */
export function SchedulePicker({
  delivery,
  busyDays,
  onSave,
}: {
  delivery: Delivery;
  busyDays: Set<string>;
  onSave: (input: { date: string | null; windowStart: string | null; windowEnd: string | null }) => Promise<void>;
}) {
  const initial = nyDay(delivery.deliverBy);
  const [day, setDay] = useState(initial);
  const [month, setMonth] = useState((initial || todayDay()).slice(0, 7));
  const [start, setStart] = useState(delivery.windowStart ?? "");
  const [end, setEnd] = useState(delivery.windowEnd ?? "");
  const [error, setError] = useState("");
  const today = todayDay();
  const first = `${month}-01`;
  const gridStart = weekStart(first);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const title = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(dayDate(first));
  const shift = (n: number) => {
    const d = dayDate(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };

  return (
    <div className="flex w-[296px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <div className="flex">
          <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-xs text-gray-500">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const inMonth = d.startsWith(month);
          const picked = d === day;
          return (
            <button
              key={d}
              type="button"
              aria-label={mediumDay(d)}
              aria-pressed={picked}
              onClick={() => setDay(d)}
              className={cn(
                "relative mx-auto flex size-9 flex-col items-center justify-center rounded-md text-sm tabular-nums",
                picked ? "bg-primary text-white" : d === today ? "text-blue-700 ring-1 ring-blue-600 ring-inset" : inMonth ? "text-gray-900 hover:bg-gray-100" : "text-gray-400 hover:bg-gray-50",
              )}
            >
              {Number(d.slice(8))}
              {busyDays.has(d) && <span className={cn("absolute bottom-1 size-1 rounded-full", picked ? "bg-white" : "bg-gray-400")} />}
            </button>
          );
        })}
      </div>
      <div className="border-t border-gray-150 pt-3">
        <span className="text-xs text-gray-600">Time window</span>
        <div className="mt-1.5 flex items-center gap-2">
          <Input type="time" aria-label="From" className="w-full" value={start} step={900} onChange={(e) => setStart(e.target.value)} />
          <span className="text-gray-400">–</span>
          <Input type="time" aria-label="To" className="w-full" value={end} step={900} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <Problem text={error} />
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => void onSave({ date: null, windowStart: null, windowEnd: null }).catch((e: Error) => setError(e.message))}
        >
          Clear date
        </Button>
        <Button
          disabled={!day}
          onClick={() => void onSave({ date: day, windowStart: start || null, windowEnd: end || null }).catch((e: Error) => setError(e.message))}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
