"use client";

import { useEffect, useState } from "react";
import { Eye, Flame, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { accentVars, brandVars } from "@/lib/theme";
import { AREA_LABELS, TABS, can, type Tab } from "@/lib/access";
import type { Me } from "@/lib/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StorageTab } from "@/components/chaleur/StorageTab";
import { ImportsTab, type ImportRow } from "@/components/chaleur/ImportsTab";
import { DeliveryTab } from "@/components/chaleur/delivery/DeliveryTab";
import { TaskTab } from "@/components/chaleur/TaskTab";
import { ReportsTab } from "@/components/chaleur/ReportsTab";
import { MediaLibrary } from "@/components/chaleur/MediaLibrary";
import { SettingsDialog, parseReasons, type SettingsData } from "@/components/chaleur/SettingsDialog";
import type { ProductRow } from "@/components/chaleur/ProductDialog";

const PRODUCT_AREAS = ["storage", "media", "imports", "settings"] as const;

export function ChaleurApp({ me }: { me: Me }) {
  const [data, setData] = useState<SettingsData>({ settings: null, qb: null, prefs: null });
  const hidden = data.prefs?.hiddenTabs ?? ["tasks", "reports"];
  const tabs = TABS.filter((t) => !hidden.includes(t) && can(me.access, t, "view"));
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab = picked && tabs.includes(picked) ? picked : tabs[0] ?? null;
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [synced, setSynced] = useState(0);
  const [importSeed, setImportSeed] = useState<{
    token: number;
    lines: { productId: string | null; name: string; quantity: number }[];
  } | null>(null);
  const reasons = parseReasons(data.settings?.adjustmentReasons);
  const accent = data.settings?.accentColor;
  const brand = data.settings?.brandColor;
  const viewOnly = tab ? !can(me.access, tab, "edit") : false;

  async function loadSettings() {
    const s = await fetch("/api/settings").then((r) => r.json());
    setData({ settings: s.settings, qb: s.qb, prefs: s.prefs });
  }

  async function load() {
    const json = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));
    const [p, i] = await Promise.all([
      can(me.access, [...PRODUCT_AREAS], "view") ? json("/api/products") : [],
      can(me.access, "imports", "view") ? json("/api/importations") : [],
      loadSettings(),
    ]);
    setProducts(p);
    setImports(i);
  }

  useEffect(() => {
    void load();
    // Loads once per person; `me` comes from the server and doesn't change in this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The accent re-tints every blue element. Unset, the stylesheet colors come back.
  useEffect(() => {
    if (!accent) return;
    const vars = accentVars(accent);
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) root.removeProperty(name);
    };
  }, [accent]);

  // QuickBooks both ways, once a minute while this tab is visible. The server runs one sync
  // per minute however many browsers ask, and stays quiet while QuickBooks isn't connected.
  useEffect(() => {
    function tick() {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", auto: true }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (!result?.changed) return;
          void load();
          setSynced((n) => n + 1);
        })
        .catch(() => undefined);
    }
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header
        className="flex h-topbar shrink-0 items-stretch justify-between border-b border-border bg-surface px-4"
        style={brand ? (brandVars(brand) as React.CSSProperties) : undefined}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {data.settings?.logoUrl ? (
            <img src={data.settings.logoUrl} alt={data.settings.companyName} className="h-7 w-auto max-w-40 object-contain" />
          ) : (
            <>
              <Flame className="size-5 shrink-0 text-gray-900" />
              <span className="truncate text-sm font-semibold text-gray-900">
                {data.settings?.companyName ?? "Chaleur"}
              </span>
            </>
          )}
        </div>

        {tab && (
          <Tabs value={tab} onValueChange={(value) => setPicked(value as Tab)} className="self-stretch">
            <TabsList variant="line" className="h-full w-fit border-b-0">
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {AREA_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <div className="flex flex-1 items-center justify-end gap-2">
          {viewOnly && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-gray-200 bg-gray-50 px-2 text-xs text-gray-600" />
                }
              >
                <Eye className="size-3" /> View only
              </TooltipTrigger>
              <TooltipContent>Your role can look around this tab but not change it.</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={<Button size="icon" variant="ghost" aria-label="Settings" onClick={() => setSettingsOpen(true)} />}
            >
              <Settings />
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <main
        className={cn(
          "min-h-0 flex-1 p-6",
          (tab === "reports" || tab === "media" || tab === "delivery") && "flex flex-col overflow-hidden",
        )}
      >
        {!tab && (
          <div className="mx-auto mt-24 max-w-sm text-center">
            <p className="text-md font-semibold text-gray-900">No tabs for your role yet</p>
            <p className="mt-1 text-sm text-gray-600">Ask your main user to give your role access in Settings › Users › Roles.</p>
          </div>
        )}
        {tab === "storage" && (
          <StorageTab
            products={products}
            search={search}
            onSearch={setSearch}
            reasons={reasons}
            onReload={() => void load()}
          />
        )}
        {tab === "media" && <MediaLibrary products={products} onChanged={load} />}
        {tab === "imports" && (
          <ImportsTab
            imports={imports}
            products={products}
            reasons={reasons}
            onImportsChange={setImports}
            onProductsReload={() => {
              void fetch("/api/products")
                .then((r) => r.json())
                .then(setProducts);
            }}
            seed={importSeed}
            onSeedDone={() => setImportSeed(null)}
          />
        )}
        {tab === "delivery" && (
          <DeliveryTab canEdit={can(me.access, "delivery", "edit")} prefs={data.prefs} refreshKey={synced} />
        )}
        {tab === "tasks" && <TaskTab />}
        {tab === "reports" && (
          <ReportsTab
            onCreateImport={(lines) => {
              setImportSeed({ token: Date.now(), lines });
              setPicked("imports");
            }}
          />
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        me={me}
        data={data}
        products={products}
        onData={setData}
        onProductsChanged={load}
      />
    </div>
  );
}
