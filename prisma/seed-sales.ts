import "dotenv/config";
import path from "path";
import { replaceAllSales } from "../src/lib/reports/orders";
import { rowsFromFile } from "../src/lib/reports/sheet";

const file =
  process.env.REPORTS_ORDERS_PATH || path.join(process.cwd(), "data", "orders.xlsx");

replaceAllSales(rowsFromFile(file))
  .then((count) => {
    console.log(`loaded ${count} sale lines from ${file}`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
