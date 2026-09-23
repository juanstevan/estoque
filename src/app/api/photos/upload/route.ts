import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { jsonError, jsonOk } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/photos/name";
import { discardUploads, photoStorage } from "@/lib/photos/service";

export async function GET() {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  return jsonOk({ storage: photoStorage() });
}

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (photoStorage() !== "local") return jsonError("Local photo storage is only for development", 400);
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) return jsonError("No file uploaded");
      const ext = PHOTO_TYPES[file.type];
      if (!ext) return jsonError("Use a JPG, PNG, WebP, AVIF or GIF photo");
      if (file.size > PHOTO_MAX_BYTES) return jsonError("Photos must be 100 MB or smaller");
      const dir = path.join(process.cwd(), "public", "uploads", "photos");
      await mkdir(dir, { recursive: true });
      const name = `${randomUUID()}.${ext}`;
      await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
      return jsonOk({ url: `/uploads/photos/${name}` });
    }

    const raw = (await req.json()) as { discard?: unknown };
    if (Array.isArray(raw.discard)) {
      await discardUploads(raw.discard.filter((u): u is string => typeof u === "string"));
      return jsonOk({ ok: true });
    }
    const body = raw as HandleUploadBody;
    if (photoStorage() !== "blob") {
      return jsonError("Photo storage is not connected. Add a Vercel Blob store to the project.", 503);
    }
    return jsonOk(
      await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith("products/")) throw new Error("Invalid photo path");
          return {
            allowedContentTypes: Object.keys(PHOTO_TYPES),
            maximumSizeInBytes: PHOTO_MAX_BYTES,
            addRandomSuffix: true,
          };
        },
      }),
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Upload failed", 400);
  }
}
