import "dotenv/config";
import { syncQuickBooks } from "../src/lib/quickbooks/sync";

syncQuickBooks()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
