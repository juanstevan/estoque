import { Badge, BadgeDot } from "@/components/ui/badge";

/**
 * Domain statuses mapped onto the five meanings in DESIGN.md §2.3.
 * Anything new must map onto one of these — never a new colour.
 */
const STATUS: Record<
  string,
  { label: string; variant: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  PENDING: { label: "Pending", variant: "neutral" },
  DRAFT: { label: "Draft", variant: "neutral" },
  PREPARING: { label: "Preparing", variant: "info" },
  IN_TRANSIT: { label: "In transit", variant: "info" },
  TO_DELIVER: { label: "To deliver", variant: "info" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  DELAYED: { label: "Delayed", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "danger" },
  RECEIVED: { label: "Received", variant: "success" },
  CONFIRMED: { label: "Confirmed", variant: "success" },
  COMPLETED: { label: "Completed", variant: "success" },
  DELIVERED: { label: "Delivered", variant: "success" },
};

export function statusLabel(status: string) {
  return STATUS[status]?.label ?? status;
}

export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, variant: "neutral" as const };
  return (
    <Badge variant={entry.variant}>
      <BadgeDot />
      {entry.label}
    </Badge>
  );
}

/** Domestic / international is a category, not a status — only the dot carries hue. */
export function KindChip({ kind }: { kind: string }) {
  const international = kind === "INTERNATIONAL";
  return (
    <Badge variant="tag">
      <BadgeDot className={international ? "bg-blue-600" : "bg-gray-400"} />
      {international ? "International" : "Domestic"}
    </Badge>
  );
}
