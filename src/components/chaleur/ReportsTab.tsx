"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Info, PanelLeft, RefreshCw, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataGrid, type GridCol } from "@/components/chaleur/DataGrid";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type CatalogProduct = { id: string; name: string; sku: string; skus: string[] };

type MonthPoint = {
  month: string;
  sales: number | null;
  forecast: number | null;
  kind: string;
  included: boolean;
  reason: string | null;
};

type Report = {
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

type Attention = {
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

type CartItem = {
  id: string;
  inventoryId: string | null;
  name: string;
  sku: string;
  qty: number;
};

type Index = {
  updatedAt: string;
  products: CatalogProduct[];
  sellers: string[];
  clients: string[];
  invoices: number;
  sourceNote: string;
  attention?: Attention[];
  report?: Report;
};

const PERIODS = [
  ["3", "Last 3 months"],
  ["6", "Last 6 months"],
  ["12", "Last 12 months"],
  ["24", "Last 24 months"],
  ["ytd", "Year to date"],
  ["custom", "Custom"],
] as const;

const PIE = ["#1E317F", "#2A48C4", "#3B5FE0", "#6B8AF0", "#BFD0FC", "#A2ABB8"];

function statusVariant(status: string) {
  if (status === "Out" || status === "Low") return "danger" as const;
  if (status === "Healthy") return "success" as const;
  if (status === "High") return "warning" as const;
  return "neutral" as const;
}

function qty(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

function money(n: number | null) {
  return n == null ? "—" : formatMoney(n);
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return format(d, "MMM d, yyyy 'at' h:mm a");
}

function day(iso: string) {
  return format(new Date(`${iso}T12:00:00`), "MMM d, yyyy");
}

export function ReportsTab({
  onCreateImport,
}: {
  onCreateImport: (
    lines: { productId: string | null; name: string; quantity: number }[],
  ) => void;
}) {
  const [section, setSection] = useState("supply");
  const [navOpen, setNavOpen] = useState(true);
  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
      <nav
        className={cn(
          "flex shrink-0 flex-col gap-1 overflow-hidden",
          navOpen ? "w-36" : "w-8",
        )}
      >
        <button
          type="button"
          aria-label={navOpen ? "Collapse reports" : "Expand reports"}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          onClick={() => setNavOpen((v) => !v)}
        >
          <PanelLeft className="size-4" />
        </button>
        {navOpen && (
          <>
            <p className="px-2 pb-1 text-2xs font-medium tracking-wide text-gray-500 uppercase">
              Reports
            </p>
            {[
              ["supply", "Supply Chain"],
              ["sales", "Sales"],
              ["customers", "Customers"],
            ].map(([id, label]) => {
              const soon = id !== "supply";
              return (
                <button
                  key={id}
                  type="button"
                  disabled={soon}
                  onClick={() => setSection(id)}
                  className={cn(
                    "flex h-8 items-center rounded-md px-2 text-left text-sm",
                    section === id && "bg-gray-100 font-medium text-gray-900",
                    soon && "text-gray-400",
                    !soon && section !== id && "text-gray-700 hover:bg-gray-100",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </>
        )}
      </nav>
      {section === "supply" && <SupplyDash onCreateImport={onCreateImport} />}
    </div>
  );
}

function SupplyDash({
  onCreateImport,
}: {
  onCreateImport: (
    lines: { productId: string | null; name: string; quantity: number }[],
  ) => void;
}) {
  const [index, setIndex] = useState<Index | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("12");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [seller, setSeller] = useState("");
  const [client, setClient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  async function loadIndex(refresh = false) {
    const res = await fetch(`/api/reports/supply${refresh ? "?refresh=1" : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not load reports");
      return;
    }
    setError(null);
    setIndex(data);
  }

  useEffect(() => {
    void loadIndex();
  }, []);

  useEffect(() => {
    if (!productId) return;
    const params = new URLSearchParams({ product: productId, period });
    if (seller) params.set("seller", seller);
    if (client) params.set("client", client);
    if (period === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    const handle = setTimeout(() => {
      void fetch(`/api/reports/supply?${params}`).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Could not load this product");
          return;
        }
        setError(null);
        setReport(data.report ?? null);
        if (data.updatedAt)
          setIndex((prev) => (prev ? { ...prev, ...data, report: undefined } : data));
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [productId, period, from, to, seller, client]);

  function pick(product: CatalogProduct) {
    setProductId(product.id);
    setQuery(product.name);
    setOpen(false);
    setHover("");
  }

  function addToCart(item: CartItem) {
    setCart((prev) => {
      const i = prev.findIndex((row) => row.id === item.id);
      if (i < 0) return [...prev, item];
      const next = [...prev];
      next[i] = { ...next[i], qty: next[i].qty + item.qty };
      return next;
    });
  }

  const attention = index?.attention ?? [];
  const listed = useMemo(() => {
    const q = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!q) return attention;
    return attention.filter((row) =>
      `${row.name} ${row.sku}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(q),
    );
  }, [attention, query]);

  const columns: GridCol<Attention>[] = [
    { key: "name", label: "Product" },
    {
      key: "physical",
      label: "Current qnt",
      numeric: true,
      width: "120px",
      sortValue: (row) => row.physical ?? -1,
      render: (row) => qty(row.physical),
    },
    {
      key: "incoming",
      label: "Coming",
      numeric: true,
      width: "110px",
      render: (row) => qty(row.incoming),
    },
    {
      key: "coefficient",
      label: "Coef",
      numeric: true,
      width: "140px",
      sortValue: (row) => row.coefficient ?? 1e9,
      filterValue: (row) => `${row.coefficient ?? ""} ${row.status ?? ""}`,
      render: (row) =>
        row.coefficient == null ? (
          "—"
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="tabular-nums">{qty(row.coefficient)}</span>
            {row.status && <Badge variant={statusVariant(row.status)}>{row.status}</Badge>}
          </span>
        ),
    },
    {
      key: "average",
      label: "Avg / month",
      numeric: true,
      width: "120px",
      sortValue: (row) => row.average ?? -1,
      render: (row) => qty(row.average),
    },
    {
      key: "buy",
      label: "",
      plain: true,
      width: "72px",
      render: (row) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            addToCart({
              id: row.id,
              inventoryId: row.inventoryId,
              name: row.name,
              sku: row.sku,
              qty: row.suggested && row.suggested > 0 ? row.suggested : 1,
            });
          }}
        >
          Buy
        </Button>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1" data-product-picker>
          <Input
            value={query}
            placeholder="Search product or SKU"
            aria-label="Product"
            className="h-control-sm"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => {
                const active = document.activeElement;
                if (active?.closest("[data-product-picker]")) return;
                setOpen(false);
              }, 0);
            }}
          />
          {open && (
            <div
              className="absolute top-10 left-0 z-40 flex h-80 w-[min(920px,calc(100vw-8rem))] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md"
              onMouseDown={(e) => e.preventDefault()}
            >
              <DataGrid
                rows={listed}
                columns={columns}
                getRowId={(row) => row.id}
                onRowClick={(row) =>
                  pick({ id: row.id, name: row.name, sku: row.sku, skus: [row.sku] })
                }
                empty="No products"
                className="min-h-0 flex-1 rounded-none border-0"
              />
            </div>
          )}
        </div>
        <Select
          value={seller || "all"}
          onValueChange={(v) => setSeller(String(v) === "all" ? "" : String(v))}
        >
          <SelectTrigger className="w-36" size="sm" aria-label="Seller">
            <SelectValue>
              {(v) => (String(v) === "all" ? "All sellers" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sellers</SelectItem>
            {(index?.sellers ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-control-sm w-40"
          list="report-clients"
          placeholder="Client"
          aria-label="Client"
          value={client}
          onChange={(e) => setClient(e.target.value)}
        />
        <datalist id="report-clients">
          {(index?.clients ?? []).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Hint
          text={
            index
              ? `${index.invoices} invoices in the QuickBooks export, updated ${when(index.updatedAt)}. Live sync covers 7 days.`
              : "Loading the orders export."
          }
        />
        <Button
          size="sm"
          disabled={!report}
          onClick={() => {
            if (!report) return;
            const row = attention.find((item) => item.id === report.product.id);
            addToCart({
              id: report.product.id,
              inventoryId: row?.inventoryId ?? null,
              name: report.product.name,
              sku: report.product.sku,
              qty: report.suggested && report.suggested > 0 ? report.suggested : 1,
            });
          }}
        >
          Buy
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingCart />
          Cart
          {cart.length > 0 && (
            <span className="tabular-nums text-gray-500">{cart.length}</span>
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh"
          onClick={() => void loadIndex(true)}
        >
          <RefreshCw />
        </Button>
      </div>

      {error && <p className="shrink-0 text-sm text-danger-text">{error}</p>}

      {!report ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-gray-500">
          Select a product
        </div>
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-6 overflow-hidden rounded-lg border border-border bg-surface">
            <Stat label="On hand" value={qty(report.stock.physical)} hint={report.stock.available == null ? "This SKU is not linked to Storage." : `${qty(report.stock.available)} available. Current stock only — no monthly history.`} />
            <Stat label="Avg / month" value={qty(report.average)} hint={`Corrected average over ${report.calcLabel.toLowerCase()}. Months with no sales are excluded.`} />
            <Stat label="Recent" value={qty(report.recent)} hint={report.recentLabel ?? "No recent sales month."} />
            <Stat label="Forecast" value={qty(report.forecastMonthly)} hint={report.forecastNote} />
            <Stat label="Cover" value={report.coefficient == null ? "—" : `${qty(report.coefficient)} mo`} hint={report.status ? `${report.status}. On hand divided by the corrected monthly average.` : "On hand divided by the corrected monthly average."} />
            <Stat label="Buy" value={report.suggested == null ? "—" : qty(report.suggested)} hint={report.suggestedNote} />
          </div>

          <div className="grid min-h-0 flex-[1.2] grid-cols-[minmax(0,1fr)_260px] gap-3">
            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex h-10 shrink-0 items-center gap-2 px-3">
                <p className="text-sm font-medium text-gray-900">Demand</p>
                <div className="ml-auto flex items-center gap-1">
                  {PERIODS.filter(([id]) => id !== "custom").map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPeriod(id)}
                      className={cn(
                        "h-6 rounded-md px-2 text-xs",
                        period === id ? "bg-gray-100 font-medium text-gray-900" : "text-gray-500 hover:text-gray-800",
                      )}
                    >
                      {label.replace("Last ", "").replace(" months", "M").replace("Year to date", "YTD")}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPeriod("custom")}
                    className={cn(
                      "h-6 rounded-md px-2 text-xs",
                      period === "custom" ? "bg-gray-100 font-medium text-gray-900" : "text-gray-500 hover:text-gray-800",
                    )}
                  >
                    Custom
                  </button>
                </div>
              </div>
              {period === "custom" && (
                <div className="flex shrink-0 gap-2 px-3 pb-2">
                  <Input type="date" aria-label="From" className="h-control-sm w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <Input type="date" aria-label="To" className="h-control-sm w-36" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              )}
              <div className="min-h-0 flex-1 px-3 pb-2">
                <SalesChart months={report.months} onHover={setHover} />
              </div>
              <div className="flex h-6 shrink-0 items-center gap-3 px-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-blue-600" />Sold</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 border-t border-dashed border-warning-text" />Forecast</span>
                <span className="min-w-0 flex-1 truncate text-gray-700">{hover}</span>
                <Hint text={`Chart shows ${report.displayLabel}. The average uses ${report.calcLabel.toLowerCase()}.`} />
              </div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex h-10 shrink-0 items-center gap-1 px-3">
                <p className="text-sm font-medium text-gray-900">Customers</p>
                <Hint text="Share of units in the selected period." />
              </div>
              {report.customers.length === 0 ? (
                <p className="px-3 text-sm text-gray-500">None</p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-hidden px-3 pb-3">
                  <Donut slices={report.customers} />
                  <ul className="min-h-0 w-full flex-1 space-y-1.5 overflow-hidden">
                    {report.customers.map((slice, i) => (
                      <li key={slice.name} className="flex items-center gap-1.5 text-xs">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                        <span className="min-w-0 flex-1 truncate" title={slice.name}>{slice.name}</span>
                        <span className="tabular-nums text-gray-500">{Math.round(slice.share * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-gray-150 px-3">
              <p className="text-sm font-medium text-gray-900">Invoices</p>
              <Hint text={`Avg ${money(report.prices.avg)} · Last ${money(report.prices.last)} · Low ${money(report.prices.low)} · High ${money(report.prices.high)}`} />
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-sunken text-xs text-gray-600">
                  <tr className="h-8">
                    <th className="w-[14%] px-3 font-medium">Date</th>
                    <th className="w-[10%] px-3 font-medium">Invoice</th>
                    <th className="w-[24%] px-3 font-medium">Client</th>
                    <th className="w-[16%] px-3 font-medium">Seller</th>
                    <th className="w-[8%] px-3 text-right font-medium">Qty</th>
                    <th className="w-[14%] px-3 text-right font-medium">Price</th>
                    <th className="w-[14%] px-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-gray-500">None</td>
                    </tr>
                  ) : (
                    report.invoices.map((row) => (
                      <tr key={`${row.invoice}-${row.date}-${row.qty}`} className="h-8 border-t border-gray-150">
                        <td className="truncate px-3 text-gray-600">{day(row.date)}</td>
                        <td className="truncate px-3 font-mono text-xs text-gray-600">{row.invoice}</td>
                        <td className="truncate px-3" title={row.client}>{row.client}</td>
                        <td className="truncate px-3 text-gray-700" title={row.seller}>{row.seller}</td>
                        <td className="px-3 text-right tabular-nums">{qty(row.qty)}</td>
                        <td className="px-3 text-right tabular-nums">{money(row.price)}</td>
                        <td className="px-3 text-right tabular-nums">{money(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <CartSheet
        open={cartOpen}
        items={cart}
        onOpenChange={setCartOpen}
        onChange={setCart}
        onCreateImport={onCreateImport}
      />
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Details"
        render={
          <button
            type="button"
            className="inline-flex size-4 shrink-0 items-center justify-center text-gray-400 outline-none hover:text-gray-700"
          />
        }
      >
        <Info className="size-3" />
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-left leading-4">{text}</TooltipContent>
    </Tooltip>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 border-r border-gray-150 px-4 py-3 last:border-r-0">
      <p className="truncate text-xl font-semibold text-gray-900 tabular-nums">{value}</p>
      <div className="mt-0.5 flex items-center gap-1">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <Hint text={hint} />
      </div>
    </div>
  );
}

function curve(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function SalesChart({
  months,
  onHover,
}: {
  months: MonthPoint[];
  onHover: (text: string) => void;
}) {
  const w = 720;
  const h = 220;
  const pad = { l: 28, r: 12, t: 12, b: 22 };
  const [tip, setTip] = useState<{ i: number; left: number; top: number } | null>(null);
  const values = months.flatMap((m) =>
    [m.sales, m.forecast].filter((n): n is number => n != null),
  );
  const max = Math.max(1, ...values);
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const x = (i: number) =>
    pad.l + (months.length <= 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  const y = (n: number) => pad.t + innerH - (n / max) * innerH;
  const sales = months.flatMap((m, i) =>
    m.sales == null ? [] : [{ x: x(i), y: y(m.sales) }],
  );
  const forecast = months.flatMap((m, i) =>
    m.forecast == null ? [] : [{ x: x(i), y: y(m.forecast) }],
  );
  const lastSale = [...months].reverse().find((m) => m.sales != null);
  const lastSaleIndex = months.findLastIndex((m) => m.sales != null);
  if (lastSale && lastSale.sales != null && forecast.length) {
    forecast.unshift({ x: x(lastSaleIndex), y: y(lastSale.sales) });
  }
  const step = months.length > 16 ? 2 : 1;
  const point = tip ? months[tip.i] : null;

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-full w-full"
        role="img"
        aria-label="Monthly units sold and forecast"
        onMouseLeave={() => {
          setTip(null);
          onHover("");
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * w;
          let best = 0;
          let dist = Infinity;
          months.forEach((_, i) => {
            const d = Math.abs(x(i) - px);
            if (d < dist) {
              dist = d;
              best = i;
            }
          });
          const m = months[best];
          setTip({
            i: best,
            left: (x(best) / w) * rect.width,
            top: (y(m?.sales ?? m?.forecast ?? 0) / h) * rect.height,
          });
          if (!m) return;
          onHover(format(new Date(`${m.month}-01T12:00:00`), "MMM yyyy"));
        }}
      >
        <line x1={pad.l} y1={y(0)} x2={w - pad.r} y2={y(0)} stroke="#E8EBEF" />
        <text x="0" y={y(max) + 4} fill="#7A8494" fontSize="11">{qty(max)}</text>
        <path d={curve(sales)} fill="none" stroke="#2A48C4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={curve(forecast)} fill="none" stroke="#94AEF8" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
        {months.map((m, i) =>
          m.sales == null ? null : (
            <circle
              key={m.month}
              cx={x(i)}
              cy={y(m.sales)}
              r={tip?.i === i ? 4 : 2.5}
              fill={m.included ? "#2A48C4" : "#FFFFFF"}
              stroke="#2A48C4"
              strokeWidth={m.included ? 0 : 1.5}
            />
          ),
        )}
        {months.map((m, i) =>
          i % step === 0 ? (
            <text key={`${m.month}-l`} x={x(i)} y={h - 4} textAnchor="middle" fill="#7A8494" fontSize="11">
              {format(new Date(`${m.month}-01T12:00:00`), "MMM")}
            </text>
          ) : null,
        )}
      </svg>
      {point && tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: tip.left, top: tip.top }}
        >
          <p className="font-medium text-gray-900">
            {format(new Date(`${point.month}-01T12:00:00`), "MMM yyyy")}
          </p>
          {point.sales != null && <p className="text-gray-600">Sold {qty(point.sales)}</p>}
          {point.forecast != null && <p className="text-gray-600">Forecast {qty(point.forecast)}</p>}
          {point.reason && <p className="max-w-48 text-gray-500">{point.reason}</p>}
        </div>
      )}
    </div>
  );
}

function Donut({ slices }: { slices: Report["customers"] }) {
  const [active, setActive] = useState<number | null>(null);
  const r = 70;
  const cx = 80;
  const cy = 80;
  let angle = -Math.PI / 2;
  const wedges = slices.map((slice, i) => {
    const sweep = slice.share * Math.PI * 2;
    const start = angle;
    const end = angle + Math.max(sweep, 0.001);
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(start);
    const y0 = cy + r * Math.sin(start);
    const x1 = cx + r * Math.cos(end);
    const y1 = cy + r * Math.sin(end);
    return {
      i,
      slice,
      d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`,
    };
  });
  const current = active == null ? null : wedges[active];
  return (
    <div className="relative">
      <svg viewBox="0 0 160 160" className="size-40" role="img" aria-label="Customer share">
        {wedges.map((wedge) => (
          <path
            key={wedge.slice.name}
            d={wedge.d}
            fill={PIE[wedge.i % PIE.length]}
            stroke="#FFFFFF"
            strokeWidth="1"
            className="cursor-pointer"
            onMouseEnter={() => setActive(wedge.i)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
      </svg>
      {current && (
        <div className="pointer-events-none absolute top-1 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm">
          <p className="font-medium text-gray-900">{current.slice.name}</p>
          <p className="text-gray-600">
            {qty(current.slice.qty)} · {Math.round(current.slice.share * 100)}%
          </p>
        </div>
      )}
    </div>
  );
}

function CartSheet({
  open,
  items,
  onOpenChange,
  onChange,
  onCreateImport,
}: {
  open: boolean;
  items: CartItem[];
  onOpenChange: (open: boolean) => void;
  onChange: (items: CartItem[]) => void;
  onCreateImport: (
    lines: { productId: string | null; name: string; quantity: number }[],
  ) => void;
}) {
  async function exportSheet() {
    const res = await fetch("/api/reports/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: items.map((item) => ({
          name: item.name,
          sku: item.sku,
          qty: item.qty,
        })),
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchase-cart.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-[420px]">
        <SheetHeader className="h-14 shrink-0 justify-center border-b border-border px-6">
          <SheetTitle>Cart</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing added yet.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900">{item.name}</p>
                  <p className="truncate font-mono text-xs text-gray-500">{item.sku}</p>
                </div>
                <Input
                  aria-label="Quantity"
                  className="h-control-sm tabular-nums"
                  inputMode="numeric"
                  value={String(item.qty)}
                  onChange={(e) => {
                    const qty = Math.max(1, Number(e.target.value) || 1);
                    onChange(items.map((row) => (row.id === item.id ? { ...row, qty } : row)));
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(items.filter((row) => row.id !== item.id))}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" disabled={!items.length} onClick={() => void exportSheet()}>
            Export
          </Button>
          <Button
            disabled={!items.length}
            onClick={() =>
              onCreateImport(
                items.map((item) => ({
                  productId: item.inventoryId,
                  name: item.name,
                  quantity: item.qty,
                })),
              )
            }
          >
            Create import
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
