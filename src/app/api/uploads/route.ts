import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { jsonError, jsonOk } from "@/lib/api";
import { currentUser } from "@/lib/auth";

const MAX_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("No file uploaded");

    const ext = EXTENSIONS[file.type];
    if (!ext) return jsonError("Use a PNG, JPEG, WebP or GIF image");
    if (file.size > MAX_BYTES) return jsonError("Image must be 5 MB or smaller");

    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}${ext}`;
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

    return jsonOk({ url: `/uploads/${name}` });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Upload failed", 500);
  }
}
