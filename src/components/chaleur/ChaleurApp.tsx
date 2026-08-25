"use client";

import { useEffect, useState } from "react";
import { Flame, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StorageTab } from "@/components/chaleur/StorageTab";
import { ImportsTab, type ImportRow } from "@/components/chaleur/ImportsTab";
import { ExitTab, type ExitRow } from "@/components/chaleur/ExitTab";
import type { ProductRow } from "@/components/chaleur/ProductDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChaleurApp({ userName }: { userName: string }) {
  const [tab, setTab] = useState("storage");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [exits, setExits] = useState<ExitRow[]>([]);
  const [search, setSearch] = useState("");
  const [reasons, setReasons] = useState([
    "Correction",
    "Adjust",
    "Return",
    "Warranty",
  ]);
  const [company, setCompany] = useState("Chaleur Manufacturing Co.");
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function load() {
    const [p, i, o, s] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/importations").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setProducts(p);
    setImports(i);
    setExits(o);
    if (s.settings?.companyName) setCompany(s.settings.companyName);
    if (s.settings?.adjustmentReasons) {
      try {
        setReasons(JSON.parse(s.settings.adjustmentReasons));
      } catch {
        /* keep defaults */
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex h-topbar shrink-0 items-stretch justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-gray-900" />
          <span className="text-sm font-semibold text-gray-900">Chaleur</span>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="self-stretch">
          <TabsList variant="line" className="h-full w-fit border-b-0">
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="imports">Imports</TabsTrigger>
            <TabsTrigger value="exit">Exit</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Settings"
                      />
                    }
                  />
                }
              >
                <Settings />
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>API config</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "logout" }),
                  });
                  window.location.href = "/login";
                }}
              >
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="min-h-0 flex-1 p-6">
        {tab === "storage" && (
          <StorageTab
            products={products}
            search={search}
            onSearch={setSearch}
            reasons={reasons}
            onReload={() => void load()}
          />
        )}
        {tab === "imports" && (
          <ImportsTab
            imports={imports}
            products={products}
            onReload={() => void load()}
          />
        )}
        {tab === "exit" && <ExitTab exits={exits} onReload={() => void load()} />}
      </main>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Account settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5">
            <Field label="Company">
              <Input
                className="max-w-120"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </Field>
            <Field label="Signed in as">
              <Input className="max-w-120" value={userName} disabled />
            </Field>
            <Field
              label="Adjustment reasons"
              hint="Comma separated. These are the options offered when stock is corrected."
            >
              <Input
                className="max-w-120"
                value={reasons.join(", ")}
                onChange={(e) =>
                  setReasons(
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await fetch("/api/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    companyName: company,
                    adjustmentReasons: reasons,
                  }),
                });
                setSettingsOpen(false);
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
