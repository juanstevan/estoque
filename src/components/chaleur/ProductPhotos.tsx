"use client";

import { useEffect, useRef, useState } from "react";
import { upload, uploadPresigned } from "@vercel/blob/client";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Link2,
  Maximize2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/photos/name";
import { cn } from "@/lib/utils";

export type Photo = {
  id: string;
  url: string;
  thumbUrl: string;
  tag: string;
  fileName: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  /** Upload progress 0–1 while the file is still on its way. */
  pending?: number;
};

export type PhotoStorage = "blob" | "oidc" | "local" | "none";

/** Long edge of the gallery / info-card copy. The original is never resized. */
const THUMB_EDGE = 1200;

export const PHOTO_ACCEPT = Object.keys(PHOTO_TYPES).join(",");

function isTemp(id: string) {
  return id.startsWith("tmp-");
}

async function makeThumb(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Couldn't read ${file.name}`);
  }
  const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) throw new Error(`Couldn't read ${file.name}`);
  return {
    thumb: new File([blob], "thumb.webp", { type: "image/webp" }),
    width: bitmap.width,
    height: bitmap.height,
  };
}

async function store(
  file: File,
  folder: string,
  storage: PhotoStorage,
  onProgress?: (share: number) => void,
) {
  if (storage === "none") {
    throw new Error("Photo storage is not connected. Add a Vercel Blob store to the project.");
  }
  if (storage === "local") {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/photos/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    onProgress?.(1);
    return data.url as string;
  }
  const ext = PHOTO_TYPES[file.type];
  const send = storage === "oidc" ? uploadPresigned : upload;
  const blob = await send(`products/${folder}/${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/photos/upload",
    contentType: file.type,
    // Presigned multipart needs a separate /mpu route; single PUT covers our 100 MB cap.
    multipart: storage === "blob" && file.size > 20 * 1024 * 1024,
    onUploadProgress: onProgress ? (e) => onProgress(e.percentage / 100) : undefined,
  });
  return blob.url;
}

function discard(urls: string[]) {
  if (!urls.length) return;
  void fetch("/api/photos/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discard: urls }),
  });
}

/** Optimistic photo actions. Changes land locally first and roll back if the server says no. */
export function usePhotos({
  productId,
  photos,
  setPhotos,
  storage,
  onError,
}: {
  productId: string | null;
  photos: Photo[];
  setPhotos: (update: (prev: Photo[]) => Photo[]) => void;
  storage: PhotoStorage;
  onError: (message: string | null) => void;
}) {
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/products/${productId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Couldn't update the photo");
    return data as { photos: Photo[]; created?: string[] };
  }

  function patchOne(id: string, changes: Partial<Photo>) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  async function addOne(file: File, tempId: string, preview: string) {
    const uploaded: string[] = [];
    try {
      const { thumb, width, height } = await makeThumb(file);
      const folder = productId ?? "new";
      const [thumbUrl, url] = await Promise.all([
        store(thumb, folder, storage).then((u) => (uploaded.push(u), u)),
        store(file, folder, storage, (share) => patchOne(tempId, { pending: share })).then(
          (u) => (uploaded.push(u), u),
        ),
      ]);
      const current = latest.current.find((p) => p.id === tempId);
      if (!current) {
        discard(uploaded);
        return;
      }
      const input = {
        url,
        thumbUrl,
        tag: current.tag,
        contentType: file.type,
        size: file.size,
        width,
        height,
      };
      if (!productId) {
        patchOne(tempId, { ...input, pending: undefined });
      } else {
        const data = await post({ action: "add", photos: [input] });
        const saved = data.photos.find((p) => p.id === data.created?.[0]);
        if (!saved) throw new Error("Couldn't save the photo");
        const tag = latest.current.find((p) => p.id === tempId)?.tag ?? saved.tag;
        setPhotos((prev) => prev.map((p) => (p.id === tempId ? { ...saved, tag } : p)));
        if (tag !== saved.tag) void retag(saved.id, tag, saved.tag);
      }
      URL.revokeObjectURL(preview);
    } catch (e) {
      setPhotos((prev) => prev.filter((p) => p.id !== tempId));
      URL.revokeObjectURL(preview);
      discard(uploaded);
      onError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  function add(files: File[]) {
    onError(null);
    const rejected = files.filter((f) => !PHOTO_TYPES[f.type] || f.size > PHOTO_MAX_BYTES);
    if (rejected.length) {
      onError(
        rejected.some((f) => f.size > PHOTO_MAX_BYTES)
          ? "Photos must be 100 MB or smaller"
          : "Use JPG, PNG, WebP, AVIF or GIF photos",
      );
    }
    const accepted = files.filter((f) => !rejected.includes(f));
    if (accepted.length && storage === "none") {
      onError("Photo storage is not connected. Add a Vercel Blob store to the project.");
      return;
    }
    const temps = accepted.map((file) => {
      const preview = URL.createObjectURL(file);
      const photo: Photo = {
        id: `tmp-${crypto.randomUUID()}`,
        url: preview,
        thumbUrl: preview,
        tag: "",
        fileName: "",
        contentType: file.type,
        size: file.size,
        width: null,
        height: null,
        pending: 0,
      };
      return { file, photo, preview };
    });
    setPhotos((prev) => [...prev, ...temps.map((t) => t.photo)]);
    for (const t of temps) void addOne(t.file, t.photo.id, t.preview);
  }

  async function retag(id: string, tag: string, before?: string) {
    const prior = before ?? latest.current.find((p) => p.id === id)?.tag ?? "";
    patchOne(id, { tag });
    if (!productId || isTemp(id) || tag === prior) return;
    try {
      await post({ action: "tag", photoId: id, tag });
    } catch (e) {
      patchOne(id, { tag: prior });
      onError(e instanceof Error ? e.message : "Couldn't rename the photo");
    }
  }

  async function cover(id: string) {
    const before = latest.current;
    setPhotos((prev) => [...prev.filter((p) => p.id === id), ...prev.filter((p) => p.id !== id)]);
    if (!productId || isTemp(id)) return;
    try {
      await post({ action: "cover", photoId: id });
    } catch (e) {
      setPhotos(() => before);
      onError(e instanceof Error ? e.message : "Couldn't change the cover");
    }
  }

  async function remove(id: string) {
    const index = latest.current.findIndex((p) => p.id === id);
    const photo = latest.current[index];
    if (!photo) return;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    if (photo.pending != null) return;
    if (!productId) {
      discard([photo.url, photo.thumbUrl]);
      return;
    }
    try {
      await post({ action: "delete", photoId: id });
    } catch (e) {
      setPhotos((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, photo);
        return next;
      });
      onError(e instanceof Error ? e.message : "Couldn't delete the photo");
    }
  }

  async function download(photo: Photo, fileName: string) {
    try {
      const res = await fetch(photo.url);
      if (!res.ok) throw new Error();
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      window.open(photo.url, "_blank", "noopener");
    }
  }

  return { add, retag, cover, remove, download };
}

/**
 * Copies the read-only photo link (one product, or all when productId is null).
 * The ClipboardItem takes the pending fetch so Safari keeps the click's permission.
 */
export async function copyShareLink(productId: string | null) {
  const link = fetch("/api/photos/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Couldn't create the link");
    return data.url as string;
  });
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": link.then((url) => new Blob([url], { type: "text/plain" })),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(await link);
  }
  return link;
}

export function ShareButton({
  productId,
  onError,
  className,
}: {
  productId: string | null;
  onError: (message: string) => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={() =>
        copyShareLink(productId)
          .then(() => setCopied(true))
          .catch((e) => onError(e instanceof Error ? e.message : "Couldn't copy the link"))
      }
    >
      {copied ? <Check /> : <Link2 />}
      {copied ? "Link copied" : "Copy share link"}
    </Button>
  );
}

function formatBytes(n: number) {
  if (!n) return null;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function photoMeta(photo: Photo) {
  return [photo.width && photo.height ? `${photo.width} × ${photo.height}` : null, formatBytes(photo.size)]
    .filter(Boolean)
    .join(" · ");
}

function IconAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md bg-surface/90 text-gray-700 shadow-xs backdrop-blur transition-colors hover:bg-surface hover:text-gray-900 [&_svg]:size-3.5",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function useDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    bind: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      },
    },
  };
}

function PendingBar({ share }: { share: number }) {
  return (
    <div className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-gray-200">
      <div
        className="h-full rounded-full bg-gray-900 transition-[width] duration-150"
        style={{ width: `${Math.max(4, share * 100)}%` }}
      />
    </div>
  );
}

/** The photo on the Info tab: arrows between photos, click to open, drop to add. */
export function PhotoStage({
  photos,
  index,
  onIndex,
  onOpen,
  onPick,
  onFiles,
}: {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onOpen: (i: number) => void;
  onPick: () => void;
  onFiles: (files: File[]) => void;
}) {
  const drop = useDrop(onFiles);
  const photo = photos[index];
  const many = photos.length > 1;
  const step = (d: number) => onIndex((index + d + photos.length) % photos.length);

  return (
    <div
      {...drop.bind}
      className={cn(
        "group relative mb-6 flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[9px] border bg-sunken",
        drop.over ? "border-gray-900" : "border-border",
      )}
    >
      {photo ? (
        <>
          <button
            type="button"
            className="flex h-full w-full cursor-zoom-in items-center justify-center"
            aria-label="Open photo"
            onClick={() => onOpen(index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={photo.id}
              src={photo.thumbUrl}
              alt={photo.tag || "Product photo"}
              className="h-full w-full object-contain"
            />
          </button>
          {photo.pending != null && <PendingBar share={photo.pending} />}
          <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100">
            <IconAction label="Add photos" onClick={onPick}>
              <ImagePlus />
            </IconAction>
            <IconAction label="Open" onClick={() => onOpen(index)}>
              <Maximize2 />
            </IconAction>
          </div>
          {many && (
            <>
              <StageArrow side="left" onClick={() => step(-1)} />
              <StageArrow side="right" onClick={() => step(1)} />
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
                {photos.map((p, i) => (
                  <span
                    key={p.id}
                    className={cn(
                      "size-1.5 rounded-full transition-colors",
                      i === index ? "bg-gray-900" : "bg-gray-300",
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <button
          type="button"
          className="flex flex-col items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-900"
          onClick={onPick}
        >
          <ImagePlus className="size-5" />
          {drop.over ? "Drop photos" : "Upload photos"}
        </button>
      )}
      {drop.over && photo && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/85 text-xs font-medium text-gray-700">
          Drop photos
        </div>
      )}
    </div>
  );
}

function StageArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-gray-700 opacity-0 shadow-xs transition-opacity duration-[120ms] group-hover:opacity-100 hover:text-gray-900 focus-visible:opacity-100",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </button>
  );
}

/** The Photos tab. */
export function PhotoGallery({
  productId,
  photos,
  names,
  onError,
  onPick,
  onFiles,
  onOpen,
  onRetag,
  onCover,
  onRemove,
  onDownload,
}: {
  productId: string | null;
  photos: Photo[];
  names: string[];
  onError: (message: string) => void;
  onPick: () => void;
  onFiles: (files: File[]) => void;
  onOpen: (i: number) => void;
  onRetag: (id: string, tag: string) => void;
  onCover: (id: string) => void;
  onRemove: (id: string) => void;
  onDownload: (photo: Photo, name: string) => void;
}) {
  const drop = useDrop(onFiles);
  return (
    <div {...drop.bind} className="relative flex min-h-0 flex-1 flex-col gap-4 pb-3">
      <div className="flex h-8 shrink-0 items-center justify-between">
        <div className="text-sm text-gray-600">
          {photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"}` : "No photos yet"}
        </div>
        <div className="flex items-center gap-2">
          {productId && <ShareButton productId={productId} onError={onError} />}
          <Button variant="secondary" size="sm" onClick={onPick}>
            <ImagePlus />
            Add photos
          </Button>
        </div>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <div className="grid grid-cols-4 gap-x-4 gap-y-5">
          {photos.map((photo, i) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              cover={i === 0}
              onOpen={() => onOpen(i)}
              onRetag={(tag) => onRetag(photo.id, tag)}
              onCover={() => onCover(photo.id)}
              onRemove={() => onRemove(photo.id)}
              onDownload={() => onDownload(photo, names[i])}
            />
          ))}
          <button
            type="button"
            onClick={onPick}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-gray-300 text-xs font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            <ImagePlus className="size-4" />
            Add photos
            <span className="text-2xs font-normal text-gray-400">or drop files here</span>
          </button>
        </div>
      </div>
      {drop.over && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[9px] border border-gray-900 bg-surface/85 text-sm font-medium text-gray-700">
          Drop photos to upload
        </div>
      )}
    </div>
  );
}

function PhotoTile({
  photo,
  cover,
  onOpen,
  onRetag,
  onCover,
  onRemove,
  onDownload,
}: {
  photo: Photo;
  cover: boolean;
  onOpen: () => void;
  onRetag: (tag: string) => void;
  onCover: () => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const [draft, setDraft] = useState(photo.tag);
  const [confirm, setConfirm] = useState(false);
  const sent = useRef(photo.tag);
  const cancelled = useRef(false);
  const uploading = photo.pending != null;

  useEffect(() => {
    setDraft(photo.tag);
    sent.current = photo.tag;
  }, [photo.tag]);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  const commit = () => {
    const tag = draft.trim();
    if (tag === sent.current) return;
    sent.current = tag;
    onRetag(tag);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="group relative aspect-[4/3] overflow-hidden rounded-[9px] border border-border bg-sunken">
        <button
          type="button"
          className="flex h-full w-full cursor-zoom-in items-center justify-center"
          aria-label="Open photo"
          onClick={onOpen}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.thumbUrl}
            alt={photo.tag || "Product photo"}
            loading="lazy"
            className={cn("h-full w-full object-contain", uploading && "opacity-60")}
          />
        </button>
        {cover && (
          <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-2xs font-medium text-gray-700 shadow-xs">
            Cover
          </span>
        )}
        {uploading && <PendingBar share={photo.pending!} />}
        <div
          className={cn(
            "absolute top-2 right-2 flex gap-1 transition-opacity duration-[120ms] focus-within:opacity-100",
            confirm ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {!uploading && (
            <>
              <IconAction label="Download full size" onClick={onDownload}>
                <Download />
              </IconAction>
              {!cover && (
                <IconAction label="Make cover" onClick={onCover}>
                  <Star />
                </IconAction>
              )}
            </>
          )}
          {confirm ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="flex h-7 items-center gap-1 rounded-md bg-danger-text px-2 text-2xs font-medium text-white shadow-xs"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          ) : (
            <IconAction
              label={uploading ? "Cancel upload" : "Delete"}
              className="hover:text-danger-text"
              onClick={() => (uploading ? onRemove() : setConfirm(true))}
            >
              {uploading ? <X /> : <Trash2 />}
            </IconAction>
          )}
        </div>
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelled.current) cancelled.current = false;
          else commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(photo.tag);
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        placeholder="Add a tag, e.g. front"
        aria-label="Photo tag"
        maxLength={80}
        style={{ boxShadow: "none" }}
        className="h-[1.5rem] w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 hover:bg-gray-100 focus:border-gray-400 focus:bg-surface"
      />
      <div className="px-1.5 text-2xs text-gray-400">
        {uploading ? "Uploading…" : photoMeta(photo)}
      </div>
    </div>
  );
}

/** Full-screen viewer over the whole app, like a marketplace product page. */
export function PhotoLightbox({
  photos,
  names,
  index,
  onIndex,
  onClose,
  onDownload,
}: {
  photos: Photo[];
  names: string[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDownload: (photo: Photo, name: string) => void;
}) {
  const photo = index == null ? null : photos[index];
  const many = photos.length > 1;
  const step = (d: number) => index != null && onIndex((index + d + photos.length) % photos.length);

  return (
    <Dialog open={photo != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black/95 p-0 text-white shadow-none sm:max-w-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") step(-1);
          if (e.key === "ArrowRight") step(1);
        }}
      >
        <DialogTitle className="sr-only">Photo viewer</DialogTitle>
        {photo && index != null && (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between gap-4 px-5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white/90">{photo.tag || "Photo"}</div>
                <div className="text-2xs text-white/50">
                  {index + 1} / {photos.length}
                  {photoMeta(photo) ? ` · ${photoMeta(photo)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                  disabled={photo.pending != null}
                  onClick={() => onDownload(photo, names[index])}
                >
                  <Download />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  className="text-white hover:bg-white/10 hover:text-white"
                  onClick={onClose}
                >
                  <X />
                </Button>
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-20" onClick={onClose}>
              <FullImage key={photo.id} photo={photo} />
              {many && (
                <>
                  <LightboxArrow side="left" onClick={() => step(-1)} />
                  <LightboxArrow side="right" onClick={() => step(1)} />
                </>
              )}
            </div>
            {many && (
              <div className="flex h-20 shrink-0 items-center justify-center gap-2 px-5">
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => onIndex(i)}
                    className={cn(
                      "size-12 overflow-hidden rounded-md border bg-white/5 transition-opacity",
                      i === index ? "border-white opacity-100" : "border-transparent opacity-50 hover:opacity-90",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Paints the light copy first and swaps in the original once it has downloaded. */
function FullImage({ photo }: { photo: Photo }) {
  const [src, setSrc] = useState(photo.thumbUrl);
  useEffect(() => {
    if (photo.url === photo.thumbUrl) return;
    const img = new Image();
    img.onload = () => setSrc(photo.url);
    img.src = photo.url;
    return () => {
      img.onload = null;
    };
  }, [photo.url, photo.thumbUrl]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={photo.tag || "Product photo"}
      width={photo.width ?? undefined}
      height={photo.height ?? undefined}
      onClick={(e) => e.stopPropagation()}
      className="max-h-full max-w-full object-contain"
    />
  );
}

function LightboxArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20",
        side === "left" ? "left-5" : "right-5",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}
