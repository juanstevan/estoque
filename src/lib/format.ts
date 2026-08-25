export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatQty(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value || 0,
  );
}

export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short" }).format(d);
}

export function formatDayMonth(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short" }).format(
    d,
  );
}

export const YEAR_COLORS: Record<string, string> = {
  "2024": "#22c55e",
  "2025": "#3b82f6",
  "2026": "#ef4444",
  "2027": "#a855f7",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  SOLD: "Invoice",
  RESERVED: "Reserved",
  RELEASED: "Released",
  PICKED_UP: "Picked up",
  DELIVERED: "Delivered",
  ADJUSTMENT: "Adjust",
  CORRECTION: "Correction",
  RETURNED: "Return",
  TRANSFER: "Transfer",
  IMPORTATION: "Import",
};
