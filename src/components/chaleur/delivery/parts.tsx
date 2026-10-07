"use client";

import { CalendarDays, Calendar as CalendarIcon, Check, Columns3, List, Truck, UserRound } from "lucide-react";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { COLUMN_COLOR, COLUMN_LABEL, initials, type Chip, type Column } from "./model";

export function StatusChip({ chip, className }: { chip: Chip; className?: string }) {
  return (
    <Badge variant={chip.variant} className={className}>
      <BadgeDot />
      {chip.label}
    </Badge>
  );
}

export function Avatar({ name, size = 20 }: { name: string | null | undefined; size?: 20 | 24 }) {
  const dims = size === 24 ? "size-6 text-[10px]" : "size-5 text-[9px]";
  if (!name) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400", dims)} aria-label="Unassigned">
        <UserRound className="size-3" />
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-sunken font-medium text-gray-700", dims)} aria-label={name} />}
      >
        {initials(name)}
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

/** The date line of a card. Late or delayed turns into a red pill; waiting for payment an amber one. */
export function WhenLine({ text, tone }: { text: string; tone?: "danger" | "warning" }) {
  if (!tone) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-600">
        <CalendarIcon className="size-3 shrink-0" />
        <span className="truncate">{text}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-5 min-w-0 items-center gap-1.5 rounded-full px-1.5 text-xs font-medium",
        tone === "danger" ? "bg-danger-fill text-danger-text" : "bg-warning-fill text-warning-text",
      )}
    >
      <CalendarIcon className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}

export function StageHeader({ column, count }: { column: Column; count: number }) {
  const color = COLUMN_COLOR[column];
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-2 rounded-md px-3"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 7%, transparent)` }}
    >
      <span className="text-base font-medium">{COLUMN_LABEL[column]}</span>
      <span className="text-xs text-gray-600 tabular-nums">{count}</span>
    </div>
  );
}

export type View = "board" | "list" | "calendar";

const VIEWS: { id: View; label: string; icon: typeof List }[] = [
  { id: "board", label: "Board", icon: Columns3 },
  { id: "list", label: "List", icon: List },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

export function ViewSwitch({ value, onChange }: { value: View; onChange: (view: View) => void }) {
  return (
    <div role="radiogroup" aria-label="View" className="flex items-center gap-0.5 rounded-md bg-sunken p-0.5">
      {VIEWS.map(({ id, label, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger
            render={
              <button
                type="button"
                role="radio"
                aria-checked={value === id}
                aria-label={label}
                onClick={() => onChange(id)}
                className={cn(
                  "flex h-7 items-center rounded-sm px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  value === id ? "bg-surface text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-800",
                )}
              />
            }
          >
            <Icon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Underlined text tabs, like the day chips in the design. */
export function TextTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { id: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.id ? "border-b-2 border-blue-700 text-blue-700" : "rounded-md text-gray-900 hover:bg-gray-100",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Pending → Preparing → Processing → Completed with the current step marked. */
export function Steps({ index, done, truck }: { index: number; done?: boolean; truck?: boolean }) {
  const steps = ["Pending", "Preparing", "Processing", "Completed"];
  return (
    <ol className="grid grid-cols-4">
      {steps.map((step, i) => {
        const reached = i <= index;
        const current = i === index;
        return (
          <li key={step} className="relative flex flex-col items-center gap-2">
            {i > 0 && (
              <span
                aria-hidden
                className={cn("absolute top-[5px] right-1/2 h-0.5 w-full", i <= index ? (done ? "bg-success-text" : "bg-gray-900") : "bg-gray-200")}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex size-3 items-center justify-center rounded-full",
                reached ? (done ? "bg-success-text" : "bg-gray-900") : "bg-gray-200",
                current && !done && truck && "size-3",
              )}
            >
              {done && current && <Check className="size-2 text-white" strokeWidth={4} />}
              {!done && current && truck && <Truck className="absolute size-2 text-white" />}
            </span>
            <span className={cn("text-xs", current ? "font-medium text-gray-900" : reached ? "text-gray-600" : "text-gray-400")}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
