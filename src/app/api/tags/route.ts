import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";
import { createTag, listTags } from "@/lib/media/library";

export async function GET() {
  const denied = await deny(["media", "storage"], "view");
  if (denied) return denied;
  return jsonOk(await listTags());
}

export async function POST(req: Request) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  try {
    const body = await readJson<{ name?: string }>(req);
    return jsonOk(await createTag(body.name ?? ""));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't save the tag");
  }
}
