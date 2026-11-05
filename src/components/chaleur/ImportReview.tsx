"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Change = { field: string; label: string; before: string | number | null; after: string | number };
export type PreviewRow = {
  rowNumber: number;
  sku: string;
  status: "new" | "existing" | "unchanged" | "invalid";
  errors: string[];
  existingId?: string;
  code?: string;
  name?: string;
  changes: Change[];
  data: unknown;
};

const MONEY = new Set(["cifCost", "b2bPrice", "b2cPrice"]);

function show(field: string, value: string | number | null) {
  if (value === null || value === "") return "—";
  if (typeof value === "number") return MONEY.has(field) ? value.toFixed(2) : String(value);
  return value;
}

/**
 * The spreadsheet's changes, product by product, old → new. Each product is ticked once checked;
 * Import turns on when every one is.
 */
export function ImportReview({ rows, onClose, onDone }: { rows: PreviewRow[]; onClose: () => void; onDone: () => void }) {
  const listed = rows.filter((row) => row.status === "existing" || row.status === "new");
  const invalid = rows.filter((row) => row.status === "invalid");
  const unchanged = rows.filter((row) => row.status === "unchanged").length;
  const columns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of listed) for (const c of row.changes) if (!seen.has(c.field)) seen.set(c.field, c.label);
    return [...seen];
  }, [listed]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = listed.length > 0 && listed.every((row) => checked.has(row.rowNumber));

  function toggle(rowNumber: number, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
  }

  async function confirm() {
    if (!all || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: listed, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't import the spreadsheet");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import the spreadsheet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[86vh] flex-col sm:max-w-[min(1100px,94vw)]">
        <DialogHeader>
          <DialogTitle>Review the spreadsheet</DialogTitle>
          <DialogDescription>
            {listed.length
              ? `${listed.length} ${listed.length === 1 ? "product changes" : "products change"}. Check each one to import.`
              : "Nothing in the spreadsheet differs from the system."}
            {unchanged ? ` ${unchanged} unchanged.` : ""}
          </DialogDescription>
        </DialogHeader>

        {invalid.length > 0 && (
          <ul className="max-h-24 overflow-y-auto rounded-md border border-danger-text/30 bg-danger-fill px-3 py-2 text-xs text-danger-text">
            {invalid.map((row) => (
              <li key={row.rowNumber}>
                Row {row.rowNumber}{row.sku.startsWith("(") ? "" : ` (${row.sku})`}: {row.errors.join(", ")}. Skipped.
              </li>
            ))}
          </ul>
        )}

        {listed.length > 0 && (
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-sunken text-left text-gray-600">
                <tr>
                  <th className="w-9 px-3 py-2" aria-label="Checked" />
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  {columns.map(([field, label]) => (
                    <th key={field} className="px-3 py-2 font-medium whitespace-nowrap">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listed.map((row) => {
                  const on = checked.has(row.rowNumber);
                  const byField = new Map(row.changes.map((c) => [c.field, c]));
                  return (
                    <tr
                      key={row.rowNumber}
                      className={cn("cursor-pointer border-t border-border hover:bg-gray-50", on && "bg-blue-50/50")}
                      onClick={() => toggle(row.rowNumber, !on)}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={on} onCheckedChange={(value) => toggle(row.rowNumber, Boolean(value))} aria-label={`Checked ${row.name ?? row.sku}`} className="size-4" />
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{row.code ?? "—"}</td>
                      <td className="max-w-64 truncate px-3 py-2 font-medium text-gray-900" title={row.name}>
                        {row.name ?? row.sku}
                      </td>
                      {row.status === "new" ? (
                        <td colSpan={Math.max(1, columns.length)} className="px-3 py-2 text-gray-600">
                          New product (SKU {row.sku})
                        </td>
                      ) : (
                        columns.map(([field]) => {
                          const c = byField.get(field);
                          return (
                            <td key={field} className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">
                              {c && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="text-gray-400 line-through decoration-gray-300">{show(field, c.before)}</span>
                                  <ArrowRight className="size-3 text-gray-400" aria-label="to" />
                                  <span className="font-medium text-gray-900">{show(field, c.after)}</span>
                                </span>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          {error ? (
            <span className="flex items-center gap-1.5 text-xs text-danger-text">
              <AlertCircle className="size-3.5 shrink-0" />
              {error}
            </span>
          ) : (
            <span className="text-xs text-gray-500 tabular-nums">
              {listed.length ? `${checked.size} of ${listed.length} checked` : ""}
            </span>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              {listed.length ? "Cancel" : "Close"}
            </Button>
            {listed.length > 0 && (
              <Button disabled={!all || busy} onClick={() => void confirm()}>
                {busy ? "Importing…" : "Import"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
