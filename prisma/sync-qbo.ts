import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { syncQuickBooks } from "../src/lib/quickbooks/sync";

const tokenPath = process.env.QB_TOKEN_PATH?.trim();

function loadDashToken() {
  if (!tokenPath || !existsSync(tokenPath)) return;
  const token = JSON.parse(readFileSync(tokenPath, "utf8")) as {
    refresh_token?: string;
    realm_id?: string;
  };
  if (token.refresh_token) process.env.QB_REFRESH_TOKEN = token.refresh_token;
  if (token.realm_id) process.env.QB_REALM_ID = String(token.realm_id);
}

function saveDashToken() {
  if (!tokenPath || !existsSync(tokenPath)) return;
  const prev = JSON.parse(readFileSync(tokenPath, "utf8")) as Record<
    string,
    unknown
  >;
  writeFileSync(
    tokenPath,
    JSON.stringify(
      {
        ...prev,
        refresh_token: process.env.QB_REFRESH_TOKEN,
        saved_at: Date.now() / 1000,
      },
      null,
      2,
    ),
  );
}

loadDashToken();

syncQuickBooks()
  .then((result) => {
    saveDashToken();
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
