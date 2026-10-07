import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** One setting: title and hint on the left, the control on the right. */
export function Row({
  title,
  hint,
  stacked,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex max-w-[720px] gap-6 border-b border-gray-150 py-4 last:border-b-0",
        stacked ? "flex-col gap-3" : "items-center justify-between",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        {hint && <div className="mt-0.5 text-xs text-gray-600">{hint}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex max-w-[720px] items-center gap-1.5 pb-4 text-xs text-danger-text">
      <AlertCircle className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

export function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.currentTarget.blur();
}

export type Note = { error?: boolean; text: string } | null;
