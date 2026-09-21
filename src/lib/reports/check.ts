import path from "path";
import { rowsFromFile } from "./sheet";
import { supplySelfCheck, buildSupply, catalogFrom, findProduct, reportsIndex, rowsFor } from "./supply";

const mark = supplySelfCheck();
if (mark !== "ok") throw new Error(mark);

const data = catalogFrom(
  rowsFromFile(process.env.REPORTS_ORDERS_PATH || path.join(process.cwd(), "data", "orders.xlsx")),
  new Date().toISOString(),
);
const index = reportsIndex(data);
const names = ["36\" range hood bbq-02", "double door no. 835 (33\")", "single zone fridge (glass front)"];
for (const name of names) {
  const product = findProduct(data, index.products.find((p) => p.name.toLowerCase() === name)?.id ?? "");
  if (!product) {
    console.log("missing", name);
    continue;
  }
  const report = buildSupply({
    product,
    rows: rowsFor(data, product.id),
    period: "12",
    from: null,
    to: null,
    seller: null,
    client: null,
    physical: 10,
    available: 10,
    today: new Date(2026, 8, 21),
  });
  console.log(
    product.name,
    "skus",
    product.skus.join(" / "),
    "avg",
    report.average?.toFixed(2),
    "forecast",
    report.forecastMonthly?.toFixed(2),
    "invoices",
    report.invoices.length,
    "customers",
    report.customers.length,
  );
}
console.log("self-check", mark, "products", index.products.length, "invoices", index.invoices);
