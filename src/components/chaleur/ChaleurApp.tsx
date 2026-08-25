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

export function ChaleurApp({
  userName,
}: {
  userName: string;
}) {
  const [tab, setTab] = useState("storage");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [exits, setExits] = useState<ExitRow[]>([]);
  const [search, setSearch] = useState("");
  const [reasons, setReasons] = useState(["Correction", "Adjust", "Return", "Warranty"]);
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
        /* keep */
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 font-semibold">
          <Flame className="size-5 text-orange-600" />
          Chaleur
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="storage">STORAGE</TabsTrigger>
            <TabsTrigger value="imports">IMPORTS</TabsTrigger>
            <TabsTrigger value="exit">EXIT</TabsTrigger>
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon" variant="ghost" />}>
            <Settings />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>Account</DropdownMenuItem>
            <DropdownMenuItem>API Config</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "logout" }),
                });
                window.location.href = "/login";
              }}
            >
              <LogOut className="mr-2 size-4" /> Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="min-h-0 flex-1 p-4">
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
          <ImportsTab imports={imports} products={products} onReload={() => void load()} />
        )}
        {tab === "exit" && <ExitTab exits={exits} onReload={() => void load()} />}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account settings</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label>Signed in as</Label>
            <Input value={userName} disabled />
          </div>
          <div>
            <Label>Adjustment reasons (comma separated)</Label>
            <Input value={reasons.join(", ")} onChange={(e) => setReasons(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                await fetch("/api/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ companyName: company, adjustmentReasons: reasons }),
                });
                setSettingsOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
