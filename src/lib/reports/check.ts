import { supplySelfCheck, buildSupply, findProduct, reportsIndex, rowsFor } from "./supply";

const mark = supplySelfCheck();
if (mark !== "ok") throw new Error(mark);

const index = reportsIndex();
const names = ["36\" range hood bbq-02", "double door no. 835 (33\")", "single zone fridge (glass front)"];
for (const name of names) {
  const product = index.products.find((p) => p.name.toLowerCase() === name);
  if (!product) {
    console.log("missing", name);
    continue;
  }
  const report = buildSupply({
    product,
    rows: rowsFor(product.id),
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
