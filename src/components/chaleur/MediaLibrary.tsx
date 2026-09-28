"use client";

import { useEffect, useMemo, useState } from "react";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type PhotoStorage } from "@/components/chaleur/ProductPhotos";
import { FILE_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/photos/name";
import type { ProductRow } from "@/components/chaleur/ProductDialog";

type Tag = { id: string; name: string; color: string };
type FileRow = {
  id: string;
  url: string;
  thumbUrl: string;
  name: string;
  kind: string;
  contentType: string;
  connections: { id: string; label: string }[];
};

async function putFile(file: File, storage: PhotoStorage) {
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

export function MediaLibrary({ products }: { products: ProductRow[] }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [storage, setStorage] = useState<PhotoStorage>("blob");
  const [open, setOpen] = useState<FileRow | null>(null);
  const [scope, setScope] = useState<"product" | "tag" | "family" | "category" | "brand">("product");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);

  const families = useMemo(() => {
    const seen = new Set<string>();
    return products.flatMap((product) => {
      if (!product.type || !product.category || !product.model) return [];
      const key = `${product.type}\0${product.category}\0${product.model}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, brand: product.type, category: product.category, family: product.model, label: `${product.type} / ${product.category} / ${product.model}` }];
    });
  }, [products]);
  const categories = useMemo(
    () => [...new Set(products.flatMap((product) => (product.category ? [product.category] : [])))].sort(),
    [products],
  );
  const brands = useMemo(
    () => [...new Set(products.flatMap((product) => (product.type ? [product.type] : [])))].sort(),
    [products],
  );

  async function reload() {
    const data = await fetch("/api/media").then((r) => r.json());
    setFiles(data.files ?? []);
    setTags(data.tags ?? []);
    setOpen((current) => (current ? (data.files ?? []).find((file: FileRow) => file.id === current.id) ?? null : null));
  }

  useEffect(() => {
    void reload();
    void fetch("/api/photos/upload")
      .then((r) => r.json())
      .then((data) => data.storage && setStorage(data.storage))
      .catch(() => {});
  }, []);

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
    if (!open || !target) return;
    const family = families.find((row) => row.key === target);
    const body =
      scope === "product"
        ? { productId: target }
        : scope === "tag"
          ? { tagId: target }
          : scope === "family" && family
            ? { brand: family.brand, category: family.category, family: family.family }
            : scope === "category"
              ? { category: target }
              : { brand: target };
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", photoId: open.id, scope, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't connect the file");
      return;
    }
    setTarget("");
    await reload();
  }

  const options =
    scope === "product"
      ? products.map((product) => ({ value: product.id, label: `${product.sku} ${product.name}` }))
      : scope === "tag"
        ? tags.map((tag) => ({ value: tag.id, label: tag.name }))
        : scope === "family"
          ? families.map((row) => ({ value: row.key, label: row.label }))
          : scope === "category"
            ? categories.map((name) => ({ value: name, label: name }))
            : brands.map((name) => ({ value: name, label: name }));

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
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Media</h1>
        <label className="cursor-pointer text-xs text-gray-600 underline">
          Upload
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = [...(e.target.files ?? [])];
              e.target.value = "";
              if (list.length) void uploadFiles(list);
            }}
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-3 overflow-y-auto">
        {files.map((file) => (
          <button key={file.id} type="button" className="flex flex-col gap-1 text-left" onClick={() => setOpen(file)}>
            <span className="flex aspect-square items-center justify-center overflow-hidden rounded-[9px] border border-border bg-sunken">
              {file.kind !== "file" && file.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.thumbUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-2xs uppercase text-gray-500">{file.contentType.includes("pdf") ? "PDF" : "File"}</span>
              )}
            </span>
            <span className="truncate text-xs">{file.name}</span>
          </button>
        ))}
      </div>
      {!files.length && <p className="text-sm text-gray-500">Drop photos and files here. Then connect each one to a product, tag, family, category, or brand.</p>}
      <Sheet open={open != null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent className="w-[420px] overflow-y-auto sm:max-w-[420px]">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8 break-all">{open.name}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-4">
                {open.kind !== "file" && open.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={open.url} alt="" className="max-h-48 w-full object-contain" />
                ) : (
                  <a href={open.url} target="_blank" rel="noreferrer" className="text-sm underline">
                    Open file
                  </a>
                )}
                <div className="grid gap-1">
                  {open.connections.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{connection.label}</span>
                      <button
                        type="button"
                        className="text-xs text-gray-500"
                        onClick={() =>
                          void fetch("/api/media", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "unlink", id: connection.id }),
                          }).then(() => reload())
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {!open.connections.length && <p className="text-sm text-gray-500">Not connected yet.</p>}
                </div>
                <div className="grid gap-2">
                  <select className="h-8 rounded-md border border-border px-2 text-sm" value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setTarget(""); }}>
                    <option value="product">Product</option>
                    <option value="tag">Tag</option>
                    <option value="family">Family</option>
                    <option value="category">Category</option>
                    <option value="brand">Brand</option>
                  </select>
                  <select className="h-8 rounded-md border border-border px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Select</option>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <Button onClick={() => void connect()} disabled={!target}>Connect</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
