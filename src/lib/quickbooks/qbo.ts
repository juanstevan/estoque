import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "fs";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const BASE_URL = "https://quickbooks.api.intuit.com";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function tokenPath() {
  return process.env.QB_TOKEN_PATH?.trim() || "";
}

function loadStoredToken(): Record<string, unknown> | null {
  const path = tokenPath();
  if (!path || !existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredToken(token: Record<string, unknown>) {
  const path = tokenPath();
  if (!path) return;
  const prev = loadStoredToken() ?? {};
  writeFileSync(
    path,
    JSON.stringify(
      { ...prev, ...token, saved_at: Date.now() / 1000 },
      null,
      2,
    ),
  );
}

function basicAuth() {
  const id = required("QB_CLIENT_ID");
  const secret = required("QB_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function qboAccessToken() {
  const stored = loadStoredToken();
  const refresh =
    (typeof stored?.refresh_token === "string" && stored.refresh_token) ||
    required("QB_REFRESH_TOKEN");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "QuickBooks token refresh failed",
    );
  }
  process.env.QB_REFRESH_TOKEN = data.refresh_token || refresh;
  saveStoredToken(data);
  return data.access_token;
}

export async function qboQuery(
  token: string,
  entity: string,
  where = "",
  orderby = "",
) {
  const stored = loadStoredToken();
  const realmId =
    (typeof stored?.realm_id === "string" && stored.realm_id) ||
    required("QB_REALM_ID");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const rows: unknown[] = [];
  let start = 1;
  while (true) {
    let query = `SELECT * FROM ${entity}`;
    if (where) query += ` WHERE ${where}`;
    if (orderby) query += ` ORDERBY ${orderby}`;
    query += ` STARTPOSITION ${start} MAXRESULTS 1000`;
    const url = new URL(`${BASE_URL}/v3/company/${realmId}/query`);
    url.searchParams.set("query", query);
    url.searchParams.set("minorversion", "75");
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `QuickBooks ${entity} query failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      QueryResponse?: Record<string, unknown>;
    };
    let page = json.QueryResponse?.[entity] ?? [];
    if (!Array.isArray(page)) page = page ? [page] : [];
    if (!page.length) break;
    rows.push(...page);
    if (page.length < 1000) break;
    start += 1000;
  }
  return rows;
}
