"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, Lock, Ellipsis, Plus, RefreshCw, Search } from "lucide-react";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataGrid } from "@/components/chaleur/DataGrid";
import { ErrorLine, blurOnEnter, type Note } from "@/components/chaleur/SettingsRow";
import { AREAS, AREA_LABELS, type Access, type Area, type Level } from "@/lib/access";
import { PASSWORD_MIN } from "@/lib/password-rules";
import { formatSmartDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type PersonRow = {
  id: string;
  name: string;
  username: string;
  roleId: string | null;
  roleName: string | null;
  main: boolean;
  access: Access;
  status: "active" | "invited" | "off";
  lastSignInAt: string | null;
};
type RoleRow = { id: string; name: string; description: string; main: boolean; access: Access; people: number };
type Data = { people: PersonRow[]; roles: RoleRow[] };

const HINTS: Record<Area, string> = {
  storage: "Products, stock, movements and counts",
  media: "Photos and files",
  imports: "Containers and suppliers",
  delivery: "Invoices, scheduling, deliveries and collections",
  tasks: "Boards and tasks",
  reports: "Sales and supply reports",
  settings: "Account, Preferences and Developer. Everyone can change their own profile.",
};

async function send(body: object): Promise<Data & { savedRoleId?: string }> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save");
  return data;
}

/** Readable temporary password: no 0/O or 1/l. */
export function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function accessTags(access: Access, main: boolean) {
  if (main) return ["All tabs · Edit"];
  return AREAS.filter((area) => access[area] !== "none").map((area) => `${AREA_LABELS[area]} · ${access[area] === "edit" ? "Edit" : "View"}`);
}

function Tags({ access, main, wrap }: { access: Access; main: boolean; wrap?: boolean }) {
  const tags = accessTags(access, main);
  if (!tags.length) return <span className="text-gray-400">No access</span>;
  return (
    <div className={cn("flex gap-1.5", wrap ? "flex-wrap" : "overflow-hidden")} title={tags.join(", ")}>
      {tags.map((tag) => (
        <Badge key={tag} variant="tag">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

const STATUS: Record<PersonRow["status"], { label: string; variant: "success" | "info" | "neutral" }> = {
  active: { label: "Active", variant: "success" },
  invited: { label: "Invited", variant: "info" },
  off: { label: "Turned off", variant: "neutral" },
};

export function UsersSection({
  view,
  meId,
  onNote,
  onAside,
  onOpenRoles,
}: {
  view: "people" | "roles";
  meId: string;
  onNote: (note: Note) => void;
  onAside: (text: string) => void;
  onOpenRoles: (roleId?: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/users")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load people");
        setData(body);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!data) return;
    onAside(view === "people" ? `${data.people.length} ${data.people.length === 1 ? "person" : "people"}` : `${data.roles.length} roles`);
  }, [data, view, onAside]);

  async function run(body: object, done = "Saved") {
    onNote({ text: "Saving…" });
    try {
      const next = await send(body);
      setData({ people: next.people, roles: next.roles });
      onNote({ text: done });
      return next;
    } catch (e) {
      onNote({ error: true, text: e instanceof Error ? e.message : "Couldn't save" });
      throw e;
    }
  }

  if (error) return <div className="py-6"><ErrorLine>{error}</ErrorLine></div>;
  if (!data) return <p className="py-6 text-sm text-gray-500">Loading people…</p>;
  return view === "people" ? (
    <People
      data={data}
      meId={meId}
      run={run}
      onOpenRole={(id) => {
        setRoleId(id);
        onOpenRoles(id);
      }}
    />
  ) : (
    <Roles data={data} run={run} selected={roleId} onSelect={setRoleId} />
  );
}

// ---------------------------------------------------------------- people

function People({
  data,
  meId,
  run,
  onOpenRole,
}: {
  data: Data;
  meId: string;
  run: (body: object, done?: string) => Promise<unknown>;
  onOpenRole: (roleId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PersonRow | "new" | null>(null);
  const [resetting, setResetting] = useState<PersonRow | null>(null);
  const q = search.trim().toLowerCase();
  const rows = data.people.filter((p) => !q || `${p.name} ${p.username} ${p.roleName ?? ""}`.toLowerCase().includes(q));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
          <Input className="pl-9" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setEditing("new")}>Add person</Button>
      </div>
      <DataGrid
        rows={rows}
        getRowId={(p) => p.id}
        onRowClick={(p) => setEditing(p)}
        empty={search ? `No one matches "${search}"` : "No people yet"}
        columns={[
          {
            key: "name",
            label: "Person",
            width: "220px",
            render: (p) => (
              <span className={cn("flex items-center gap-2", p.status === "off" && "text-gray-400")}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-700">
                  {p.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="truncate font-medium text-gray-900">{p.name}</span>
                {p.id === meId && <Badge variant="tag">You</Badge>}
              </span>
            ),
          },
          { key: "username", label: "Username", mono: true, width: "120px" },
          { key: "roleName", label: "Role", width: "130px", render: (p) => p.roleName ?? <span className="text-gray-400">No role</span> },
          {
            key: "access",
            label: "Access",
            filterValue: (p) => accessTags(p.access, p.main).join(" "),
            render: (p) => <Tags access={p.access} main={p.main} />,
          },
          {
            key: "lastSignInAt",
            label: "Last sign-in",
            width: "130px",
            sortValue: (p) => p.lastSignInAt ?? "",
            render: (p) => (p.lastSignInAt ? formatSmartDate(p.lastSignInAt) : <span className="text-gray-400">—</span>),
          },
          {
            key: "status",
            label: "Status",
            width: "120px",
            filterValue: (p) => STATUS[p.status].label,
            render: (p) => (
              <Badge variant={STATUS[p.status].variant}>
                <BadgeDot />
                {STATUS[p.status].label}
              </Badge>
            ),
          },
          {
            key: "menu",
            label: "",
            plain: true,
            width: "48px",
            align: "center",
            render: (p) => (
              <span onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label={`Actions for ${p.name}`} />}>
                    <Ellipsis />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(p)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setResetting(p)}>Reset password</DropdownMenuItem>
                    {p.id !== meId && (
                      <DropdownMenuItem
                        onClick={() => void run({ action: p.status === "off" ? "activate" : "deactivate", id: p.id }).catch(() => undefined)}
                      >
                        {p.status === "off" ? "Turn on" : "Turn off"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            ),
          },
        ]}
      />
      <p className="text-xs text-gray-600">Only the main user can add people, change roles and reset passwords.</p>

      {editing && (
        <PersonDialog
          person={editing === "new" ? null : editing}
          roles={data.roles}
          onClose={() => setEditing(null)}
          onOpenRole={(id) => {
            setEditing(null);
            onOpenRole(id);
          }}
          onSave={async (body) => {
            await run(body, editing === "new" ? "Added" : "Saved");
            setEditing(null);
          }}
        />
      )}
      {resetting && (
        <ResetDialog
          person={resetting}
          onClose={() => setResetting(null)}
          onReset={async (password) => {
            await run({ action: "reset", id: resetting.id, password }, "Password reset");
          }}
        />
      )}
    </div>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <Input
        type={shown ? "text" : "password"}
        aria-label="Temporary password"
        autoComplete="off"
        spellCheck={false}
        className="pr-24 font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label={shown ? "Hide" : "Show"} onClick={() => setShown((v) => !v)} />}>
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
                onClick={() =>
                  void navigator.clipboard.writeText(value).then(() => {
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
        <Tooltip>
          <TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label="New password" onClick={() => onChange(temporaryPassword())} />}>
            <RefreshCw />
          </TooltipTrigger>
          <TooltipContent>New password</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function PersonDialog({
  person,
  roles,
  onClose,
  onSave,
  onOpenRole,
}: {
  person: PersonRow | null;
  roles: RoleRow[];
  onClose: () => void;
  onSave: (body: object) => Promise<void>;
  onOpenRole: (roleId: string) => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [username, setUsername] = useState(person?.username ?? "");
  const [roleId, setRoleId] = useState(person?.roleId ?? roles.find((r) => !r.main)?.id ?? roles[0]?.id ?? "");
  const [password, setPassword] = useState(() => temporaryPassword());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const role = roles.find((r) => r.id === roleId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave(person ? { action: "update", id: person.id, name, username, roleId } : { action: "add", name, username, roleId, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="person-name">Name</Label>
            <Input id="person-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="person-username">Username</Label>
            <Input
              id="person-username"
              className="font-mono"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
            <p className="text-xs text-gray-600">They sign in with this.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={(value) => setRoleId(String(value ?? ""))}>
              <SelectTrigger aria-label="Role" className="w-full">
                <SelectValue>{(value: string) => roles.find((r) => r.id === value)?.name ?? "Choose a role"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Access</span>
              <Tags access={role.access} main={role.main} wrap />
              {!role.main && (
                <button type="button" className="w-fit text-xs text-primary underline-offset-2 hover:underline" onClick={() => onOpenRole(role.id)}>
                  Change {role.name}’s access in Roles
                </button>
              )}
            </div>
          )}
          {!person && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Temporary password</span>
              <PasswordField value={password} onChange={setPassword} />
              <p className="text-xs text-gray-600">Share it with them. They choose their own password the first time they sign in.</p>
            </div>
          )}
          {error && <ErrorLine>{error}</ErrorLine>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || !username.trim() || !roleId || (!person && password.length < PASSWORD_MIN)}
            >
              {saving ? "Saving…" : person ? "Save" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ person, onClose, onReset }: { person: PersonRow; onClose: () => void; onReset: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState(() => temporaryPassword());
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Reset {person.name}’s password</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          {done
            ? "Done. Share the password with them; they choose their own at the next sign-in."
            : "They're signed out everywhere and choose a new password at the next sign-in."}
        </p>
        <PasswordField value={password} onChange={done ? () => undefined : setPassword} />
        {error && <ErrorLine>{error}</ErrorLine>}
        <DialogFooter>
          {done ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={password.length < PASSWORD_MIN}
                onClick={() =>
                  void onReset(password).then(
                    () => setDone(true),
                    (e: Error) => setError(e.message),
                  )
                }
              >
                Reset password
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- roles

const LEVELS: { id: Level; label: string }[] = [
  { id: "none", label: "No access" },
  { id: "view", label: "View" },
  { id: "edit", label: "Edit" },
];

function AccessSwitch({ value, label, disabled, onChange }: { value: Level; label: string; disabled?: boolean; onChange: (level: Level) => void }) {
  return (
    <div role="radiogroup" aria-label={`${label} access`} className="flex items-center gap-0.5 rounded-md bg-sunken p-0.5">
      {LEVELS.map((level) => (
        <button
          key={level.id}
          type="button"
          role="radio"
          aria-checked={value === level.id}
          disabled={disabled}
          onClick={() => onChange(level.id)}
          className={cn(
            "h-7 rounded-sm px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
            value === level.id ? "bg-surface text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-800",
          )}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}

function Roles({
  data,
  run,
  selected,
  onSelect,
}: {
  data: Data;
  run: (body: object, done?: string) => Promise<{ savedRoleId?: string }>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const role = data.roles.find((r) => r.id === selected) ?? data.roles.find((r) => !r.main) ?? data.roles[0];
  const [deleting, setDeleting] = useState(false);

  async function create() {
    const names = new Set(data.roles.map((r) => r.name.toLowerCase()));
    let name = "New role";
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `New role ${i}`;
    const saved = await run({ action: "save-role", name }, "Role added").catch(() => null);
    if (saved?.savedRoleId) onSelect(saved.savedRoleId);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-66 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border px-3 py-4">
        <Button variant="secondary" onClick={() => void create()}>
          <Plus /> New role
        </Button>
        <div className="flex flex-col gap-0.5" role="listbox" aria-label="Roles">
          {data.roles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={r.id === role?.id}
              onClick={() => onSelect(r.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-2 text-left",
                r.id === role?.id ? "bg-blue-50" : "hover:bg-gray-50",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium", r.id === role?.id ? "text-blue-700" : "text-gray-900")}>{r.name}</span>
                <span className="block text-xs text-gray-600">
                  {r.main ? "Full access · " : ""}
                  {r.people} {r.people === 1 ? "person" : "people"}
                </span>
              </span>
              {r.main && <Lock className="size-4 shrink-0 text-gray-500" />}
            </button>
          ))}
        </div>
      </div>
      {role && <RoleEditor key={role.id} role={role} data={data} run={run} onDelete={() => setDeleting(true)} />}
      {deleting && role && (
        <DeleteRoleDialog
          role={role}
          roles={data.roles.filter((r) => r.id !== role.id)}
          onClose={() => setDeleting(false)}
          onDelete={async (moveTo) => {
            await run({ action: "delete-role", id: role.id, moveTo }, "Role deleted");
            setDeleting(false);
            onSelect(data.roles.find((r) => r.id !== role.id && !r.main)?.id ?? data.roles[0]!.id);
          }}
        />
      )}
    </div>
  );
}

function RoleEditor({
  role,
  data,
  run,
  onDelete,
}: {
  role: RoleRow;
  data: Data;
  run: (body: object, done?: string) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [access, setAccess] = useState<Access>(role.access);
  const members = useMemo(() => data.people.filter((p) => p.roleId === role.id), [data.people, role.id]);

  function save(patch: Record<string, unknown>) {
    void run({ action: "save-role", id: role.id, ...patch }).catch(() => setAccess(role.access));
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
      {role.main && (
        <p className="flex max-w-[720px] items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <Lock className="size-4 shrink-0 text-gray-500" />
          The main user always has full access and is the only one who manages people, roles and hidden tabs.
        </p>
      )}
      <div className="grid max-w-[720px] grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            disabled={role.main}
            defaultValue={role.name}
            onKeyDown={blurOnEnter}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== role.name) save({ name });
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-description">Description</Label>
          <Input
            id="role-description"
            disabled={role.main}
            defaultValue={role.description}
            placeholder="What this role does"
            onKeyDown={blurOnEnter}
            onBlur={(e) => {
              if (e.target.value.trim() !== role.description) save({ description: e.target.value });
            }}
          />
        </div>
      </div>
      <div className="flex max-w-[720px] flex-col">
        <div className="pb-2">
          <div className="text-sm font-medium text-gray-900">Tab access</div>
          <div className="mt-0.5 text-xs text-gray-600">
            No access hides the tab. View can look but not change anything. Edit can add, change and complete.
          </div>
        </div>
        {AREAS.map((area) => (
          <div key={area} className="flex items-center gap-6 border-b border-gray-150 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900">{AREA_LABELS[area]}</div>
              <div className="mt-0.5 text-xs text-gray-600">{HINTS[area]}</div>
            </div>
            <AccessSwitch
              label={AREA_LABELS[area]}
              value={access[area]}
              disabled={role.main}
              onChange={(level) => {
                const next = { ...access, [area]: level };
                setAccess(next);
                save({ access: next });
              }}
            />
          </div>
        ))}
      </div>
      {!role.main && (
        <div className="flex max-w-[720px] items-center gap-3">
          <Button variant="secondary" className="text-danger-text" onClick={onDelete}>
            Delete role
          </Button>
          <span className="text-xs text-gray-600">
            {members.length
              ? `Deleting asks which role ${members.length === 1 ? members[0]!.name : `its ${members.length} people`} moves to.`
              : "No one has this role."}
          </span>
        </div>
      )}
    </div>
  );
}

function DeleteRoleDialog({
  role,
  roles,
  onClose,
  onDelete,
}: {
  role: RoleRow;
  roles: RoleRow[];
  onClose: () => void;
  onDelete: (moveTo?: string) => Promise<void>;
}) {
  const [moveTo, setMoveTo] = useState(roles.find((r) => !r.main)?.id ?? roles[0]?.id ?? "");
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete {role.name}?</DialogTitle>
        </DialogHeader>
        {role.people ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-gray-600">
              {role.people === 1 ? "1 person has" : `${role.people} people have`} this role. Choose their new role:
            </p>
            <Select value={moveTo} onValueChange={(value) => setMoveTo(String(value ?? ""))}>
              <SelectTrigger aria-label="New role" className="w-full">
                <SelectValue>{(value: string) => roles.find((r) => r.id === value)?.name ?? "Choose a role"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm text-gray-600">No one has this role. This can’t be undone.</p>
        )}
        {error && <ErrorLine>{error}</ErrorLine>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void onDelete(role.people ? moveTo : undefined).catch((e: Error) => setError(e.message))}>
            Delete role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
