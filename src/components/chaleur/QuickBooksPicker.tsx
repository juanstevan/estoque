"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent } from "@/components/ui/popover";

export type QbItem = { id: string; name: string; sku: string; price: number };

let cache: Promise<QbItem[]> | null = null;

/** One fetch per session, shared by the product card and Settings. `fresh` refetches. */
export function loadQuickBooksItems(fresh = false) {
  if (!cache || fresh) {
    const request = fetch("/api/quickbooks/items").then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load QuickBooks items");
      return data.items as QbItem[];
    });
    request.catch(() => {
      if (cache === request) cache = null;
    });
    cache = request;
  }
  return cache;
}

/** Link a product to a QuickBooks item, or unlink it with null. Returns the stored link. */
export async function linkQuickBooks(productId: string, itemId: string | null) {
  const res = await fetch("/api/quickbooks/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, itemId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't link the product");
  return (data.secondarySku ?? null) as string | null;
}

/**
 * Make a linked product and its item the same: the app takes the item's details, QuickBooks
 * gets "ID - Name". Returns the item list with the item as QuickBooks now has it.
 */
export async function matchQuickBooks(productId: string) {
  const res = await fetch("/api/quickbooks/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, match: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't match the product");
  const item = data.item as QbItem;
  cache = loadQuickBooksItems().then((list) => list.map((row) => (row.id === item.id ? item : row)));
  return cache;
}

export function linkedItemId(secondarySku: string | null | undefined) {
  return secondarySku?.startsWith("qb:") ? secondarySku.slice(3) : null;
}

/**
 * Search QuickBooks items by name or SKU and pick one. The linked item sits on top with Unlink.
 * Items linked to another product show that product's ID and can't be picked.
 * `children` is the trigger: a PopoverTrigger, optionally wrapped in a Tooltip.
 */
export function QuickBooksPicker({
  children,
  itemId,
  takenBy,
  onPick,
}: {
  children: React.ReactNode;
  itemId: string | null;
  takenBy: Map<string, string>;
  onPick: (itemId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QbItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    loadQuickBooksItems().then(setItems, (e: Error) => setError(e.message));
  }, [open]);

  const current = items?.find((item) => item.id === itemId);
  const q = text.trim().toLowerCase();
  const shown = (items ?? [])
    .filter((item) => item.id !== itemId && (!q || `${item.name} ${item.sku}`.toLowerCase().includes(q)))
    .slice(0, 40);

  async function pick(id: string | null) {
    setBusy(true);
    setError("");
    try {
      await onPick(id);
      setText("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't link the product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {children}
      <PopoverContent align="start" className="w-80 gap-1 p-2">
        {current && (
          <div className="flex items-center gap-2 rounded-sm bg-gray-50 px-2 py-1.5">
            <Link2 className="size-3.5 shrink-0 text-success-text" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{current.name}</div>
              {current.sku && <div className="truncate text-xs text-gray-500">{current.sku}</div>}
            </div>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void pick(null)}>
              Unlink
            </Button>
          </div>
        )}
        <Input
          autoFocus
          value={text}
          placeholder="Search QuickBooks by name or SKU"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="max-h-56 overflow-auto">
          {shown.map((item) => {
            const taken = takenBy.get(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy || Boolean(taken)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                onClick={() => void pick(item.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.name}</span>
                  {item.sku && <span className="block truncate text-xs text-gray-500">{item.sku}</span>}
                </span>
                {taken && <span className="shrink-0 font-mono text-xs text-gray-500">{taken}</span>}
              </button>
            );
          })}
          {!items && !error && <p className="px-2 py-1.5 text-xs text-gray-500">Loading…</p>}
          {items && !shown.length && <p className="px-2 py-1.5 text-xs text-gray-500">Nothing matches.</p>}
        </div>
        {error && (
          <p className="flex items-center gap-1.5 px-2 py-1 text-xs text-danger-text">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
