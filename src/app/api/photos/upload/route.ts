import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { issueSignedToken } from "@vercel/blob";
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { jsonError, jsonOk } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { FILE_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/photos/name";
import { blobToken, discardUploads, photoStorage } from "@/lib/photos/service";

/**
 * Upload paths are `products/<id>/…` or `groups/<id>/…`. Photos are images only;
 * anything under `/files/` (manuals, videos, other attachments) takes any type.
 */
function limitsFor(pathname: string) {
  if (!/^(products|groups)\/[^/]+\//.test(pathname)) throw new Error("Invalid upload path");
  return pathname.includes("/files/")
    ? { maximumSizeInBytes: FILE_MAX_BYTES }
    : { allowedContentTypes: Object.keys(PHOTO_TYPES), maximumSizeInBytes: PHOTO_MAX_BYTES };
}

function extOf(name: string) {
  return name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? "bin";
}

export async function GET() {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  return jsonOk({ storage: photoStorage() });
}

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (photoStorage() !== "local") return jsonError("Local storage is only for development", 400);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("No file uploaded");
      const isFile = form.get("kind") === "file";
      const ext = isFile ? extOf(file.name) : PHOTO_TYPES[file.type];
      if (!ext) return jsonError("Use a JPG, PNG, WebP, AVIF or GIF photo");
      if (file.size > (isFile ? FILE_MAX_BYTES : PHOTO_MAX_BYTES)) {
        return jsonError(isFile ? "Files must be 500 MB or smaller" : "Photos must be 100 MB or smaller");
      }
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
    const storage = photoStorage();
    if (storage === "oidc") {
      return jsonOk(
        await handleUploadPresigned({
          body: raw as HandleUploadPresignedBody,
          request: req,
          getSignedToken: async (pathname) => {
            const limits = limitsFor(pathname);
            return {
              token: await issueSignedToken({ pathname, operations: ["put"], ...limits }),
              urlOptions: { ...limits, addRandomSuffix: true },
            };
          },
        }),
      );
    }
    if (storage !== "blob") {
      return jsonError("Photo storage is not connected. Add a Vercel Blob store to the project.", 503);
    }
    return jsonOk(
      await handleUpload({
        body: raw as HandleUploadBody,
        request: req,
        token: blobToken(),
        onBeforeGenerateToken: async (pathname) => ({ ...limitsFor(pathname), addRandomSuffix: true }),
      }),
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Upload failed", 400);
  }
}
