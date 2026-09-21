import { readFileSync } from "fs";
import * as xlsx from "xlsx";
import { isSellable, sellerName, type SaleRow } from "./supply";

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Same invoice + sku key the dashboard app keeps when it rewrites orders.xlsx. */
export function dedupeSales(rows: SaleRow[]) {
  const byKey = new Map<string, SaleRow>();
  for (const row of rows) byKey.set(`${row.invoice}\0${row.sku}`, row);
  return [...byKey.values()];
}

export function rowsFromSheet(wb: xlsx.WorkBook): SaleRow[] {
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
  return dedupeSales(rows);
}

export function rowsFromFile(file: string) {
  return rowsFromSheet(xlsx.read(readFileSync(file), { cellDates: false }));
}
