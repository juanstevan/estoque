"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Link2,
  Link2Off,
  LogOut,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { putFile } from "@/components/chaleur/MediaLibrary";
import { ProductDialog, uniqueProductTypes, type ProductRow } from "@/components/chaleur/ProductDialog";
import {
  QuickBooksPicker,
  linkQuickBooks,
  linkedItemId,
  loadQuickBooksItems,
  matchQuickBooks,
  type QbItem,
} from "@/components/chaleur/QuickBooksPicker";
import { ErrorLine, Row, blurOnEnter, type Note } from "@/components/chaleur/SettingsRow";
import { UsersSection } from "@/components/chaleur/SettingsUsers";
import { PreferencesSection, type PrefsView } from "@/components/chaleur/SettingsPreferences";
import { AREA_LABELS, TABS, can, type Tab } from "@/lib/access";
import type { Me } from "@/lib/auth";
import { formatSmartDate } from "@/lib/format";
import { quickBooksName } from "@/lib/photos/name";
import { cn } from "@/lib/utils";

export type SettingsView = {
  companyName: string;
  companyPhone: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  accentColor: string | null;
  adjustmentReasons: string;
};

export type QuickBooksView = {
  clientId: string;
  clientSecret: string;
  realmId: string;
  redirectUri: string;
  connected: boolean;
  lastSync: string | null;
  syncError: string | null;
  authUrl: string | null;
};

export type SettingsData = { settings: SettingsView | null; qb: QuickBooksView | null; prefs: PrefsView | null };

type Section = "account" | "profile" | "users" | "preferences" | "developer";

const SECTIONS: { id: Section; label: string; icon: typeof Building2 }[] = [
  { id: "account", label: "Account", icon: Building2 },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "users", label: "Users", icon: Users },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "developer", label: "Developer", icon: Code2 },
];

export const DEFAULT_REASONS = ["Correction", "Adjust", "Return", "Warranty"];

export function parseReasons(raw: string | undefined) {
  try {
    const list = JSON.parse(raw ?? "");
    return Array.isArray(list) ? list.map(String) : DEFAULT_REASONS;
  } catch {
    return DEFAULT_REASONS;
  }
}

export function SettingsDialog({
  open,
  onOpenChange,
  me,
  data,
  products,
  onData,
  onProductsChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: Me;
  data: SettingsData;
  products: ProductRow[];
  /** Saved settings from the server, or a color being previewed. */
  onData: (data: SettingsData) => void;
  /** Reloads products; resolves once they're in. */
  onProductsChanged: () => Promise<void>;
}) {
  const settingsView = can(me.access, "settings", "view");
  const settingsEdit = can(me.access, "settings", "edit");
  const sections = SECTIONS.filter(
    (s) =>
      s.id === "profile" ||
      (s.id === "users" && me.main) ||
      (s.id === "developer" ? settingsEdit : (s.id === "account" || s.id === "preferences") && settingsView),
  );
  const [picked, setPicked] = useState<Section>("account");
  const section = sections.some((s) => s.id === picked) ? picked : sections[0]!.id;
  const [devTab, setDevTab] = useState("quickbooks");
  const [usersTab, setUsersTab] = useState<"people" | "roles">("people");
  const [prefTab, setPrefTab] = useState<Tab>("delivery");
  const [note, setNote] = useState<Note>(null);
  const [aside, setAside] = useState("");
  const matching = section === "developer" && devTab === "products";
  const hidden = data.prefs?.hiddenTabs ?? [];

  /** Autosave. The top bar says Saving…, Saved, or what went wrong. */
  async function save(patch: Record<string, unknown>) {
    setNote({ text: "Saving…" });
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNote({ error: true, text: body.error ?? "Couldn't save" });
      return false;
    }
    onData({ settings: body.settings, qb: body.qb, prefs: body.prefs });
    setNote({ text: "Saved" });
    return true;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[80vh] w-[80vw] max-w-none gap-0 overflow-hidden rounded-[9px] p-0 sm:max-w-none"
      >
        <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-gray-50">
          <div className="flex h-topbar shrink-0 items-center px-4">
            <DialogTitle>Settings</DialogTitle>
          </div>
          <div className="flex flex-col gap-0.5 px-2">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPicked(id);
                  setNote(null);
                  setAside("");
                }}
                className={cn(
                  "flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                  section === id ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700 hover:bg-gray-150",
                )}
              >
                <Icon className={cn("size-4", section === id ? "text-blue-600" : "text-gray-500")} />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-topbar shrink-0 items-stretch gap-6 border-b border-border px-6">
            <h2 className="flex items-center text-md font-semibold text-gray-900">
              {SECTIONS.find((s) => s.id === section)?.label}
            </h2>
            {section === "developer" && (
              <Tabs value={devTab} onValueChange={(v) => setDevTab(String(v))} className="self-stretch">
                <TabsList variant="line" className="h-full w-fit border-b-0">
                  <TabsTrigger value="quickbooks">QuickBooks</TabsTrigger>
                  <TabsTrigger value="products">Products</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {section === "users" && (
              <Tabs value={usersTab} onValueChange={(v) => setUsersTab(v as "people" | "roles")} className="self-stretch">
                <TabsList variant="line" className="h-full w-fit border-b-0">
                  <TabsTrigger value="people">People</TabsTrigger>
                  <TabsTrigger value="roles">Roles</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {section === "preferences" && (
              <Tabs value={prefTab} onValueChange={(v) => setPrefTab(v as Tab)} className="self-stretch">
                <TabsList variant="line" className="h-full w-fit border-b-0">
                  {TABS.map((t) => (
                    <TabsTrigger key={t} value={t} className={cn(hidden.includes(t) && prefTab !== t && "text-gray-400")}>
                      {AREA_LABELS[t]}
                      {hidden.includes(t) && <EyeOff className="size-3" aria-label="hidden" />}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            <div className="ml-auto flex items-center gap-3">
              {note ? (
                <span className={cn("text-xs", note.error ? "text-danger-text" : "text-gray-500")}>{note.text}</span>
              ) : (
                aside && <span className="text-xs text-gray-500">{aside}</span>
              )}
              <Tooltip>
                <TooltipTrigger
                  render={<Button size="icon-sm" variant="ghost" aria-label="Close settings" onClick={() => onOpenChange(false)} />}
                >
                  <X />
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <div
            className={cn(
              "min-h-0 flex-1",
              section === "users" && usersTab === "roles"
                ? "flex flex-col"
                : matching || section === "users"
                  ? "flex flex-col px-6 py-6"
                  : "overflow-y-auto px-6 py-2",
            )}
          >
            {section === "account" && data.settings && (
              <Account
                settings={data.settings}
                readOnly={!settingsEdit}
                save={save}
                onPreview={(settings) => onData({ ...data, settings })}
                onNote={setNote}
              />
            )}
            {section === "profile" && <Profile onNote={setNote} />}
            {section === "users" && (
              <UsersSection
                view={usersTab}
                meId={me.id}
                onNote={setNote}
                onAside={setAside}
                onOpenRoles={() => setUsersTab("roles")}
              />
            )}
            {section === "preferences" && data.prefs && (
              <PreferencesSection tab={prefTab} prefs={data.prefs} main={me.main} canEdit={settingsEdit} save={save} />
            )}
            {section === "developer" && devTab === "quickbooks" && data.qb && (
              <QuickBooks
                qb={data.qb}
                save={save}
                onRefresh={async () => {
                  const body = await fetch("/api/settings").then((r) => r.json());
                  onData({ settings: body.settings, qb: body.qb, prefs: body.prefs });
                  void onProductsChanged();
                }}
              />
            )}
            {matching && (
              <Matching
                products={products}
                reasons={parseReasons(data.settings?.adjustmentReasons)}
                onChanged={onProductsChanged}
              />
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Account({
  settings,
  readOnly,
  save,
  onPreview,
  onNote,
}: {
  settings: SettingsView;
  readOnly: boolean;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
  onPreview: (settings: SettingsView) => void;
  onNote: (note: Note) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const reasons = parseReasons(settings.adjustmentReasons);

  async function uploadLogo(file: File) {
    setUploading(true);
    onNote({ text: "Saving…" });
    try {
      const { storage } = await fetch("/api/photos/upload").then((r) => r.json());
      await save({ logoUrl: await putFile(file, storage) });
    } catch (e) {
      onNote({ error: true, text: e instanceof Error ? e.message : "The logo didn't upload" });
    } finally {
      setUploading(false);
    }
  }

  return (
    // View-only roles see the account settings but every control is off.
    <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      <Row title="Logo" hint="PNG, JPG or WebP. Shown in the top bar.">
        <div className="flex h-8 w-24 items-center justify-center overflow-hidden rounded-md border border-border bg-gray-50">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="max-h-7 max-w-[88px] object-contain" />
          ) : (
            <ImageIcon className="size-4 text-gray-400" />
          )}
        </div>
        <Button variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "Uploading…" : "Upload logo"}
        </Button>
        {settings.logoUrl && (
          <Button variant="ghost" onClick={() => void save({ logoUrl: null })}>
            Remove
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadLogo(file);
          }}
        />
      </Row>
      <Row title="Brand color" hint="The top bar.">
        <ColorField
          label="Brand color"
          value={settings.brandColor}
          fallback="#ffffff"
          onPreview={(brandColor) => onPreview({ ...settings, brandColor })}
          onSave={(brandColor) => void save({ brandColor })}
        />
      </Row>
      <Row title="Accent color" hint="Buttons, tabs, selection and focus.">
        <ColorField
          label="Accent color"
          value={settings.accentColor}
          fallback="#2a48c4"
          onPreview={(accentColor) => onPreview({ ...settings, accentColor })}
          onSave={(accentColor) => void save({ accentColor })}
        />
      </Row>
      <Row title="Company name">
        <Input
          key={settings.companyName}
          className="w-72"
          aria-label="Company name"
          defaultValue={settings.companyName}
          onKeyDown={blurOnEnter}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== settings.companyName) void save({ companyName: name });
          }}
        />
      </Row>
      <Row title="Phone" hint="Customers see it on their tracking page.">
        <Input
          key={settings.companyPhone ?? ""}
          className="w-72"
          aria-label="Company phone"
          placeholder="(407) 555-0100"
          defaultValue={settings.companyPhone ?? ""}
          onKeyDown={blurOnEnter}
          onBlur={(e) => {
            const phone = e.target.value.trim();
            if (phone !== (settings.companyPhone ?? "")) void save({ companyPhone: phone || null });
          }}
        />
      </Row>
      <Row stacked title="Adjustment reasons" hint="Offered when stock is corrected.">
        <Reasons value={reasons} onSave={(next) => void save({ adjustmentReasons: next })} />
      </Row>
    </fieldset>
  );
}

/** Swatch plus hex. Dragging previews right away and saves once the color settles. */
function ColorField({
  label,
  value,
  fallback,
  onPreview,
  onSave,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onPreview: (value: string | null) => void;
  onSave: (value: string | null) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setText(value ?? ""), [value]);

  function pick(next: string) {
    onPreview(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(next), 400);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border"
        style={{ backgroundColor: value ?? fallback }}
      >
        <input
          type="color"
          aria-label={label}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          value={value ?? fallback}
          onChange={(e) => pick(e.target.value)}
        />
      </label>
      <Input
        aria-label={`${label} hex`}
        className="w-28 font-mono text-xs"
        placeholder={fallback}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={blurOnEnter}
        onBlur={() => {
          const next = text.trim().toLowerCase();
          if (next === (value ?? "")) return;
          if (!next) onSave(null);
          else if (/^#[0-9a-f]{6}$/.test(next)) {
            onPreview(next);
            onSave(next);
          } else setText(value ?? "");
        }}
      />
      {value && (
        <Button
          variant="ghost"
          onClick={() => {
            onPreview(null);
            onSave(null);
          }}
        >
          Reset
        </Button>
      )}
    </div>
  );
}

function Reasons({ value, onSave }: { value: string[]; onSave: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((reason) => {
        // "Return" marks the movement as a return, so it always stays.
        const locked = reason.toLowerCase() === "return";
        return (
          <span
            key={reason}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-surface pl-2.5 text-sm text-gray-800",
              locked ? "pr-2.5" : "pr-1",
            )}
          >
            {reason}
            {!locked && (
              <button
                type="button"
                aria-label={`Remove ${reason}`}
                className="inline-flex size-5 items-center justify-center rounded-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                onClick={() => onSave(value.filter((r) => r !== reason))}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        );
      })}
      <Input
        className="h-7 w-40"
        placeholder="Add reason"
        aria-label="Add reason"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const reason = draft.trim();
          if (reason && !value.some((r) => r.toLowerCase() === reason.toLowerCase())) onSave([...value, reason]);
          setDraft("");
        }}
      />
    </div>
  );
}

function Profile({ onNote }: { onNote: (note: Note) => void }) {
  const [me, setMe] = useState<{ name: string; username: string } | null>(null);
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");

  useEffect(() => {
    void fetch("/api/auth")
      .then((r) => r.json())
      .then(setMe);
  }, []);

  async function saveProfile(patch: Record<string, string>) {
    onNote({ text: "Saving…" });
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profile", ...patch }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      onNote({ error: true, text: body.error ?? "Couldn't save" });
      return false;
    }
    setMe(body);
    onNote({ text: "Saved" });
    return true;
  }

  if (!me) return null;
  return (
    <>
      <Row title="Name">
        <Input
          key={me.name}
          className="w-72"
          aria-label="Name"
          defaultValue={me.name}
          onKeyDown={blurOnEnter}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name !== me.name) void saveProfile({ name });
          }}
        />
      </Row>
      <Row title="Username" hint="Used to sign in.">
        <Input
          key={me.username}
          className="w-72"
          aria-label="Username"
          autoComplete="username"
          defaultValue={me.username}
          onKeyDown={blurOnEnter}
          onBlur={(e) => {
            const username = e.target.value.trim();
            if (username !== me.username) void saveProfile({ username });
          }}
        />
      </Row>
      <Row title="Password" hint="At least 8 characters.">
        <Input
          type="password"
          className="w-36"
          aria-label="New password"
          autoComplete="new-password"
          placeholder="New"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Input
          type="password"
          className="w-36"
          aria-label="Repeat new password"
          autoComplete="new-password"
          placeholder="Repeat"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!next || !again}
          onClick={async () => {
            if (next !== again) {
              onNote({ error: true, text: "The two passwords don't match" });
              return;
            }
            if (await saveProfile({ password: next })) {
              setNext("");
              setAgain("");
            }
          }}
        >
          Change password
        </Button>
      </Row>
      <Row title="Log out" hint="Ends the session in this browser.">
        <Button
          variant="secondary"
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
        </Button>
      </Row>
    </>
  );
}

function syncedWhen(at: string) {
  const when = formatSmartDate(at);
  return /^(Just now|Yesterday)$/.test(when) ? when.toLowerCase() : when;
}

function QuickBooks({
  qb,
  save,
  onRefresh,
}: {
  qb: QuickBooksView;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => Promise<void>;
}) {
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const problem = syncError || qb.syncError;

  async function sync() {
    setSyncing(true);
    setSyncError("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setSyncError(body.error ?? "Sync failed");
    await onRefresh().catch(() => undefined);
    setSyncing(false);
  }

  return (
    <>
      <Row
        title="Connection"
        hint={qb.connected ? (qb.lastSync ? `Synced ${syncedWhen(qb.lastSync)}` : "Not synced yet") : "Connect to sync invoices and products."}
      >
        <span className="flex items-center gap-1.5 text-sm text-gray-700">
          <span className={cn("size-2 rounded-full", qb.connected ? "bg-success-text" : "bg-gray-300")} />
          {qb.connected ? "Connected" : "Not connected"}
        </span>
        <Button variant="secondary" disabled={!qb.connected || syncing} onClick={() => void sync()}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </Row>
      {problem && <ErrorLine>{problem}</ErrorLine>}
      <Row title="Client ID">
        <SecretField label="Client ID" value={qb.clientId} onSave={(qbClientId) => void save({ qbClientId })} />
      </Row>
      <Row title="Client secret">
        <SecretField label="Client secret" value={qb.clientSecret} onSave={(qbClientSecret) => void save({ qbClientSecret })} />
      </Row>
      <Row title="Company ID" hint="Also called the realm ID.">
        <SecretField label="Company ID" value={qb.realmId} onSave={(qbRealmId) => void save({ qbRealmId })} />
      </Row>
      <Row title="Redirect URL" hint="The same one listed in the Intuit app.">
        <SecretField label="Redirect URL" value={qb.redirectUri} onSave={(qbRedirectUri) => void save({ qbRedirectUri })} />
      </Row>
      <Row title="Approve access" hint="Opens QuickBooks in a new tab.">
        <Button variant="secondary" disabled={!qb.authUrl} onClick={() => qb.authUrl && window.open(qb.authUrl, "_blank")}>
          Connect QuickBooks
        </Button>
      </Row>
      <Row title="Address after approving" hint="Paste it here within 5 minutes.">
        <Input
          className="w-72"
          aria-label="Address after approving"
          autoComplete="off"
          disabled={connecting}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Button
          disabled={!address.trim() || connecting}
          onClick={async () => {
            // One submit only: QuickBooks revokes the connection when a code is used twice.
            setConnecting(true);
            if (await save({ qbConnect: address.trim() })) setAddress("");
            else await onRefresh().catch(() => undefined);
            setConnecting(false);
          }}
        >
          {connecting ? "Connecting…" : "Save connection"}
        </Button>
      </Row>
    </>
  );
}

/** Masked like a password, with Show and Copy. Saves when you leave the field. */
function SecretField({ label, value, onSave }: { label: string; value: string; onSave: (value: string | null) => void }) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(value), [value]);

  return (
    <div className="relative w-80">
      <Input
        type={shown ? "text" : "password"}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        className="pr-16 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={blurOnEnter}
        onBlur={() => {
          if (text.trim() !== value) onSave(text.trim() || null);
        }}
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={<Button size="icon-xs" variant="ghost" aria-label={shown ? "Hide" : "Show"} onClick={() => setShown((v) => !v)} />}
          >
            {shown ? <EyeOff /> : <Eye />}
          </TooltipTrigger>
          <TooltipContent>{shown ? "Hide" : "Show"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Copy"
                disabled={!text}
                onClick={() =>
                  void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  })
                }
              />
            }
          >
            {copied ? <Check /> : <Copy />}
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

type View = "all" | "linked" | "unlinked";
const VIEWS: Record<View, string> = { all: "All products", linked: "Linked", unlinked: "Not linked" };
type LinkState = "same" | "differs" | "missing" | "unlinked" | "loading";
type MatchRow = ProductRow & { itemId: string | null; item: QbItem | null; suggestion: QbItem | null; state: LinkState };

const STATE: Record<LinkState, { tip: string; tone: string; off?: boolean }> = {
  same: { tip: "Linked", tone: "text-success-text" },
  differs: { tip: "Details differ. Click to match.", tone: "text-warning-text" },
  missing: { tip: "Not found among active QuickBooks items", tone: "text-danger-text" },
  unlinked: { tip: "Not linked", tone: "text-gray-400", off: true },
  loading: { tip: "Loading QuickBooks", tone: "text-gray-300" },
};

/**
 * App products on the left, their QuickBooks item on the right, the link state in between.
 * A row opens the product card; an orange link makes both sides the same.
 */
function Matching({
  products,
  reasons,
  onChanged,
}: {
  products: ProductRow[];
  reasons: string[];
  onChanged: () => Promise<void>;
}) {
  const [items, setItems] = useState<QbItem[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");
  const [matching, setMatching] = useState<string[]>([]);
  const [card, setCard] = useState<string | null>(null);

  function load(fresh = false) {
    setError("");
    loadQuickBooksItems(fresh).then(setItems, (e: Error) => setError(e.message));
  }
  useEffect(() => load(), []);

  const rows = useMemo<MatchRow[]>(() => {
    const byId = new Map((items ?? []).map((item) => [item.id, item]));
    const base = products.map((p) => {
      const itemId = linkedItemId(p.secondarySku);
      return { ...p, itemId, item: itemId ? (byId.get(itemId) ?? null) : null };
    });
    // Suggest for unlinked products: the free item whose name starts with "<ID> - ", else the same SKU.
    const taken = new Set(base.flatMap((row) => (row.itemId ? [row.itemId] : [])));
    const byCode = new Map<string, QbItem>();
    const bySku = new Map<string, QbItem>();
    for (const item of items ?? []) {
      if (taken.has(item.id)) continue;
      const code = item.name.match(/^(\w{1,3}) ?- /)?.[1]?.toUpperCase();
      if (code && !byCode.has(code)) byCode.set(code, item);
      if (item.sku && !bySku.has(item.sku.toLowerCase())) bySku.set(item.sku.toLowerCase(), item);
    }
    return base.map((row) => {
      const same =
        row.item &&
        row.item.name === quickBooksName(row.code, row.name) &&
        row.item.sku === row.sku &&
        (row.b2bPrice <= 0 || row.item.price === row.b2bPrice);
      return {
        ...row,
        suggestion: row.itemId ? null : (byCode.get(row.code.toUpperCase()) ?? bySku.get(row.sku.toLowerCase()) ?? null),
        state: !row.itemId ? "unlinked" : !items ? "loading" : !row.item ? "missing" : same ? "same" : "differs",
      };
    });
  }, [products, items]);

  const takenBy = useMemo(() => new Map(rows.flatMap((row) => (row.itemId ? [[row.itemId, row.code] as const] : []))), [rows]);
  const counts: Record<View, number> = {
    all: rows.length,
    linked: rows.filter((row) => row.itemId).length,
    unlinked: rows.filter((row) => !row.itemId).length,
  };
  const q = search.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      (view === "all" || (view === "linked") === Boolean(row.itemId)) &&
      (!q || `${row.code} ${row.name} ${row.sku}`.toLowerCase().includes(q)),
  );

  async function link(row: MatchRow, itemId: string | null) {
    await linkQuickBooks(row.id, itemId);
    await onChanged();
  }

  async function match(row: MatchRow) {
    setError("");
    setMatching((ids) => [...ids, row.id]);
    try {
      setItems(await matchQuickBooks(row.id));
    } catch (e) {
      setError(`${row.code}: ${e instanceof Error ? e.message : "Couldn't match the product"}`);
    } finally {
      // Also after an error: the app side may have changed before QuickBooks refused.
      await onChanged().catch(() => {});
      setMatching((ids) => ids.filter((id) => id !== row.id));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
          <Input className="pl-9" placeholder="Search by name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={view} onValueChange={(v) => setView((v ?? "all") as View)}>
          <SelectTrigger className="w-44">
            <SelectValue>{(value: string) => VIEWS[value as View]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(VIEWS) as View[]).map((key) => (
              <SelectItem key={key} value={key}>
                {VIEWS[key]}
                <span className="ml-auto text-xs text-gray-500 tabular-nums">{counts[key]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger
            render={<Button size="icon" variant="secondary" aria-label="Reload QuickBooks items" onClick={() => load(true)} />}
          >
            <RefreshCw />
          </TooltipTrigger>
          <TooltipContent>Reload QuickBooks items</TooltipContent>
        </Tooltip>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-danger-border bg-danger-fill px-4 py-3 text-sm text-danger-text">
          <AlertCircle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          {!items && (
            <Button size="sm" variant="secondary" onClick={() => load(true)}>
              Try again
            </Button>
          )}
        </div>
      )}

      <DataGrid
        rows={visible}
        getRowId={(row) => row.id}
        onRowClick={(row) => setCard(row.id)}
        empty={search ? `No matches for "${search}"` : "No products"}
        columns={[
          { key: "code", label: "ID", mono: true, width: "72px" },
          {
            key: "name",
            label: "Name",
            render: (row) => <span className="font-medium text-gray-900" title={row.name}>{row.name}</span>,
          },
          { key: "sku", label: "SKU", mono: true, width: "150px" },
          {
            key: "state",
            label: "",
            plain: true,
            width: "48px",
            align: "center",
            render: (row) => {
              const { tip, tone, off } = STATE[row.state];
              const Icon = off ? Link2Off : Link2;
              return (
                // The QuickBooks side is not the product card.
                <span className="inline-flex align-middle" onClick={(e) => e.stopPropagation()}>
                  {matching.includes(row.id) ? (
                    <RefreshCw className="size-4 animate-spin text-gray-400" />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          row.state === "differs" ? (
                            <Button size="icon-xs" variant="ghost" aria-label="Match with QuickBooks" onClick={() => void match(row)} />
                          ) : (
                            <span className="inline-flex" />
                          )
                        }
                      >
                        <Icon className={cn("size-4", tone)} />
                      </TooltipTrigger>
                      <TooltipContent>{tip}</TooltipContent>
                    </Tooltip>
                  )}
                </span>
              );
            },
          },
          {
            key: "qb",
            label: "QuickBooks item",
            filterValue: (row) => row.item?.name ?? "",
            sortValue: (row) => row.item?.name ?? "",
            render: (row) => (
              <div className="flex min-w-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <QuickBooksPicker itemId={row.itemId} takenBy={takenBy} onPick={(itemId) => link(row, itemId)}>
                  <PopoverTrigger className="-mx-1.5 flex min-w-0 flex-1 items-center rounded-md px-1.5 py-1 text-left outline-none hover:bg-gray-100 aria-expanded:bg-gray-100">
                    <span className={cn("truncate", row.item ? "text-gray-900" : "text-gray-400")}>
                      {row.item?.name ?? row.suggestion?.name ?? (!items ? "—" : row.itemId ? "Not found" : "Choose item")}
                    </span>
                  </PopoverTrigger>
                </QuickBooksPicker>
                {row.suggestion && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Link suggested item"
                          onClick={() => void link(row, row.suggestion!.id).catch((e: Error) => setError(e.message))}
                        />
                      }
                    >
                      <Check />
                    </TooltipTrigger>
                    <TooltipContent>Link</TooltipContent>
                  </Tooltip>
                )}
              </div>
            ),
          },
          {
            key: "qbSku",
            label: "QuickBooks SKU",
            mono: true,
            width: "150px",
            filterValue: (row) => row.item?.sku ?? "",
            render: (row) => row.item?.sku || <span className="text-gray-400">—</span>,
          },
        ]}
      />

      <ProductDialog
        open={Boolean(card)}
        productId={card}
        reasons={reasons}
        types={uniqueProductTypes(products)}
        catalog={products}
        onClose={() => {
          setCard(null);
          // Edits there may have renamed the item in QuickBooks.
          load(true);
        }}
        onSaved={() => void onChanged()}
      />
    </div>
  );
}
