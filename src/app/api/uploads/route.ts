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
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("No file uploaded");

    const ext = EXTENSIONS[file.type];
    if (!ext) return jsonError("Use an image, PDF or text file");
    if (file.size > MAX_BYTES) return jsonError("File must be 5 MB or smaller");

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!process.env.VERCEL) {
      try {
        const dir = path.join(process.cwd(), "public", "uploads");
        await mkdir(dir, { recursive: true });
        const name = `${randomUUID()}${ext}`;
        await writeFile(path.join(dir, name), bytes);
        return jsonOk({ url: `/uploads/${name}`, name: file.name, size: file.size });
      } catch {
        /* fall through to an inline URL */
      }
    }
    // ponytail: data URL on Vercel (read-only /var/task); Blob if images get large
    return jsonOk({
      url: `data:${file.type};base64,${bytes.toString("base64")}`,
      name: file.name,
      size: file.size,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Upload failed", 500);
  }
}
