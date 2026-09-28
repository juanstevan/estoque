import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { createTag, listTags } from "@/lib/media/library";

export async function GET() {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  return jsonOk(await listTags());
}

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  try {
    const body = await readJson<{ name?: string }>(req);
    return jsonOk(await createTag(body.name ?? ""));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't save the tag");
  }
}
