"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { Eye, EyeOff, File, FileText, Folder, Image as ImageIcon, List, Pencil, Search, Trash2, Video } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { downloadAs, type PhotoStorage } from "@/components/chaleur/ProductPhotos";
import { FILE_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/photos/name";
import type { ProductRow } from "@/components/chaleur/ProductDialog";
import { cn } from "@/lib/utils";

type Scope = "brand" | "category" | "family" | "tag" | "product";
type Kind = "photo" | "pdf" | "document" | "video" | "other";
type Connection = { id: string; scope: Scope; key: string; name: string; context?: string; label: string };
type FileRow = {
  id: string;
  url: string;
  thumbUrl: string;
  name: string;
  originalName: string;
  tag: string;
  fileName: string;
  kind: string;
  contentType: string;
  size: number;
  connections: Connection[];
};
type Tag = { id: string; name: string; color: string };
type Suggestion = { scope: Scope; key: string; name: string; extra?: string };
type GroupBy = "none" | Scope | "type";
type SavedView = {
  id: string;
  name: string;
  query: string;
  picked: Suggestion | null;
  scopeFilter: Scope | "all";
  typeFilter: Kind | "all";
  groupBy: GroupBy;
  folders: boolean;
};

const VIEWS_KEY = "chaleur.media.views";

const SCOPE_RANK: Record<Scope, number> = { brand: 0, category: 1, family: 2, product: 3, tag: 4 };
const SCOPE_NAME: Record<Scope, string> = {
  brand: "Brand",
  category: "Category",
  family: "Family",
  product: "Product",
  tag: "Tag",
};

const KIND_META: Record<Kind, { label: string; accent: string; badge: string; icon: typeof File }> = {
  photo: { label: "Photo", accent: "border-l-blue-600", badge: "bg-blue-600/15 text-blue-800", icon: ImageIcon },
  pdf: { label: "PDF", accent: "border-l-red-600", badge: "bg-red-600/15 text-red-800", icon: FileText },
  document: { label: "Document", accent: "border-l-amber-600", badge: "bg-amber-600/15 text-amber-800", icon: FileText },
  video: { label: "Video", accent: "border-l-violet-600", badge: "bg-violet-600/15 text-violet-800", icon: Video },
  other: { label: "File", accent: "border-l-gray-500", badge: "bg-gray-500/15 text-gray-700", icon: File },
};

function fileKind(file: { kind: string; contentType: string; name: string; originalName?: string }): Kind {
  const type = file.contentType.toLowerCase();
  const name = (file.originalName || file.name).toLowerCase();
  if (file.kind !== "file" && (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/.test(name))) return "photo";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("video/") || /\.(mp4|mov|webm)$/.test(name)) return "video";
  if (type.startsWith("text/") || /word|sheet|csv|document/.test(type) || /\.(txt|docx?|csv|xlsx?|rtf)$/.test(name)) return "document";
  return "other";
}

function formatSize(size: number) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export async function putFile(file: File, storage: PhotoStorage) {
  const image = file.type.startsWith("image/");
  if (image && file.size > PHOTO_MAX_BYTES) throw new Error("Photos must be 100 MB or smaller");
  if (!image && file.size > FILE_MAX_BYTES) throw new Error("Files must be 500 MB or smaller");
  if (storage === "local") {
    const form = new FormData();
    form.append("file", file);
    if (!image) form.append("kind", "file");
    const res = await fetch("/api/photos/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return data.url as string;
  }
  const send = storage === "oidc" ? uploadPresigned : upload;
  const ext = image ? PHOTO_TYPES[file.type] || "jpg" : file.name.split(".").pop() || "bin";
  const blob = await send(`library/${image ? "photos" : "files"}/${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/photos/upload",
    contentType: file.type || "application/octet-stream",
  });
  return blob.url;
}

function sameName(a?: string | null, b?: string | null) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function relationOf(file: FileRow, picked: Suggestion, products: ProductRow[]): { how: "direct" | "inherited" | "within"; via?: string } | null {
  if (file.connections.some((link) => link.scope === picked.scope && (link.key === picked.key || sameName(link.name, picked.name) && link.scope !== "family" && link.scope !== "product"))) {
    return { how: "direct" };
  }
  if (picked.scope === "family" && file.connections.some((link) => link.scope === "family" && link.key === picked.key)) return { how: "direct" };
  if (picked.scope === "tag") return null;
  if (picked.scope === "brand") {
    const under = file.connections.some((link) => {
      if (link.scope === "category") return products.some((product) => sameName(product.category, link.name) && sameName(product.type, picked.name));
      if (link.scope === "family") return link.key.toLowerCase().startsWith(`${picked.name.toLowerCase()}\0`);
      if (link.scope === "product") return products.some((product) => product.id === link.key && sameName(product.type, picked.name));
      return false;
    });
    return under ? { how: "within" } : null;
  }
  if (picked.scope === "category") {
    const brands = new Set(products.filter((product) => sameName(product.category, picked.name)).map((product) => product.type));
    if (file.connections.some((link) => link.scope === "brand" && [...brands].some((brand) => sameName(brand, link.name)))) {
      return { how: "inherited", via: "Brand" };
    }
    const under = file.connections.some((link) => {
      if (link.scope === "family") return sameName(link.key.split("\0")[1], picked.name);
      if (link.scope === "product") return products.some((product) => product.id === link.key && sameName(product.category, picked.name));
      return false;
    });
    return under ? { how: "within" } : null;
  }
  if (picked.scope === "family") {
    const [brand, category, family] = picked.key.split("\0");
    if (file.connections.some((link) => link.scope === "category" && sameName(link.name, category))) return { how: "inherited", via: "Category" };
    if (file.connections.some((link) => link.scope === "brand" && sameName(link.name, brand))) return { how: "inherited", via: "Brand" };
    if (file.connections.some((link) => link.scope === "product" && products.some((product) => product.id === link.key && sameName(product.type, brand) && sameName(product.category, category) && sameName(product.model, family)))) {
      return { how: "within" };
    }
    return null;
  }
  const product = products.find((row) => row.id === picked.key);
  if (!product) return null;
  if (file.connections.some((link) => link.scope === "family" && sameName(link.name, product.model) && sameName(link.context, `${product.type} · ${product.category}`))) {
    return { how: "inherited", via: "Family" };
  }
  if (file.connections.some((link) => link.scope === "category" && sameName(link.name, product.category))) return { how: "inherited", via: "Category" };
  if (file.connections.some((link) => link.scope === "brand" && sameName(link.name, product.type))) return { how: "inherited", via: "Brand" };
  if (product.tag && file.connections.some((link) => link.scope === "tag" && link.key === product.tag?.id)) return { how: "inherited", via: "Tag" };
  return null;
}

function Picker({
  choices,
  value,
  placeholder,
  onChange,
}: {
  choices: { value: string; label: string; hint?: string }[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const selected = choices.find((choice) => choice.value === value);
  const q = text.trim().toLowerCase();
  const shown = choices.filter((choice) => !q || `${choice.label} ${choice.hint ?? ""}`.toLowerCase().includes(q)).slice(0, 12);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 w-full items-center rounded-md border border-border bg-surface px-2 text-left text-sm">
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        {selected?.hint && <span className="ml-2 truncate text-xs text-gray-500">{selected.hint}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-1 p-2">
        <Input autoFocus value={text} placeholder="Type to find…" onChange={(e) => setText(e.target.value)} />
        <div className="max-h-48 overflow-auto">
          {shown.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left hover:bg-gray-50"
              onClick={() => {
                onChange(choice.value);
                setText("");
                setOpen(false);
              }}
            >
              <span className="text-sm">{choice.label}</span>
              {choice.hint && <span className="text-xs text-gray-500">{choice.hint}</span>}
            </button>
          ))}
          {!shown.length && <p className="px-2 py-1.5 text-xs text-gray-500">Nothing matches.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
        <SelectTrigger className="w-36" size="sm">
          <SelectValue>{(current: string) => options.find((option) => option.value === current)?.label ?? current}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {label}
    </label>
  );
}

export function MediaLibrary({ products, onChanged }: { products: ProductRow[]; onChanged?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const renameLock = useRef(false);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [storage, setStorage] = useState<PhotoStorage>("blob");
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<Scope | "all">("all");
  const [typeFilter, setTypeFilter] = useState<Kind | "all">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [folders, setFolders] = useState(false);
  const [filtersHidden, setFiltersHidden] = useState(false);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [density, setDensity] = useState<"compact" | "regular" | "large">("regular");
  const [linkScope, setLinkScope] = useState<Scope>("product");
  const [linkTarget, setLinkTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const families = useMemo(() => {
    const seen = new Set<string>();
    return products.flatMap((product) => {
      if (!product.type || !product.category || !product.model) return [];
      const key = `${product.type}\0${product.category}\0${product.model}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, brand: product.type, category: product.category, family: product.model }];
    });
  }, [products]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || picked) return [];
    const rows: (Suggestion & { score: number })[] = [];
    const seen = new Set<string>();
    function add(row: Suggestion, hay: string) {
      const id = `${row.scope}\0${row.key}`;
      if (seen.has(id)) return;
      const text = hay.toLowerCase();
      const score = text === q ? 0 : text.startsWith(q) ? 1 : text.includes(q) ? 2 : 99;
      if (score === 99) return;
      seen.add(id);
      rows.push({ ...row, score });
    }
    for (const product of products) {
      if (product.type) add({ scope: "brand", key: product.type, name: product.type }, product.type);
      if (product.category) add({ scope: "category", key: product.category, name: product.category }, product.category);
      if (product.type && product.category && product.model) {
        add(
          { scope: "family", key: `${product.type}\0${product.category}\0${product.model}`, name: product.model, extra: `${product.type} · ${product.category}` },
          product.model,
        );
      }
      add({ scope: "product", key: product.id, name: product.name, extra: product.sku }, `${product.name} ${product.sku}`);
    }
    for (const tag of tags) add({ scope: "tag", key: tag.id, name: tag.name }, tag.name);
    return rows
      .sort((a, b) => a.score - b.score || SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [products, tags, query, picked]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.flatMap((file) => {
      if (typeFilter !== "all" && fileKind(file) !== typeFilter) return [];
      if (scopeFilter !== "all" && !file.connections.some((link) => link.scope === scopeFilter)) return [];
      const relation = picked ? relationOf(file, picked, products) : null;
      if (picked && !relation) return [];
      if (!picked && q) {
        const blob = [file.name, ...file.connections.flatMap((link) => [link.name, link.context ?? ""])].join(" ").toLowerCase();
        if (!blob.includes(q)) return [];
      }
      return [{ file, relation }];
    });
  }, [files, typeFilter, scopeFilter, picked, products, query]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "All", items: visible }];
    const map = new Map<string, { key: string; label: string; hint?: string; items: typeof visible }>();
    function bucket(key: string, label: string, hint: string | undefined, item: (typeof visible)[number]) {
      const row = map.get(key) ?? { key, label, hint, items: [] };
      if (!row.items.some((entry) => entry.file.id === item.file.id)) row.items.push(item);
      map.set(key, row);
    }
    for (const item of visible) {
      if (groupBy === "type") {
        const kind = fileKind(item.file);
        bucket(kind, KIND_META[kind].label, undefined, item);
        continue;
      }
      const links = item.file.connections.filter((link) => link.scope === groupBy);
      if (!links.length) bucket("", `No ${SCOPE_NAME[groupBy].toLowerCase()}`, undefined, item);
      for (const link of links) bucket(link.key, link.name, link.context, item);
    }
    return [...map.values()].sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : a.label.localeCompare(b.label)));
  }, [visible, groupBy]);

  const openFolder = folderKey ? groups.find((group) => group.key === folderKey) : null;
  const shownGroups = openFolder ? [openFolder] : groups;
  const shownIds = (!folders || openFolder ? shownGroups : []).flatMap((group) => group.items.map((item) => item.file.id));
  const selectedShown = shownIds.filter((id) => selected.has(id)).length;
  const openFile = files.find((file) => file.id === openId) ?? null;

  async function saveFolderName(key: string, label: string) {
    if (renameLock.current) return;
    const name = draft.trim();
    if (!name || name === label) {
      setRenaming(null);
      return;
    }
    if (groupBy !== "brand" && groupBy !== "category" && groupBy !== "family" && groupBy !== "tag") return;
    renameLock.current = true;
    setError(null);
    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", scope: groupBy, key, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't rename it");
        return;
      }
      if (data.qbFailed) setError(`${data.qbFailed} QuickBooks names were not updated.`);
      await reload();
      onChanged?.();
    } finally {
      renameLock.current = false;
      setRenaming(null);
    }
  }

  async function renameFile(id: string, name: string) {
    setFiles((current) => current.map((file) => (file.id === id ? { ...file, tag: name, name: name || file.originalName || "File" } : file)));
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename-file", id, name }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't rename the file");
    await reload();
  }

  async function reload() {
    const data = await fetch("/api/media").then((r) => r.json());
    setFiles(data.files ?? []);
    setTags(data.tags ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) setViews(parsed as SavedView[]);
    } catch {
      /* keep empty */
    }
  }, []);

  function storeViews(next: SavedView[]) {
    setViews(next);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
  }

  const filtering =
    Boolean(query.trim() || picked) ||
    scopeFilter !== "all" ||
    typeFilter !== "all" ||
    groupBy !== "none" ||
    folders;
  const activeView = views.find((view) => view.id === activeId) ?? null;
  const viewMatches = Boolean(
    activeView &&
      activeView.query === (picked ? picked.name : query) &&
      JSON.stringify(activeView.picked) === JSON.stringify(picked) &&
      activeView.scopeFilter === scopeFilter &&
      activeView.typeFilter === typeFilter &&
      activeView.groupBy === groupBy &&
      activeView.folders === folders,
  );

  function applyView(view: SavedView) {
    setActiveId(view.id);
    setQuery(view.picked ? view.picked.name : view.query);
    setPicked(view.picked);
    setScopeFilter(view.scopeFilter);
    setTypeFilter(view.typeFilter);
    setGroupBy(view.groupBy);
    setFolders(view.folders);
    setFolderKey(null);
    setSuggesting(false);
  }

  function saveView() {
    const names = new Set(views.map((view) => view.name));
    let name = "New View";
    if (names.has(name)) {
      let n = 1;
      while (names.has(`New View ${n}`)) n += 1;
      name = `New View ${n}`;
    }
    const next = {
      id: crypto.randomUUID(),
      name,
      query: picked ? picked.name : query,
      picked,
      scopeFilter,
      typeFilter,
      groupBy,
      folders,
    };
    setActiveId(next.id);
    storeViews([...views, next]);
  }

  function renameView(id: string, name: string) {
    storeViews(views.map((view) => (view.id === id ? { ...view, name } : view)));
  }

  function deleteView(id: string) {
    if (activeId === id) setActiveId(null);
    storeViews(views.filter((view) => view.id !== id));
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const res = await fetch("/api/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't delete the files");
      return;
    }
    setSelected(new Set());
    if (openId && ids.includes(openId)) setOpenId(null);
    await reload();
  }

  useEffect(() => {
    void reload();
    void fetch("/api/photos/upload")
      .then((r) => r.json())
      .then((data) => data.storage && setStorage(data.storage))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (folderKey && !groups.some((group) => group.key === folderKey)) setFolderKey(null);
  }, [groups, folderKey]);

  async function uploadFiles(list: File[]) {
    setError(null);
    try {
      for (const file of list) {
        const url = await putFile(file, storage);
        const res = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            file: {
              url,
              thumbUrl: url,
              name: file.name,
              kind: file.type.startsWith("image/") ? "photo" : "file",
              contentType: file.type || "application/octet-stream",
              size: file.size,
            },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't save the file");
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function connect() {
    if (!openFile || !linkTarget) return;
    const family = families.find((row) => row.key === linkTarget);
    const body =
      linkScope === "product"
        ? { productId: linkTarget }
        : linkScope === "tag"
          ? { tagId: linkTarget }
          : linkScope === "family" && family
            ? { brand: family.brand, category: family.category, family: family.family }
            : linkScope === "category"
              ? { category: linkTarget }
              : { brand: linkTarget };
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", photoId: openFile.id, scope: linkScope, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't connect the file");
      return;
    }
    setLinkTarget("");
    setError(null);
    await reload();
  }

  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of families) counts.set(row.family, (counts.get(row.family) ?? 0) + 1);
    return counts;
  }, [families]);
  const choices =
    linkScope === "product"
      ? products.map((product) => ({ value: product.id, label: product.name, hint: product.sku }))
      : linkScope === "tag"
        ? tags.map((tag) => ({ value: tag.id, label: tag.name }))
        : linkScope === "family"
          ? families.map((row) => ({
              value: row.key,
              label: row.family,
              hint: (familyCounts.get(row.family) ?? 0) > 1 ? `${row.brand} · ${row.category}` : undefined,
            }))
          : linkScope === "category"
            ? [...new Set(products.flatMap((product) => (product.category ? [product.category] : [])))].sort().map((name) => ({ value: name, label: name }))
            : [...new Set(products.flatMap((product) => (product.type ? [product.type] : [])))].sort().map((name) => ({ value: name, label: name }));

  const min = density === "compact" ? "96px" : density === "large" ? "220px" : "150px";

  function tiles(items: typeof visible) {
    return (
      <div className="grid content-start gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))` }}>
        {items.map(({ file }) => {
          const meta = KIND_META[fileKind(file)];
          const Icon = meta.icon;
          const image = fileKind(file) === "photo";
          return (
            <div key={file.id} className="flex flex-col gap-2 text-left">
              <span className={cn("relative flex aspect-square items-center justify-center overflow-hidden rounded-[9px] border border-border border-l-4 bg-sunken", meta.accent)}>
                <button type="button" className="absolute inset-0" aria-label={file.name} onClick={() => setOpenId(file.id)} />
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.thumbUrl} alt="" className="pointer-events-none h-full w-full object-contain" />
                ) : (
                  <span className="pointer-events-none flex flex-col items-center gap-1 text-gray-600">
                    <Icon className="size-6" aria-hidden />
                    <span className="text-2xs font-medium">{meta.label}</span>
                  </span>
                )}
                <span className={cn("pointer-events-none absolute top-1.5 left-2 max-w-[calc(100%-2.25rem)] truncate rounded-sm px-1.5 py-0.5 text-2xs font-medium", meta.badge)}>
                  {file.connections.length === 0
                    ? "Not linked"
                    : file.connections.length === 1
                      ? file.connections[0]!.label
                      : `${file.connections[0]!.name} +${file.connections.length - 1}`}
                </span>
                <Checkbox
                  className="absolute top-1.5 right-1.5 z-10 bg-surface"
                  checked={selected.has(file.id)}
                  aria-label={`Select ${file.name}`}
                  onCheckedChange={(checked) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(file.id);
                      else next.delete(file.id);
                      return next;
                    });
                  }}
                />
              </span>
              <button type="button" className="truncate text-left text-xs font-medium" onClick={() => setOpenId(file.id)}>
                {file.name}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4"
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const list = [...e.dataTransfer.files];
        if (!list.length) return;
        e.preventDefault();
        void uploadFiles(list);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          {activeView && viewMatches ? (
            <input
              aria-label="View name"
              className="bg-transparent text-lg font-medium text-gray-900 outline-none"
              style={{ width: `${Math.max(activeView.name.length, 4)}ch` }}
              value={activeView.name}
              onChange={(e) => renameView(activeView.id, e.target.value)}
            />
          ) : (
            <h1 className="text-lg font-medium text-gray-900">Media</h1>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              aria-label="Saved views"
            >
              <List />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
              {views.length === 0 ? (
                <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
              ) : (
                views.map((view) => (
                  <DropdownMenuItem key={view.id} className="pr-1" onClick={() => applyView(view)}>
                    <span className="min-w-0 flex-1 truncate">{view.name}</span>
                    <button
                      type="button"
                      aria-label={`Delete ${view.name}`}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-danger-text opacity-0 group-hover/dropdown-menu-item:opacity-100 focus-visible:opacity-100"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteView(view.id);
                      }}
                    >
                      <Trash2 className="size-3.5 !text-danger-text" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
            aria-label={filtersHidden ? "Show filters" : "Hide filters"}
            aria-pressed={filtersHidden}
            onClick={() => setFiltersHidden((hidden) => !hidden)}
          >
            {filtersHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-control-md items-center">
          <Checkbox
            aria-label="Select files"
            disabled={!shownIds.length}
            checked={shownIds.length > 0 && selectedShown === shownIds.length}
            indeterminate={selectedShown > 0 && selectedShown < shownIds.length}
            onCheckedChange={(checked) => {
              setSelected((current) => {
                const next = new Set(current);
                for (const id of shownIds) {
                  if (checked) next.add(id);
                  else next.delete(id);
                }
                return next;
              });
            }}
          />
        </div>
        <div className="relative w-[240px] shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-8"
            value={picked ? `${picked.name} · ${SCOPE_NAME[picked.scope]}` : query}
            placeholder="Search"
            onChange={(e) => {
              setPicked(null);
              setQuery(e.target.value);
              setSuggesting(true);
            }}
            onFocus={() => setSuggesting(true)}
          />
          {suggesting && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-[240px] rounded-md border border-border bg-surface p-1 shadow-md">
              {suggestions.map((row) => (
                <button
                  key={`${row.scope}-${row.key}`}
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-gray-50"
                  onClick={() => {
                    setPicked(row);
                    setQuery(row.name);
                    setSuggesting(false);
                    setFolderKey(null);
                  }}
                >
                  <span className="truncate text-sm">{row.name}{row.extra ? <span className="text-gray-500"> · {row.extra}</span> : null}</span>
                  <span className="shrink-0 text-xs text-gray-500">{SCOPE_NAME[row.scope]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!filtersHidden && (
          <div className="flex flex-wrap items-center gap-9">
        <FilterSelect
          label="Link"
          value={scopeFilter}
          onChange={(value) => {
            setScopeFilter(value as Scope | "all");
            setFolderKey(null);
          }}
          options={[
            { value: "all", label: "Any" },
            { value: "brand", label: "Brand" },
            { value: "category", label: "Category" },
            { value: "family", label: "Family" },
            { value: "tag", label: "Tag" },
            { value: "product", label: "Product" },
          ]}
        />
        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as Kind | "all")}
          options={[
            { value: "all", label: "All types" },
            { value: "photo", label: "Photo" },
            { value: "pdf", label: "PDF" },
            { value: "document", label: "Document" },
            { value: "video", label: "Video" },
            { value: "other", label: "File" },
          ]}
        />
        <FilterSelect
          label="Group"
          value={groupBy}
          onChange={(value) => {
            setGroupBy(value as GroupBy);
            setFolderKey(null);
            if (value === "none") setFolders(false);
          }}
          options={[
            { value: "none", label: "None" },
            { value: "brand", label: "Brand" },
            { value: "category", label: "Category" },
            { value: "family", label: "Family" },
            { value: "tag", label: "Tag" },
            { value: "product", label: "Product" },
            { value: "type", label: "File type" },
          ]}
        />
        <label className="flex h-control-md items-center gap-2 text-xs text-gray-600">
          Folders
          <Switch
            checked={folders}
            disabled={groupBy === "none"}
            aria-label="Folders"
            onCheckedChange={(checked) => {
              setFolders(checked);
              setFolderKey(null);
            }}
          />
        </label>
        <div className="flex h-control-md items-center gap-1">
          {(["compact", "regular", "large"] as const).map((size) => (
            <Button
              key={size}
              size="icon-sm"
              variant={density === size ? "default" : "ghost"}
              aria-label={size === "compact" ? "Small" : size === "regular" ? "Medium" : "Large"}
              className="rounded-full transition-colors duration-200 ease-in-out"
              onClick={() => setDensity(size)}
            >
              {size === "compact" ? "S" : size === "regular" ? "M" : "L"}
            </Button>
          ))}
        </div>
        {filtering && !filtersHidden && !viewMatches && (
          <Button variant="secondary" size="sm" onClick={saveView}>
            Save filter
          </Button>
        )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {selected.size > 0 && (
            <button type="button" className="text-sm text-danger-text" onClick={() => void deleteSelected()}>
              Delete
            </button>
          )}
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            Upload
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            e.target.value = "";
            if (list.length) void uploadFiles(list);
          }}
        />
      </div>
      {picked && (
        <p className="text-xs text-gray-600">
          Showing files linked to {picked.name} · {SCOPE_NAME[picked.scope]}.
          <button type="button" className="ml-2 underline" onClick={() => { setPicked(null); setQuery(""); }}>Clear</button>
        </p>
      )}
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {folders && !openFolder && (
          <div className="grid content-start gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {groups.map((group) => {
              const canRename = group.key !== "" && (groupBy === "brand" || groupBy === "category" || groupBy === "family" || groupBy === "tag");
              return (
                <div key={group.key} className="flex items-center gap-2 rounded-[9px] border border-border bg-surface p-3">
                  <Folder className="size-5 shrink-0 text-gray-500" />
                  <span className="min-w-0 flex-1">
                    {renaming === group.key ? (
                      <input
                        autoFocus
                        className="w-full rounded border border-gray-300 px-1 py-0.5 text-sm"
                        value={draft}
                        aria-label={`Rename ${group.label}`}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setRenaming(null);
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveFolderName(group.key, group.label);
                          }
                        }}
                        onBlur={() => void saveFolderName(group.key, group.label)}
                      />
                    ) : (
                      <button type="button" className="block w-full truncate text-left text-sm font-medium" onClick={() => setFolderKey(group.key)}>
                        {group.label}
                      </button>
                    )}
                    <button type="button" className="block w-full text-left" onClick={() => renaming !== group.key && setFolderKey(group.key)}>
                      {group.hint && <span className="block truncate text-xs text-gray-500">{group.hint}</span>}
                      <span className="text-xs text-gray-500">{group.items.length} files</span>
                    </button>
                  </span>
                  {canRename && renaming !== group.key && (
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      aria-label={`Rename ${group.label}`}
                      onClick={() => {
                        setDraft(group.label);
                        setRenaming(group.key);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(!folders || openFolder) && (
          <div className="grid gap-6">
            {openFolder && (
              <button type="button" className="w-fit text-xs text-gray-600 underline" onClick={() => setFolderKey(null)}>
                {groupBy === "type" ? "File types" : groupBy === "none" ? "All" : { brand: "Brands", category: "Categories", family: "Families", tag: "Tags", product: "Products" }[groupBy]} / {openFolder.label}
              </button>
            )}
            {shownGroups.map((group) => (
              <section key={group.key} className="grid gap-3">
                {!openFolder && groupBy !== "none" && (
                  <h2 className="text-xs font-medium tracking-caps text-gray-500 uppercase">
                    {group.label}
                    {group.hint ? <span className="ml-2 normal-case tracking-normal text-gray-400">{group.hint}</span> : null}
                    <span className="ml-2 normal-case tracking-normal">{group.items.length}</span>
                  </h2>
                )}
                {tiles(group.items)}
              </section>
            ))}
          </div>
        )}
        {!loaded && <p className="text-sm text-gray-500">Loading media…</p>}
        {loaded && !visible.length && <p className="text-sm text-gray-500">No files match. Drop photos and files here to upload.</p>}
      </div>
      <Dialog open={openFile != null} onOpenChange={(next) => !next && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {openFile && (
            <>
              <DialogHeader className="pr-6">
                <DialogTitle className="sr-only">{openFile.name}</DialogTitle>
                <FileNameField key={openFile.id} file={openFile} onRename={(name) => void renameFile(openFile.id, name)} />
              </DialogHeader>
              <div className="grid gap-4">
                {fileKind(openFile) === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={openFile.url} alt="" className="max-h-64 w-full rounded-md object-contain" />
                ) : (
                  <div className={cn("flex items-center gap-3 rounded-md border border-l-4 p-4", KIND_META[fileKind(openFile)].accent)}>
                    {(() => {
                      const Icon = KIND_META[fileKind(openFile)].icon;
                      return <Icon className="size-8 text-gray-600" aria-hidden />;
                    })()}
                    <div>
                      <p className="text-sm font-medium">{KIND_META[fileKind(openFile)].label}</p>
                      <p className="text-xs text-gray-500">{formatSize(openFile.size)}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" nativeButton={false} render={<a href={openFile.url} target="_blank" rel="noreferrer" />}>
                    Open
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void downloadAs(openFile.url, openFile.fileName)}>
                    Download
                  </Button>
                </div>
                <div className="grid gap-2">
                  <p className="text-2xs font-medium tracking-caps text-gray-500 uppercase">Connections</p>
                  {openFile.connections.map((link) => (
                    <div key={link.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {link.name}
                        <span className="text-gray-500"> · {SCOPE_NAME[link.scope]}</span>
                        {link.context && <span className="text-gray-400"> · {link.context}</span>}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-gray-500"
                        onClick={() =>
                          void fetch("/api/media", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "unlink", id: link.id }),
                          }).then(() => reload())
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {!openFile.connections.length && <p className="text-sm text-gray-500">Not linked yet. The file stays here until you connect it.</p>}
                </div>
                <div className="grid gap-2 border-t border-border pt-3">
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(SCOPE_NAME) as Scope[]).map((scope) => (
                      <Button key={scope} size="sm" variant={linkScope === scope ? "default" : "secondary"} onClick={() => { setLinkScope(scope); setLinkTarget(""); }}>
                        {SCOPE_NAME[scope]}
                      </Button>
                    ))}
                  </div>
                  <Picker choices={choices} value={linkTarget} placeholder={`Find a ${SCOPE_NAME[linkScope].toLowerCase()}`} onChange={setLinkTarget} />
                  <Button onClick={() => void connect()} disabled={!linkTarget}>Connect</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The file's own name, edited in place like the old photo tiles. Downloads put the product first. */
function FileNameField({ file, onRename }: { file: FileRow; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(file.tag);
  const cancelled = useRef(false);
  const commit = () => {
    const name = draft.trim();
    if (name !== file.tag) onRename(name);
  };
  return (
    <div className="grid gap-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelled.current) cancelled.current = false;
          else commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(file.tag);
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        placeholder={file.originalName || "Name it, e.g. front"}
        aria-label="File name"
        maxLength={80}
        style={{ boxShadow: "none" }}
        className="h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 -mx-1.5 text-lg font-semibold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 hover:bg-gray-100 focus:border-gray-400 focus:bg-surface"
      />
      <p className="text-xs break-all text-gray-500">
        Downloads as <span className="font-mono">{file.fileName}</span>
      </p>
    </div>
  );
}
