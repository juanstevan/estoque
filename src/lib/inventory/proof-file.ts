import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { PHOTO_TYPES } from "@/lib/photos/name";

const root = path.join(process.cwd(), "data", "proofs");
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** Local development only; deployed photos go to Blob storage. */
export async function saveProofFile(orderId: string, file: File) {
  const ext = PHOTO_TYPES[file.type];
  if (!ext || file.size <= 0 || file.size > 100 * 1024 * 1024) {
    throw new Error("Use a JPG, PNG, WebP, AVIF or GIF photo under 100 MB.");
  }
  const name = `${randomUUID()}.${ext}`;
  const dir = path.join(root, orderId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `local:${orderId}/${name}`;
}

export async function readProofBytes(url: string) {
  if (url.startsWith("local:")) {
    const rel = url.slice("local:".length);
    if (!rel || rel.includes("..")) throw new Error("Invalid proof");
    const bytes = await readFile(path.join(root, rel));
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    return { bytes, type: TYPES[ext] ?? "application/octet-stream" };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Proof file is missing");
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") || "application/octet-stream",
  };
}
