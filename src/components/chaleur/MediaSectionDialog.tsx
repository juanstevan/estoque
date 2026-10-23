"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, ImagePlus, Pencil, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CatalogDescription, saveDescription } from "@/components/chaleur/CatalogDescription";
import type { FileRow, LinkTarget } from "@/components/chaleur/MediaLibrary";
import { cn } from "@/lib/utils";

export type MediaSection = { scope: "category" | "family"; brand: string; category: string; family?: string; sampleProductId: string };
type Placed = { file: FileRow; linkId: string; cover: boolean };

async function post(body: object) {
  const res = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't update media");
}

export function MediaSectionDialog({
  section,
  files,
  onClose,
  onUpload,
  onChanged,
  onOpenFile,
  onError,
}: {
  section: MediaSection | null;
  files: FileRow[];
  onClose: () => void;
  onUpload: (files: File[], target: LinkTarget) => Promise<void>;
  onChanged: () => Promise<void>;
  onOpenFile: (id: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <Dialog open={section !== null} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="flex h-[min(840px,92dvh)] w-[min(1180px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {section && (
          <SectionEditor
            key={[section.scope, section.brand, section.category, section.family ?? ""].join("\0")}
            section={section}
            files={files}
            onClose={onClose}
            onUpload={onUpload}
            onChanged={onChanged}
            onOpenFile={onOpenFile}
            onError={onError}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionEditor({ section, files, onClose, onUpload, onChanged, onOpenFile, onError }: {
  section: MediaSection;
  files: FileRow[];
  onClose: () => void;
  onUpload: (files: File[], target: LinkTarget) => Promise<void>;
  onChanged: () => Promise<void>;
  onOpenFile: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const photosInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const target: LinkTarget = { scope: section.scope, sectionId: sectionId ?? undefined, brand: section.brand, category: section.category, ...(section.family ? { family: section.family } : {}) };
  const key = `${section.brand}\0${section.category}${section.family ? `\0${section.family}` : ""}`;
  useEffect(() => {
    let live = true;
    fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "section", brand: section.brand, category: section.category, family: section.family, sampleProductId: section.sampleProductId }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Couldn't open this section");
      if (live) setSectionId(data.id);
    }).catch((error) => { if (live) setLoadError(error instanceof Error ? error.message : "Couldn't open this section"); });
    return () => { live = false; };
  }, [section.brand, section.category, section.family, section.sampleProductId]);
  const placed = useMemo(() => files.flatMap((file) => {
    const link = file.connections.find((connection) => connection.scope === section.scope && (sectionId ? connection.sectionId === sectionId || (!connection.sectionId && connection.key === key) : connection.key === key));
    return link ? [{ file, linkId: link.id, cover: Boolean(link.cover) }] : [];
  }), [files, section.scope, sectionId, key]);
  const photos = placed.filter(({ file }) => file.kind !== "file" && file.contentType.startsWith("image/")).sort((a, b) => a.file.position - b.file.position);
  const documents = placed.filter(({ file }) => file.kind === "file" || !file.contentType.startsWith("image/"));
  const title = section.family || section.category;

  async function run(work: () => Promise<unknown>) {
    if (!sectionId) return;
    setBusy(true);
    try {
      await work();
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't save the change");
    } finally {
      setBusy(false);
    }
  }

  function upload(list: File[], photosOnly: boolean) {
    if (!sectionId) return;
    const accepted = photosOnly ? list.filter((file) => file.type.startsWith("image/")) : list;
    if (accepted.length !== list.length) onError("The photo area accepts images only. Other files can go in Files.");
    if (accepted.length) void run(() => onUpload(accepted, target));
  }

  function rename(item: Placed) {
    const name = window.prompt("File name", item.file.name);
    if (name !== null && name.trim() && name.trim() !== item.file.name) void run(() => post({ action: "rename-file", id: item.file.id, name }));
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= photos.length) return;
    const ids = photos.map((item) => item.file.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
    void run(() => post({ action: "arrange", ids }));
  }

  function close() {
    if (dirty && !window.confirm("Discard unsaved description changes?")) return;
    onClose();
  }

  async function save() {
    if (!sectionId) return;
    if (!dirty) return onClose();
    setBusy(true);
    try {
      await saveDescription({ sectionId }, draft);
      setDirty(false);
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't save the description");
    } finally {
      setBusy(false);
    }
  }

  const action = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" title={label} aria-label={label} disabled={busy || !sectionId} onClick={onClick} className="inline-flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40">{icon}</button>
  );

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-150 px-5 py-4">
        <div className="min-w-0">
          <DialogTitle className="truncate text-lg font-semibold">{title || (section.scope === "family" ? "Family" : "Category")}</DialogTitle>
          <p className="truncate text-xs text-gray-500">{section.scope === "family" ? `Family · ${section.brand} › ${section.category}` : `Category · ${section.brand}`}</p>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2 md:overflow-hidden">
        {loadError && <p className="col-span-full text-sm text-danger-text">{loadError}</p>}
        <div className="flex min-h-[420px] flex-col gap-4 md:min-h-0">
          <section
            aria-label="Photos"
            className={cn("flex min-h-0 flex-[3] flex-col rounded-xl border border-gray-200 p-3", over && "border-blue-500 bg-blue-50")}
            onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setOver(true); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false); }}
            onDrop={(event) => { event.preventDefault(); setOver(false); upload([...event.dataTransfer.files], true); }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Photos <span className="font-normal text-gray-400">{photos.length}</span></h3>
              <Button variant="secondary" size="sm" onClick={() => photosInput.current?.click()} disabled={busy || !sectionId}><ImagePlus className="size-4" /> Add photos</Button>
            </div>
            <div className="no-scrollbar grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto lg:grid-cols-3">
              {photos.map((item, index) => (
                <div key={item.linkId} className="group rounded-lg border border-gray-150 p-1.5">
                  <button type="button" onClick={() => onOpenFile(item.file.id)} className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.file.thumbUrl} alt={item.file.name} className="max-h-full max-w-full object-contain" />
                  </button>
                  <div className="flex items-center gap-0.5">
                    <span className="min-w-0 flex-1 truncate pl-1 text-xs" title={item.file.name}>{item.file.name}</span>
                    {action("Rename photo", <Pencil className="size-3.5" />, () => rename(item))}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100">
                    <div className="flex items-center">
                      {action("Move photo left", <ChevronLeft className="size-4" />, () => movePhoto(index, -1))}
                      {action("Move photo right", <ChevronRight className="size-4" />, () => movePhoto(index, 1))}
                      {action(item.cover ? "Remove cover" : "Make cover", <Star className={cn("size-4", item.cover && "fill-amber-400 text-amber-500")} />, () => void run(() => post({ action: "cover", id: item.linkId, on: !item.cover })))}
                    </div>
                    {action("Remove photo from this section", <Trash2 className="size-4" />, () => void run(() => post({ action: "unlink", id: item.linkId })))}
                  </div>
                </div>
              ))}
              <button type="button" disabled={!sectionId || busy} onClick={() => photosInput.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-250 text-xs text-gray-500 hover:bg-sunken disabled:opacity-40"><ImagePlus className="size-5" />Add photos</button>
            </div>
            <input ref={photosInput} type="file" accept="image/*" multiple hidden onChange={(event) => { upload([...(event.target.files ?? [])], true); event.target.value = ""; }} />
          </section>
          <section aria-label="Files" className="flex min-h-36 flex-[2] flex-col rounded-xl border border-gray-200 p-3"
            onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); upload([...event.dataTransfer.files], false); }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Files <span className="font-normal text-gray-400">{documents.length}</span></h3>
              <Button variant="secondary" size="sm" onClick={() => filesInput.current?.click()} disabled={busy || !sectionId}><Upload className="size-4" /> Add files</Button>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              {documents.length ? documents.map((item) => (
                <div key={item.linkId} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-sunken">
                  <FileText className="size-4 shrink-0 text-gray-500" />
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-xs" onClick={() => onOpenFile(item.file.id)}>{item.file.name}</button>
                  {action("Rename file", <Pencil className="size-3.5" />, () => rename(item))}
                  {action("Remove file from this section", <Trash2 className="size-3.5" />, () => void run(() => post({ action: "unlink", id: item.linkId })))}
                </div>
              )) : <p className="py-4 text-xs text-gray-400">Add documents for this {section.scope}.</p>}
            </div>
            <input ref={filesInput} type="file" multiple hidden onChange={(event) => { upload([...(event.target.files ?? [])], false); event.target.value = ""; }} />
          </section>
        </div>
        {sectionId ? <CatalogDescription
          owner={{ sectionId }}
          className="min-h-[360px] md:min-h-0"
          hideTitle
          onChange={(content) => { setDraft(content); setDirty(true); }}
        /> : <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-gray-200 text-sm text-gray-400">{loadError ? "Description unavailable" : "Loading description…"}</div>}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-gray-150 px-5 py-3">
        <Button variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button disabled={busy || !sectionId} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</Button>
      </div>
    </>
  );
}
