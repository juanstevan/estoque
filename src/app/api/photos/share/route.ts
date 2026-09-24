import { jsonError, jsonOk, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { shareToken } from "@/lib/photos/share";

export async function POST(req: Request) {
  if (!(await currentUser())) return jsonError("Unauthorized", 401);
  const body = await readJson<{ productId?: string | null; groupId?: string | null }>(req).catch(() => ({
    productId: null,
    groupId: null,
  }));
  const token = await shareToken(body.productId || null, body.groupId || null);
  return jsonOk({ url: `${new URL(req.url).origin}/share/${token}` });
}
