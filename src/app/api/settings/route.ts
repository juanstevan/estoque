import type { AppSettings } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can, parseHidden, type Tab } from "@/lib/access";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { guard } from "@/lib/guard";
import { qbSettings, qboAuthUrl, qboConnect } from "@/lib/quickbooks/qbo";

/** Anyone can read these (the login page may show the logo). Credentials and tokens never go here. */
function publicSettings(s: AppSettings | null) {
  if (!s) return null;
  return {
    companyName: s.companyName,
    companyPhone: s.companyPhone,
    logoUrl: s.logoUrl,
    brandColor: s.brandColor,
    accentColor: s.accentColor,
    adjustmentReasons: s.adjustmentReasons,
    yearColors: s.yearColors,
    importColumns: s.importColumns,
  };
}

/** Signed-in only: hidden tabs and the delivery rules. */
function preferences(s: AppSettings | null) {
  return {
    hiddenTabs: parseHidden(s?.hiddenTabs),
    stockStage: s?.stockStage ?? "completed",
    allowPaid: s?.allowPaid ?? true,
    allowUnpaid: s?.allowUnpaid ?? true,
    collectUnpaid: s?.collectUnpaid ?? true,
    prepMethod: s?.prepMethod === "scan" ? "scan" : "manual",
    trackingDays: s?.trackingDays ?? 7,
  };
}

/** Settings edit only: the credentials stay copyable in Settings → Developer. */
async function quickBooks(s: AppSettings | null) {
  return {
    ...(await qbSettings()),
    connected: Boolean(s?.qbRefreshToken),
    lastSync: s?.qbSyncedAt ?? null,
    syncError: s?.qbSyncError ?? null,
    authUrl: await qboAuthUrl().catch(() => null),
  };
}

export async function GET() {
  const [settings, suppliers, me] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: "default" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    currentUser(),
  ]);
  return jsonOk({
    settings: publicSettings(settings),
    suppliers: me ? suppliers : [],
    prefs: me ? preferences(settings) : null,
    qb: me && can(me.access, "settings", "edit") ? await quickBooks(settings) : null,
  });
}

function color(value: string | null | undefined) {
  if (value === undefined || value === null) return value;
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Colors must look like #2a48c4");
  return value.toLowerCase();
}

function text(value: string | null | undefined) {
  return value === undefined ? undefined : value?.trim() || null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]) {
  if (value === undefined) return undefined;
  if (!options.includes(value as T)) throw new Error("That option isn't available");
  return value as T;
}

function flag(value: unknown) {
  return value === undefined ? undefined : Boolean(value);
}

export async function POST(req: Request) {
  const me = await guard(null);
  if (me instanceof Response) return me;
  try {
    const body = await readJson<{
      companyName?: string;
      companyPhone?: string | null;
      logoUrl?: string | null;
      brandColor?: string | null;
      accentColor?: string | null;
      adjustmentReasons?: string[];
      importColumns?: unknown;
      suppliers?: string[];
      qbClientId?: string | null;
      qbClientSecret?: string | null;
      qbRealmId?: string | null;
      qbRedirectUri?: string | null;
      qbConnect?: string;
      hiddenTabs?: Tab[];
      stockStage?: string;
      allowPaid?: boolean;
      allowUnpaid?: boolean;
      collectUnpaid?: boolean;
      prepMethod?: string;
      trackingDays?: number;
    }>(req);
    // Imports keeps its own columns; hidden tabs are the main user's; the rest is Settings.
    const onlyImportColumns = Object.keys(body).every((key) => key === "importColumns");
    if (!can(me.access, onlyImportColumns ? ["imports", "settings"] : "settings", "edit")) {
      return jsonError("Your role can only view settings. Ask your main user for edit access.", 403);
    }
    if (body.hiddenTabs !== undefined && !me.main) return jsonError("Only the main user can hide tabs.", 403);
    const days = body.trackingDays === undefined ? undefined : Math.round(Number(body.trackingDays));
    if (days !== undefined && !(days >= 1 && days <= 90)) throw new Error("Tracking links last 1 to 90 days");
    const data = {
      companyName: body.companyName?.trim() || undefined,
      companyPhone: text(body.companyPhone),
      logoUrl: body.logoUrl,
      brandColor: color(body.brandColor),
      accentColor: color(body.accentColor),
      adjustmentReasons: body.adjustmentReasons ? JSON.stringify(body.adjustmentReasons) : undefined,
      importColumns: body.importColumns !== undefined ? JSON.stringify(body.importColumns) : undefined,
      qbClientId: text(body.qbClientId),
      qbClientSecret: text(body.qbClientSecret),
      qbRealmId: text(body.qbRealmId),
      qbRedirectUri: text(body.qbRedirectUri),
      hiddenTabs: body.hiddenTabs === undefined ? undefined : JSON.stringify(parseHidden(JSON.stringify(body.hiddenTabs))),
      stockStage: oneOf(body.stockStage, ["ready", "out", "completed"] as const),
      allowPaid: flag(body.allowPaid),
      allowUnpaid: flag(body.allowUnpaid),
      collectUnpaid: flag(body.collectUnpaid),
      prepMethod: oneOf(body.prepMethod, ["manual", "scan"] as const),
      trackingDays: days,
    };
    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });
    // After the credentials above are saved, so a connect uses what was just typed.
    if (body.qbConnect !== undefined) await qboConnect(body.qbConnect);
    if (body.suppliers) {
      await prisma.supplier.deleteMany();
      await prisma.supplier.createMany({
        data: body.suppliers.filter(Boolean).map((name) => ({ name })),
      });
    }
    const [settings, suppliers] = await Promise.all([
      prisma.appSettings.findUnique({ where: { id: "default" } }),
      prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    ]);
    return jsonOk({
      settings: publicSettings(settings),
      suppliers,
      prefs: preferences(settings),
      qb: can(me.access, "settings", "edit") ? await quickBooks(settings) : null,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Settings error", 400);
  }
}
