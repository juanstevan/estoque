"use client";

import { useEffect, useRef, useState } from "react";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { FolderPlus, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ShareButton, type PhotoStorage } from "@/components/chaleur/ProductPhotos";
import { PHOTO_TYPES } from "@/lib/photos/name";
import { cn } from "@/lib/utils";

type FolderRow = {
  id: string;
  name: string;
  brand: string | null;
  parentId: string | null;
};

type Member = { id: string; name: string; sku: string; type: string | null };

type Asset = {
  id: string;
  kind: string;
  url: string;
  thumbUrl: string;
  tag: string;
  fileName: string;
  originalName: string;
  contentType: string;
};

type Detail = {
  id: string;
  name: string;
  parentId: string | null;
  assets: Asset[];
  products: Member[];
  pool?: Member[];
};

function levelOf(folder: FolderRow, folders: FolderRow[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let depth = 0;
  for (let item: FolderRow | undefined = folder; item; item = item.parentId ? byId.get(item.parentId) : undefined) {
    depth += 1;
  }
  if (depth <= 1) return "brand" as const;
  if (depth === 2) return "category" as const;
  if (depth === 3) return "model" as const;
  return "folder" as const;
}

async function postGroup(body: Record<string, unknown>) {
  const res = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't update the folder");
  return data as { groups: FolderRow[]; created?: string };
}

async function putFile(file: File, groupId: string, storage: PhotoStorage, kind: "photo" | "file") {
  if (storage === "none") throw new Error("Photo storage is not connected. Add a Vercel Blob store to the project.");
  let url: string;
  if (storage === "local") {
    const form = new FormData();
    form.append("file", file);
    if (kind === "file") form.append("kind", "file");
    const res = await fetch("/api/photos/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    url = data.url as string;
  } else {
    const ext = kind === "photo" ? PHOTO_TYPES[file.type] : file.name.split(".").pop() || "bin";
    const send = storage === "oidc" ? uploadPresigned : upload;
    const blob = await send(`groups/${groupId}/${kind === "file" ? "files" : "photos"}/${crypto.randomUUID()}.${ext}`, file, {
      access: "public",
      handleUploadUrl: "/api/photos/upload",
      contentType: file.type || "application/octet-stream",
    });
    url = blob.url;
  }
  const res = await fetch(`/api/groups/${groupId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "add",
      photos: [
        {
          url,
          thumbUrl: url,
          tag: file.name.replace(/\.[a-z0-9]{1,8}$/i, ""),
          kind,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          originalName: file.name,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save the file");
}

function FolderIcon({ muted }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 72 56" className={cn("h-14 w-[4.5rem]", muted && "opacity-40")} aria-hidden>
      <path fill="#8ec5ff" d="M6 14a6 6 0 0 1 6-6h16l6 6h26a6 6 0 0 1 6 6v4H6V14z" />
      <path fill="#3b82f6" d="M4 22h64l-5 24a6 6 0 0 1-6 5H14a6 6 0 0 1-6-5L4 22z" />
    </svg>
  );
}

function FolderTile({
  name,
  muted,
  renaming,
  draft,
  onDraft,
  onOpen,
  onRename,
  onCommit,
  onCancel,
  drop,
}: {
  name: string;
  muted?: boolean;
  renaming?: boolean;
  draft?: string;
  onDraft?: (value: string) => void;
  onOpen: () => void;
  onRename: () => void;
  onCommit?: () => void;
  onCancel?: () => void;
  drop?: {
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}) {
  return (
    <div className="flex w-[92px] flex-col items-center gap-1" {...drop}>
      <button type="button" aria-label={name} onClick={onOpen}>
        <FolderIcon muted={muted} />
      </button>
      {renaming ? (
        <input
          autoFocus
          aria-label="Folder name"
          value={draft}
          onChange={(e) => onDraft?.(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") onCancel?.();
          }}
          className="w-full rounded-md border border-gray-400 bg-surface px-1 text-center text-xs outline-none"
        />
      ) : (
        <span
          className={cn("w-full cursor-text text-center text-xs leading-tight", muted && "text-gray-400")}
          onDoubleClick={onRename}
        >
          {name}
        </span>
      )}
    </div>
  );
}

function canOpen(type: string) {
  return type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf" || type.startsWith("text/");
}

export function MediaBrowser({
  productId,
  groupId,
  storage,
  onError,
  onMoved,
}: {
  productId: string;
  groupId: string | null;
  storage: PhotoStorage;
  onError: (message: string) => void;
  onMoved: () => void;
}) {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(groupId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<Asset | null>(null);
  const [folderName, setFolderName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const skipRename = useRef(false);

  useEffect(() => setCurrentId(groupId), [groupId]);

  async function reloadFolders() {
    const data = await fetch("/api/groups").then((r) => r.json());
    setFolders(data.groups ?? []);
  }

  useEffect(() => {
    void reloadFolders();
  }, []);

  useEffect(() => {
    if (!currentId) return;
    void fetch(`/api/groups/${currentId}`)
      .then((r) => r.json())
      .then((data: Detail) => setDetail(data.id ? data : null))
      .catch(() => setDetail(null));
    setSelected([]);
  }, [currentId]);

  const current = folders.find((f) => f.id === currentId) ?? null;
  const level = current ? levelOf(current, folders) : null;
  const parent = current?.parentId ? folders.find((f) => f.id === current.parentId) ?? null : null;
  const children = folders.filter((f) => f.parentId === currentId);
  const modelId = level === "folder" ? parent?.id ?? null : level === "model" ? currentId : null;

  async function moveProducts(ids: string[], to: string | null) {
    if (!ids.length || !to) return;
    try {
      await postGroup({ action: "assign", productIds: ids, groupId: to });
      setSelected([]);
      onMoved();
      if (currentId) {
        const next = await fetch(`/api/groups/${currentId}`).then((r) => r.json());
        setDetail(next);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't move the product");
    }
  }

  async function makeFolder() {
    if (!modelId || !selected.length) return;
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    try {
      const created = await postGroup({ action: "create", name: name.trim(), parentId: modelId });
      await reloadFolders();
      if (created.created) await moveProducts(selected, created.created);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't create the folder");
    }
  }

  function dropOn(folderId: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (dragId || [...e.dataTransfer.types].includes("Files")) e.preventDefault();
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const list = [...e.dataTransfer.files];
        if (list.length) {
          addDropped(list, folderId);
          return;
        }
        if (dragId) void moveProducts([dragId], folderId);
        setDragId(null);
      },
    };
  }

  function addDropped(list: File[], groupId: string | null = currentId) {
    if (!groupId || !list.length) return;
    void Promise.all(
      list.map((file) =>
        putFile(file, groupId, storage, file.type.startsWith("image/") ? "photo" : "file"),
      ),
    )
      .then(() => fetch(`/api/groups/${groupId}`).then((r) => r.json()).then(setDetail))
      .catch((err) => onError(err instanceof Error ? err.message : "Upload failed"));
  }

  function commitRename(id: string, previous: string) {
    if (skipRename.current) {
      skipRename.current = false;
      setRenameId(null);
      return;
    }
    const next = folderName.trim();
    setRenameId(null);
    if (!next || next === previous) return;
    void postGroup({ action: "rename", id, name: next })
      .then(() => reloadFolders())
      .then(() => onMoved())
      .catch((e) => onError(e instanceof Error ? e.message : "Couldn't rename the folder"));
  }

  function tile(folder: FolderRow, muted = false) {
    return (
      <FolderTile
        key={folder.id}
        name={folder.name}
        muted={muted}
        renaming={renameId === folder.id}
        draft={folderName}
        onDraft={setFolderName}
        onOpen={() => setCurrentId(folder.id)}
        onRename={() => {
          setRenameId(folder.id);
          setFolderName(folder.name);
        }}
        onCommit={() => commitRename(folder.id, folder.name)}
        onCancel={() => {
          skipRename.current = true;
          setRenameId(null);
        }}
        drop={muted && level !== "folder" ? undefined : dropOn(folder.id)}
      />
    );
  }

  const path = (() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const out: FolderRow[] = [];
    for (let item = currentId ? byId.get(currentId) : undefined; item; item = item.parentId ? byId.get(item.parentId) : undefined) {
      out.unshift(item);
    }
    return out;
  })();
  const photos = (detail?.assets ?? []).filter((a) => a.kind !== "file");
  const files = (detail?.assets ?? []).filter((a) => a.kind === "file");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0 truncate text-sm font-medium">{current?.name ?? "Media"}</div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="This product's folder"
            disabled={!groupId || groupId === currentId}
            onClick={() => groupId && setCurrentId(groupId)}
          >
            <LocateFixed />
          </Button>
          {currentId && (
            <ShareButton productId={null} groupId={currentId} label="Share" onError={onError} />
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
      <div
        className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto"
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          const list = [...e.dataTransfer.files];
          if (!list.length) return;
          e.preventDefault();
          addDropped(list);
        }}
      >
        <div className="flex flex-wrap gap-x-3 gap-y-4">
          {parent && tile(parent, true)}
          {children.map((folder) => tile(folder))}
        </div>
        {(photos.length > 0 || files.length > 0) && (
          <div className="grid grid-cols-4 gap-4">
            {photos.map((photo) => (
              <button key={photo.id} type="button" className="flex flex-col items-center gap-1" onClick={() => setOpenFile(photo)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumbUrl} alt={photo.tag} className="aspect-square w-full rounded-[9px] border border-border bg-sunken object-contain" />
                <span className="w-full truncate text-center text-xs">{photo.tag || "Photo"}</span>
              </button>
            ))}
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                className="flex flex-col items-center gap-1"
                onClick={() => {
                  if (!canOpen(file.contentType)) {
                    window.open(file.url, "_blank", "noopener");
                    return;
                  }
                  setText(null);
                  setOpenFile(file);
                  if (file.contentType.startsWith("text/")) {
                    void fetch(file.url).then((r) => r.text()).then(setText);
                  }
                }}
              >
                <span className="flex aspect-square w-full items-center justify-center rounded-[9px] border border-border bg-sunken text-2xs font-medium tracking-caps text-gray-500 uppercase">
                  {file.contentType.includes("pdf")
                    ? "PDF"
                    : file.contentType.startsWith("video/")
                      ? "Video"
                      : file.contentType.startsWith("text/")
                        ? "Text"
                        : "File"}
                </span>
                <span className="w-full truncate text-center text-xs">{file.originalName || file.tag || file.fileName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {(level === "model" || level === "folder") && (
        <aside
          className="flex w-52 shrink-0 flex-col gap-2 border-l border-border pl-3"
          {...(level === "folder" && currentId ? dropOn(currentId) : {})}
        >
          <div className="flex items-center justify-between">
            <div className="text-2xs font-medium tracking-caps text-gray-500 uppercase">Products</div>
            <Button variant="ghost" size="icon-sm" aria-label="New folder" disabled={!selected.length || !modelId} onClick={() => void makeFolder()}>
              <FolderPlus />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {(detail?.pool ?? []).length > 0 && (
              <div className="mb-2 text-2xs text-gray-400">In {parent?.name}</div>
            )}
            {(detail?.pool ?? []).map((product) => (
              <div
                key={product.id}
                draggable
                onDragStart={() => setDragId(product.id)}
                className="cursor-grab truncate rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
              >
                {product.name}
              </div>
            ))}
            {(detail?.products ?? []).map((product) => (
              <div
                key={product.id}
                draggable
                onDragStart={() => setDragId(product.id)}
                onClick={() =>
                  setSelected((prev) => (prev.includes(product.id) ? prev.filter((id) => id !== product.id) : [...prev, product.id]))
                }
                className={cn(
                  "cursor-grab truncate rounded-md px-2 py-1 text-xs",
                  product.id === productId && "font-medium",
                  selected.includes(product.id) ? "bg-gray-900 text-white" : "hover:bg-gray-100",
                )}
              >
                {product.name}
              </div>
            ))}
          </div>
        </aside>
      )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 text-xs text-gray-500">
        {path.map((folder, index) => (
          <span key={folder.id} className="flex min-w-0 items-center gap-1">
            {index > 0 && <span className="text-gray-300">/</span>}
            <button
              type="button"
              className={cn("truncate hover:text-gray-900", folder.id === currentId && "text-gray-900")}
              onClick={() => setCurrentId(folder.id)}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      <Dialog open={openFile != null} onOpenChange={(v) => !v && setOpenFile(null)}>
        <DialogContent className="flex h-[80vh] max-w-4xl flex-col overflow-hidden">
          <DialogTitle className="truncate text-sm">{openFile?.originalName || openFile?.tag || "File"}</DialogTitle>
          {openFile?.contentType.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={openFile.url} alt="" className="min-h-0 flex-1 object-contain" />
          )}
          {openFile?.contentType.startsWith("video/") && <video src={openFile.url} controls className="min-h-0 flex-1" />}
          {openFile?.contentType === "application/pdf" && <iframe title={openFile.fileName} src={openFile.url} className="min-h-0 w-full flex-1" />}
          {openFile?.contentType.startsWith("text/") && (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-xs">{text}</pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
