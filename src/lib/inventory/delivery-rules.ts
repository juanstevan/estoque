/**
 * Delivery rules, free of the database so they can be checked on their own.
 * Stock: reserved when an invoice is added to the workflow, taken out per delivery at the stage
 * chosen in Preferences (ready, out for delivery, or completed). Delays never move stock.
 */

export type ScanProduct = {
  id: string;
  sku: string;
  ean?: string | null;
  code?: string | null;
  secondarySku?: string | null;
};

export type StockStage = "ready" | "out" | "completed";

export type DeliveryPrefs = {
  stockStage: StockStage;
  allowPaid: boolean;
  allowUnpaid: boolean;
  collectUnpaid: boolean;
  prepMethod: "manual" | "scan";
  trackingDays: number;
};

export const DEFAULT_PREFS: DeliveryPrefs = {
  stockStage: "completed",
  allowPaid: true,
  allowUnpaid: true,
  collectUnpaid: true,
  prepMethod: "manual",
  trackingDays: 7,
};

const NONPHYSICAL = /shipping|freight|delivery fee|service|discount|sales tax|fee/i;

export function isPhysicalLine(name: string | null | undefined) {
  return !NONPHYSICAL.test(name ?? "");
}

export function matchScan(code: string, products: ScanProduct[]) {
  const scanned = code.trim();
  if (!scanned) return { error: "The scan was empty." };
  const hits = products.filter((product) =>
    [product.sku, product.ean, product.code, product.secondarySku].some((value) => value != null && value === scanned),
  );
  if (!hits.length) return { error: `No product on this delivery has the code ${scanned}.` };
  if (hits.length > 1) return { error: `${scanned} matches more than one product.` };
  return { productId: hits[0]!.id };
}

export function preparationDone(lines: { qty: number; preparedQty: number }[]) {
  return lines.every((line) => line.preparedQty >= line.qty);
}

/** Where a delayed delivery stands: the stage it was delayed from. */
export function stageOf(delivery: { status: string; priorStatus?: string | null }) {
  return delivery.status === "DELAYED" ? delivery.priorStatus || "PENDING" : delivery.status;
}

const RANK: Record<string, number> = { PENDING: 0, PREPARING: 1, TO_DELIVER: 2, IN_TRANSIT: 3, COMPLETED: 4 };

/** The status at which a delivery's units leave stock. */
export function stockLeavesAt(stage: StockStage, mode: string) {
  if (stage === "ready") return "TO_DELIVER";
  if (stage === "out" && mode !== "PICKUP") return "IN_TRANSIT";
  return "COMPLETED";
}

/** True once a delivery at `status` should have its units out of stock. */
export function stockShouldBeOut(stage: StockStage, mode: string, status: string) {
  return (RANK[status] ?? -1) >= RANK[stockLeavesAt(stage, mode)]!;
}

export function isPaid(order: { paymentStatus?: string | null }) {
  return order.paymentStatus === "Paid";
}

/** Why an invoice can't enter the workflow yet, if it can't. */
export function workflowError(order: { paymentStatus?: string | null; voided?: boolean }, prefs: DeliveryPrefs) {
  if (order.voided) return "This invoice is voided.";
  if (isPaid(order)) {
    return prefs.allowPaid ? null : "Paid invoices are turned off in Settings › Preferences › Delivery.";
  }
  if (prefs.allowUnpaid || prefs.collectUnpaid) return null;
  return "Waiting for payment. Unpaid invoices are turned off in Settings › Preferences › Delivery.";
}

/** Unpaid invoices may only be collected when unpaid deliveries are off. */
export function modeError(order: { paymentStatus?: string | null }, prefs: DeliveryPrefs, mode: string) {
  if (mode !== "DELIVERY" || isPaid(order) || prefs.allowUnpaid) return null;
  return "This invoice isn't paid yet, so it can only be collected. The customer pays at pickup.";
}

export const PREP_INCOMPLETE = "Preparation isn't finished. Every unit needs to be counted first.";

export function moveError(input: {
  from: string;
  to: string;
  mode: string;
  prepared: boolean;
  dispatched: boolean;
  stockedOut: boolean;
}) {
  const { from, to } = input;
  if (from === "COMPLETED") return "This delivery is already completed.";
  if (to === from) return null;
  if (to === "COMPLETED") return input.mode === "PICKUP" ? "Use Complete collection." : "Use Complete delivery.";
  if (to === "DELAYED") return "Mark it delayed with a reason.";
  if (RANK[to] == null || RANK[from] == null) return "That stage isn't available.";
  if (to === "IN_TRANSIT") {
    if (input.mode === "PICKUP") return "Collections don't go out. Complete it when the customer picks it up.";
    if (from !== "TO_DELIVER") return "Move it to processing first.";
  }
  if ((to === "TO_DELIVER" || to === "IN_TRANSIT") && !input.prepared) return PREP_INCOMPLETE;
  if (RANK[to]! < RANK[from]!) {
    if (input.dispatched) return "It's already out for delivery. Mark it delayed if something went wrong.";
    if (input.stockedOut) return "Its units already left stock, so it can't go back.";
  }
  return null;
}
