import { prisma } from "@/lib/db";
import { quickBooksName } from "@/lib/photos/name";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const BASE_URL = "https://quickbooks.api.intuit.com";
export const NOT_CONNECTED = "QuickBooks is not connected. Open Settings → Developer and connect.";
export const EXPIRED = "QuickBooks connection expired. Open Settings → Developer and connect again.";
export const REFUSED = "QuickBooks refused the connection. Check the Company ID in Settings → Developer and connect again.";

type QbConfig = { clientId: string; clientSecret: string; realmId: string; redirectUri: string };

const LABELS: Record<keyof QbConfig, string> = {
  clientId: "Client ID",
  clientSecret: "Client secret",
  realmId: "Company ID",
  redirectUri: "Redirect URL",
};

/** Settings → Developer first, env vars as the fallback. Blank means not set. */
export async function qbSettings(): Promise<QbConfig> {
  const saved = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const pick = (value: string | null | undefined, env: string) => value?.trim() || process.env[env]?.trim() || "";
  return {
    clientId: pick(saved?.qbClientId, "QB_CLIENT_ID"),
    clientSecret: pick(saved?.qbClientSecret, "QB_CLIENT_SECRET"),
    realmId: pick(saved?.qbRealmId, "QB_REALM_ID"),
    redirectUri: pick(saved?.qbRedirectUri, "QB_REDIRECT_URI"),
  };
}

async function qbConfig(...keys: (keyof QbConfig)[]) {
  const config = await qbSettings();
  for (const key of keys) {
    if (!config[key]) throw new Error(`Add the QuickBooks ${LABELS[key]} in Settings → Developer.`);
  }
  return config;
}

async function qboUrl(path: string) {
  const { realmId } = await qbConfig("realmId");
  const url = new URL(`${BASE_URL}/v3/company/${realmId}/${path}`);
  url.searchParams.set("minorversion", "75");
  return url;
}

/** Intuit consent page. It lands on the redirect URL with ?code=…&realmId=…, the same flow as dash. */
export async function qboAuthUrl() {
  const { clientId, redirectUri } = await qbConfig("clientId", "redirectUri");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: redirectUri,
    response_type: "code",
    state: "estoque",
  }).toString();
  return url.toString();
}

/** The bare code, or the whole address the consent page landed on. */
export function readAuthCode(pasted: string) {
  const raw = pasted.trim();
  if (!raw.includes("code=")) return { code: raw, realmId: "" };
  const params = new URLSearchParams(raw.slice(raw.indexOf("?") + 1));
  return { code: params.get("code") ?? "", realmId: params.get("realmId") ?? "" };
}

/** Null means Intuit answered invalid_grant: that code or refresh token is dead for good. */
async function tokenRequest(config: QbConfig, body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (res.ok && data.access_token) return { ...data, access_token: data.access_token };
  if (data.error === "invalid_grant") return null;
  throw new Error(data.error_description || data.error || `QuickBooks token request failed (${res.status})`);
}

function tokenFields(data: { access_token: string; refresh_token?: string; expires_in?: number }) {
  return {
    qbAccessToken: data.access_token,
    qbAccessExpires: new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000),
    qbRefreshToken: data.refresh_token,
  };
}

/** This app's own QuickBooks connection. Sharing dash's refresh token breaks one of the two apps on every rotation. */
export async function qboConnect(pasted: string) {
  const config = await qbConfig("clientId", "clientSecret", "realmId", "redirectUri");
  const { code, realmId } = readAuthCode(pasted);
  if (!code) throw new Error("Paste the address QuickBooks sent you to.");
  if (realmId && realmId !== config.realmId) {
    throw new Error("That approval is for a different QuickBooks company.");
  }
  const data = await tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  if (!data) {
    throw new Error("That code expired or was already used. Click Connect QuickBooks and paste the new address within 5 minutes.");
  }
  const tokens = { ...tokenFields(data), qbSyncError: null };
  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: tokens,
    create: { id: "default", ...tokens },
  });
  // Connected only once QuickBooks answers with it (a different company, a reused code…).
  const check = await qboFetch(`companyinfo/${config.realmId}`);
  if (!check.ok) {
    await prisma.appSettings.update({ where: { id: "default" }, data: CLEARED });
    throw new Error(REFUSED);
  }
}

/** What a refused or revoked connection leaves behind: nothing to retry. */
const CLEARED = { qbRefreshToken: null, qbAccessToken: null, qbAccessExpires: null };

/**
 * Intuit rotates the refresh token and the old one stops working, so refreshes run
 * one at a time (advisory lock) and the newest token is always saved. A dead token is
 * cleared, so nothing keeps retrying it until someone connects again.
 * `refused` is an access token QuickBooks just answered 401 to: a fresh one is fetched instead.
 */
export async function qboAccessToken(refused?: string) {
  const config = await qbConfig("clientId", "clientSecret");
  const token = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7311)`;
      const settings = await tx.appSettings.findUnique({ where: { id: "default" } });
      if (
        settings?.qbAccessToken &&
        settings.qbAccessToken !== refused &&
        settings.qbAccessExpires &&
        settings.qbAccessExpires.getTime() > Date.now() + 60_000
      ) {
        return settings.qbAccessToken;
      }
      if (!settings?.qbRefreshToken) throw new Error(NOT_CONNECTED);
      const data = await tokenRequest(config, {
        grant_type: "refresh_token",
        refresh_token: settings.qbRefreshToken,
      });
      await tx.appSettings.update({ where: { id: "default" }, data: data ? tokenFields(data) : CLEARED });
      return data?.access_token ?? null;
    },
    { timeout: 20_000 },
  );
  if (!token) throw new Error(EXPIRED);
  return token;
}

/**
 * Every QuickBooks API call goes through here. A 401 means the access token was refused:
 * get a fresh one and retry once. Refused again means the connection itself is bad
 * (revoked, or a different company), so it's cleared and the message says what to do.
 */
async function qboFetch(path: string, params: Record<string, string> = {}, body?: unknown) {
  const url = await qboUrl(path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let token = await qboAccessToken();
  for (let retried = false; ; retried = true) {
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status !== 401) return res;
    if (retried) {
      await prisma.appSettings.update({ where: { id: "default" }, data: CLEARED });
      throw new Error(REFUSED);
    }
    token = await qboAccessToken(token);
  }
}

export async function qboQuery(entity: string, where = "", orderby = "") {
  const rows: unknown[] = [];
  let start = 1;
  while (true) {
    let query = `SELECT * FROM ${entity}`;
    if (where) query += ` WHERE ${where}`;
    if (orderby) query += ` ORDERBY ${orderby}`;
    query += ` STARTPOSITION ${start} MAXRESULTS 1000`;
    const res = await qboFetch("query", { query });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `QuickBooks ${entity} query failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      QueryResponse?: Record<string, unknown>;
    };
    const raw = json.QueryResponse?.[entity];
    const page = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (!page.length) break;
    rows.push(...page);
    if (page.length < 1000) break;
    start += 1000;
  }
  return rows;
}

export async function qboInvoice(id: string) {
  const res = await qboFetch(`invoice/${id}`);
  if (res.status === 404) return { Id: id, status: "Deleted" };
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QuickBooks invoice ${id} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { Invoice?: unknown };
  return json.Invoice ?? json;
}

export async function qboChanges(changedSince: string) {
  const res = await qboFetch("cdc", { entities: "Invoice", changedSince });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QuickBooks changes failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    CDCResponse?: Array<{ QueryResponse?: Array<Record<string, unknown>> }>;
  };
  const rows: unknown[] = [];
  for (const block of json.CDCResponse ?? []) {
    for (const query of block.QueryResponse ?? []) {
      const invoices = query.Invoice;
      if (Array.isArray(invoices)) rows.push(...invoices);
      else if (invoices) rows.push(invoices);
    }
  }
  return rows;
}

export type QbItem = {
  Id?: string;
  SyncToken?: string;
  Name?: string;
  Sku?: string;
  Type?: string;
  UnitPrice?: number;
  MetaData?: { LastUpdatedTime?: string };
};

/** What a product remembers of its item, to tell a QuickBooks edit from a stock movement. */
export function seenOf(item: QbItem) {
  return JSON.stringify({ name: item.Name?.trim() ?? "", sku: item.Sku?.trim() ?? "", price: Number(item.UnitPrice) || 0 });
}

export function itemUpdatedAt(item: QbItem | null | undefined) {
  const at = item?.MetaData?.LastUpdatedTime;
  return at ? new Date(at) : null;
}

/** The slice of an item the link pickers and the matching table show. */
export function itemView(item: QbItem) {
  return { id: String(item.Id), name: item.Name ?? "", sku: item.Sku ?? "", price: Number(item.UnitPrice) || 0 };
}

/** Items a product can link to. Category headers (Door, Grill…) are left out. */
export async function qboItems() {
  const rows = (await qboQuery("Item", "Active = true", "Name")) as QbItem[];
  return rows.filter((item) => item.Id && item.Type !== "Category").map(itemView);
}

/** QuickBooks errors are JSON faults. Their Detail is the readable part. */
function faultMessage(body: string) {
  try {
    const error = JSON.parse(body)?.Fault?.Error?.[0];
    if (error) return String(error.Detail || error.Message);
  } catch {}
  return body.slice(0, 300);
}

export async function qboItem(id: string) {
  const res = await qboFetch(`item/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QuickBooks item ${id} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { Item?: QbItem };
  return json.Item ?? null;
}

/**
 * Push the app name (as `ID - category family variant`), SKU and B2B price to the linked
 * QuickBooks item. Saves the item's new LastUpdatedTime on the product so the next sync
 * doesn't pull our own change back. Returns the item as QuickBooks now has it, or null when
 * the product isn't linked.
 */
export async function pushQuickBooksItem(product: {
  id: string;
  code: string;
  name: string;
  sku: string;
  secondarySku: string | null;
  b2bPrice: number;
}) {
  const id = product.secondarySku?.startsWith("qb:") ? product.secondarySku.slice(3) : "";
  if (!id) return null;
  const current = await qboItem(id);
  if (!current?.SyncToken) return null;
  const name = quickBooksName(product.code, product.name);
  const price = product.b2bPrice > 0 ? product.b2bPrice : undefined;
  let pushed: QbItem = current;
  if (current.Name !== name || (current.Sku ?? "") !== product.sku || (price !== undefined && current.UnitPrice !== price)) {
    const res = await qboFetch(
      "item",
      { operation: "update" },
      { Id: id, SyncToken: current.SyncToken, Name: name, Sku: product.sku, UnitPrice: price, sparse: true },
    );
    if (!res.ok) throw new Error(faultMessage(await res.text()) || "QuickBooks item update failed");
    pushed = ((await res.json()) as { Item?: QbItem }).Item ?? current;
  }
  await prisma.product.update({
    where: { id: product.id },
    data: { qbUpdatedAt: itemUpdatedAt(pushed), qbSeen: seenOf(pushed) },
  });
  return pushed;
}
