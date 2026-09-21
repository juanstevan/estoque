import { readFileSync, statSync } from "fs";
import { addMonths, format, startOfMonth } from "date-fns";
import * as xlsx from "xlsx";

const ORDERS_PATH =
  process.env.REPORTS_ORDERS_PATH ||
  "/Users/juanstevan/Desktop/dash/data/retail/orders.xlsx";

const SELLER_ALIAS: Record<string, string> = {
  fabio: "Fabio Sabino",
  "fabio sabino": "Fabio Sabino",
  juan: "Juan Stevan",
  "juan stevan": "Juan Stevan",
  watson: "Watson Souza",
  "watson souza": "Watson Souza",
  sidney: "Sidney Araujo",
  "sidney araujo": "Sidney Araujo",
};

/** Months of cover the buyer planned to hold. From Produtos.xlsx: IDEAL = MÉDIA × 6. */
const COVER_MONTHS = 6;
/** MediaMes.ipynb averages the last 18 months that had stock or sales. */
const CALC_MONTHS = 18;
const FORECAST_MONTHS = 6;

export type SaleRow = {
  date: string;
  invoice: string;
  client: string;
  seller: string;
  sku: string;
  item: string;
  qty: number;
  price: number;
  total: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  sku: string;
  skus: string[];
};

export type MonthKind =
  | "normal"
  | "no_inventory"
  | "unknown"
  | "stock_constrained"
  | "future";

export type MonthPoint = {
  month: string;
  sales: number | null;
  forecast: number | null;
  kind: MonthKind;
  included: boolean;
  reason: string | null;
};

export type SupplyReport = {
  product: CatalogProduct;
  updatedAt: string;
  sourceNote: string;
  displayLabel: string;
  calcLabel: string;
  stock: { physical: number | null; available: number | null };
  average: number | null;
  recent: number | null;
  recentLabel: string | null;
  forecastMonthly: number | null;
  forecastNote: string;
  coefficient: number | null;
  status: string | null;
  suggested: number | null;
  suggestedNote: string;
  prices: { avg: number | null; last: number | null; low: number | null; high: number | null };
  months: MonthPoint[];
  customers: { name: string; qty: number; share: number }[];
  invoices: {
    date: string;
    invoice: string;
    client: string;
    seller: string;
    qty: number;
    price: number;
    total: number;
  }[];
};

type Cache = {
  mtimeMs: number;
  updatedAt: string;
  rows: SaleRow[];
  products: CatalogProduct[];
  byId: Map<string, SaleRow[]>;
  sellers: string[];
  clients: string[];
};

let cache: Cache | null = null;

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sellerName(value: string) {
  const key = value.toLowerCase();
  return SELLER_ALIAS[key] || value;
}

export function itemKey(item: string) {
  return item
    .replace(/^\d+\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function displayName(item: string) {
  return item.replace(/^\d+\s*-\s*/, "").replace(/\s+/g, " ").trim();
}

function isSellable(sku: string, item: string) {
  const blob = `${sku} ${item}`.toLowerCase();
  if (!item.trim()) return false;
  return !/late fee|flat fee|freight|shipping|discount|sales tax/.test(blob);
}

function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function loadRows(): Cache {
  const st = statSync(ORDERS_PATH);
  if (cache && cache.mtimeMs === st.mtimeMs) return cache;
  const wb = xlsx.read(readFileSync(ORDERS_PATH), { cellDates: false });
  const sheet = wb.Sheets.ORDERS ?? wb.Sheets[wb.SheetNames[0]];
  const raw = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    dateNF: "yyyy-mm-dd",
    defval: "",
  });
  const rows: SaleRow[] = [];
  for (const row of raw) {
    const item = clean(row.ITEM);
    const sku = clean(row.SKU);
    const date = clean(row.DATA).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isSellable(sku, item)) continue;
    rows.push({
      date,
      invoice: clean(row.INVOICE),
      client: clean(row.CLIENTE) || "Unknown",
      seller: sellerName(clean(row.SELLER)) || "Unassigned",
      sku,
      item,
      qty: num(row.QNT),
      price: num(row.PRECO),
      total: num(row.TOTAL),
    });
  }

  const groups = new Map<string, SaleRow[]>();
  for (const row of rows) {
    const id = itemKey(row.item);
    if (!id) continue;
    const list = groups.get(id) ?? [];
    list.push(row);
    groups.set(id, list);
  }

  const products: CatalogProduct[] = [];
  for (const [id, list] of groups) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const latest = ordered.at(-1)!;
    const skus = [...new Set(ordered.map((r) => r.sku).filter(Boolean))];
    const latestSku = latest.sku || skus.at(-1) || "";
    products.push({
      id,
      name: displayName(latest.item),
      sku: latestSku,
      skus: [latestSku, ...skus.filter((s) => s !== latestSku)],
    });
  }
  products.sort((a, b) => a.name.localeCompare(b.name));

  cache = {
    mtimeMs: st.mtimeMs,
    updatedAt: st.mtime.toISOString(),
    rows,
    products,
    byId: groups,
    sellers: [...new Set(rows.map((r) => r.seller))].filter(Boolean).sort(),
    clients: [...new Set(rows.map((r) => r.client))].filter(Boolean).sort(),
  };
  return cache;
}

export function reportsIndex(force = false) {
  if (force) cache = null;
  const data = loadRows();
  return {
    updatedAt: data.updatedAt,
    products: data.products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      skus: p.skus,
    })),
    sellers: data.sellers,
    clients: data.clients,
    invoices: new Set(data.rows.map((r) => r.invoice)).size,
    sourceNote:
      "Sales history is the QuickBooks orders export. This app’s live sync only requests the last 7 days, so the export is the source. Historical monthly inventory is not in that file.",
  };
}

export function rowsFor(productId: string) {
  return loadRows().byId.get(productId) ?? [];
}

export function findProduct(productId: string) {
  return loadRows().products.find((p) => p.id === productId) ?? null;
}

function monthKey(date: Date) {
  return format(date, "yyyy-MM");
}

function parseMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function monthsBetween(start: Date, end: Date) {
  const out: string[] = [];
  let cursor = startOfMonth(start);
  const last = startOfMonth(end);
  while (cursor <= last) {
    out.push(monthKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export function displayRange(
  period: string,
  from: string | null,
  to: string | null,
  today = new Date(),
) {
  const end = startOfMonth(today);
  if (period === "ytd") return { start: new Date(today.getFullYear(), 0, 1), end };
  if (period === "custom" && from && to) {
    return { start: startOfMonth(new Date(from)), end: startOfMonth(new Date(to)) };
  }
  const n = Number(period) || 12;
  return { start: addMonths(end, 1 - n), end };
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

function statusFor(coef: number) {
  if (coef === 0) return "Out";
  if (coef > 18) return "Frozen";
  if (coef > 9) return "Cold";
  if (coef > 6) return "High";
  if (coef >= 4) return "Healthy";
  return "Low";
}

/**
 * MediaMes.ipynb: a month counts when stock is not zero/blank OR units were sold.
 * Zero stock and zero sales is not demand. Full sell-through stays in the
 * average (the notebook counted it) and is flagged as a minimum, not uncapped demand.
 * With no inventory history, a zero-sales month is unknown and left out.
 */
export function classifyMonth(sales: number, inventory: number | null) {
  if (inventory === 0 && sales <= 0) {
    return {
      kind: "no_inventory" as const,
      included: false,
      reason: "Left out of the average — no inventory and no sales.",
    };
  }
  if (inventory != null && inventory > 0 && sales >= inventory && sales > 0) {
    return {
      kind: "stock_constrained" as const,
      included: true,
      reason: "Sold the available stock. Counted as a minimum, not full demand.",
    };
  }
  if (inventory == null && sales <= 0) {
    return {
      kind: "unknown" as const,
      included: false,
      reason: "Left out of the average — no sales, and inventory history is unavailable.",
    };
  }
  return { kind: "normal" as const, included: true, reason: null };
}

export function buildSupply(opts: {
  product: CatalogProduct;
  rows: SaleRow[];
  period: string;
  from: string | null;
  to: string | null;
  seller: string | null;
  client: string | null;
  physical: number | null;
  available: number | null;
  updatedAt?: string;
  sourceNote?: string;
  today?: Date;
}): SupplyReport {
  const today = opts.today ?? new Date();
  const filtered = opts.rows.filter((row) => {
    if (opts.seller && row.seller !== opts.seller) return false;
    if (opts.client && row.client !== opts.client) return false;
    return true;
  });

  const salesByMonth = new Map<string, number>();
  for (const row of filtered) {
    const key = row.date.slice(0, 7);
    salesByMonth.set(key, (salesByMonth.get(key) ?? 0) + row.qty);
  }

  const calcEnd = startOfMonth(today);
  const calcStart = addMonths(calcEnd, 1 - CALC_MONTHS);
  const calcKeys = monthsBetween(calcStart, calcEnd);
  const included: { month: string; sales: number }[] = [];
  const history = new Map<string, ReturnType<typeof classifyMonth> & { sales: number }>();

  for (const month of calcKeys) {
    const sales = salesByMonth.get(month) ?? 0;
    const classified = classifyMonth(sales, null);
    history.set(month, { ...classified, sales });
    if (classified.included) included.push({ month, sales });
  }

  const average = mean(included.map((m) => m.sales));
  const recent = [...included].reverse().find((m) => m.sales > 0) ?? included.at(-1) ?? null;

  const seasonal = new Map<number, number>();
  let forecastNote = "Straight average — fewer than 18 months with sales.";
  if (included.length >= CALC_MONTHS && average) {
    const byCal = new Map<number, number[]>();
    for (const month of history.keys()) {
      const hit = history.get(month)!;
      if (!hit.included) continue;
      const cal = Number(month.slice(5, 7));
      const list = byCal.get(cal) ?? [];
      list.push(hit.sales);
      byCal.set(cal, list);
    }
    let used = false;
    for (const [cal, values] of byCal) {
      if (values.length < 2) continue;
      const index = (mean(values) ?? average) / average;
      seasonal.set(cal, Math.min(2, Math.max(0.4, index)));
      used = true;
    }
    forecastNote = used
      ? "Baseline is the 18-month stock-adjusted average, tilted by the month’s own history."
      : "18 months of sales, but not enough repeated months for a seasonal tilt.";
  } else if ((average ?? 0) === 0) {
    forecastNote = "Not enough sales to forecast.";
  }

  const last6 = included.slice(-6);
  const prev6 = included.slice(-12, -6);
  let trend = 1;
  const lastMean = mean(last6.map((m) => m.sales));
  const prevMean = mean(prev6.map((m) => m.sales));
  if (lastMean && prevMean && prev6.length >= 6) {
    trend = 1 + (lastMean / prevMean - 1) * 0.5;
    trend = Math.min(1.25, Math.max(0.8, trend));
    if (Math.abs(trend - 1) > 0.02 && included.length < CALC_MONTHS) {
      forecastNote =
        "Corrected average, nudged by the latest months and capped so one spike cannot dominate.";
    }
  }

  const view = displayRange(opts.period, opts.from, opts.to, today);
  const viewKeys = monthsBetween(view.start, view.end);
  const futureKeys = monthsBetween(addMonths(calcEnd, 1), addMonths(calcEnd, FORECAST_MONTHS));

  function forecastFor(month: string) {
    if (average == null) return null;
    const cal = Number(month.slice(5, 7));
    return average * (seasonal.get(cal) ?? 1) * trend;
  }

  const months: MonthPoint[] = [];
  for (const month of viewKeys) {
    const known = history.get(month);
    const sales = salesByMonth.get(month) ?? 0;
    const classified = known ?? { ...classifyMonth(sales, null), sales };
    months.push({
      month,
      sales,
      forecast: null,
      kind: classified.kind,
      included: classified.included,
      reason: classified.reason,
    });
  }
  for (const month of futureKeys) {
    months.push({
      month,
      sales: null,
      forecast: forecastFor(month),
      kind: "future",
      included: false,
      reason: null,
    });
  }

  const forecastMonthly = forecastFor(futureKeys[0] ?? monthKey(addMonths(calcEnd, 1)));

  const onHand = opts.physical;
  const coefficient =
    onHand == null ? null : average && average > 0 ? onHand / average : onHand / 0.1;
  const ideal = average == null ? null : average * COVER_MONTHS;
  const suggested =
    onHand == null || ideal == null ? null : Math.max(0, Math.round(ideal - onHand));

  const periodRows = filtered
    .filter((row) => {
      const key = row.date.slice(0, 7);
      return key >= monthKey(view.start) && key <= monthKey(view.end);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.invoice.localeCompare(a.invoice));

  const prices = periodRows.map((r) => r.price).filter((n) => n > 0);
  const byClient = new Map<string, number>();
  for (const row of periodRows) {
    byClient.set(row.client, (byClient.get(row.client) ?? 0) + row.qty);
  }
  const totalQty = [...byClient.values()].reduce((s, n) => s + n, 0);
  const ranked = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5).reduce((s, [, qty]) => s + qty, 0);
  const customers = top.map(([name, qty]) => ({
    name,
    qty,
    share: totalQty ? qty / totalQty : 0,
  }));
  if (rest > 0) {
    customers.push({ name: "Other", qty: rest, share: totalQty ? rest / totalQty : 0 });
  }

  return {
    product: opts.product,
    updatedAt: opts.updatedAt ?? "",
    sourceNote: opts.sourceNote ?? "",
    displayLabel: `${format(view.start, "MMM yyyy")} – ${format(view.end, "MMM yyyy")}`,
    calcLabel: `Last ${CALC_MONTHS} months`,
    stock: { physical: opts.physical, available: opts.available },
    average,
    recent: recent?.sales ?? null,
    recentLabel: recent ? format(parseMonth(recent.month), "MMM yyyy") : null,
    forecastMonthly,
    forecastNote,
    coefficient,
    status: coefficient == null ? null : statusFor(coefficient),
    suggested,
    suggestedNote:
      onHand == null
        ? "Current inventory is not linked to this SKU, so no purchase quantity is shown."
        : `Cover target is ${COVER_MONTHS} months of the corrected average, minus units on hand.`,
    prices: {
      avg: mean(prices),
      last: periodRows.find((r) => r.price > 0)?.price ?? null,
      low: prices.length ? Math.min(...prices) : null,
      high: prices.length ? Math.max(...prices) : null,
    },
    months,
    customers,
    invoices: periodRows.slice(0, 30).map((row) => ({
      date: row.date,
      invoice: row.invoice,
      client: row.client,
      seller: row.seller,
      qty: row.qty,
      price: row.price,
      total: row.total,
    })),
  };
}

export type AttentionRow = {
  id: string;
  name: string;
  sku: string;
  inventoryId: string | null;
  physical: number | null;
  incoming: number;
  average: number | null;
  coefficient: number | null;
  status: string | null;
  suggested: number | null;
};

export function attentionRows(
  stock: Map<string, { id: string; physical: number; available: number }>,
  incoming: Map<string, number>,
) {
  const data = loadRows();
  const today = new Date();
  return data.products
    .map((product) => {
      const linked = product.skus
        .map((sku) => stock.get(sku.toLowerCase()))
        .find(Boolean);
      const coming = product.skus.reduce(
        (sum, sku) => sum + (incoming.get(sku.toLowerCase()) ?? 0),
        0,
      );
      const report = buildSupply({
        product,
        rows: data.byId.get(product.id) ?? [],
        period: "12",
        from: null,
        to: null,
        seller: null,
        client: null,
        physical: linked?.physical ?? null,
        available: linked?.available ?? null,
        today,
      });
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        inventoryId: linked?.id ?? null,
        physical: linked?.physical ?? null,
        incoming: coming,
        average: report.average,
        coefficient: report.coefficient,
        status: report.status,
        suggested: report.suggested,
      };
    })
    .sort((a, b) => (a.coefficient ?? 1e9) - (b.coefficient ?? 1e9));
}

export function supplySelfCheck() {
  const product: CatalogProduct = {
    id: "widget",
    name: "Widget",
    sku: "W",
    skus: ["W"],
  };
  const rows: SaleRow[] = [];
  const push = (month: string, qty: number) =>
    rows.push({
      date: `${month}-15`,
      invoice: month,
      client: qty > 2 ? "A" : "B",
      seller: "Juan Stevan",
      sku: "W",
      item: "Widget",
      qty,
      price: 10,
      total: qty * 10,
    });
  // Eighteen months ending Sep 2026. Two zero months must drop out.
  const months = monthsBetween(new Date(2025, 3, 1), new Date(2026, 8, 1));
  months.forEach((month, i) => push(month, i === 0 || i === 3 || i === 8 ? 0 : 4));
  const dead = classifyMonth(0, 0);
  const tight = classifyMonth(12, 12);
  const open = classifyMonth(5, 20);
  if (dead.included || !tight.included || !open.included) {
    throw new Error("month classification drifted from MediaMes");
  }
  const report = buildSupply({
    product,
    rows,
    period: "12",
    from: null,
    to: null,
    seller: null,
    client: null,
    physical: 24,
    available: 24,
    today: new Date(2026, 8, 21),
  });
  if (report.average == null || Math.abs(report.average - 4) > 0.001) {
    throw new Error(`average expected 4, got ${report.average}`);
  }
  if (report.coefficient == null || Math.abs(report.coefficient - 6) > 0.001) {
    throw new Error(`coefficient expected 6, got ${report.coefficient}`);
  }
  if (report.suggested !== 0) throw new Error(`suggested expected 0, got ${report.suggested}`);
  const unknown = report.months.filter((m) => m.kind === "unknown");
  if (!unknown.length) throw new Error("zero-sales months were not flagged");
  return "ok";
}
