import { jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";
import { shareToken } from "@/lib/photos/share";

export async function POST(req: Request) {
  const denied = await deny(["media", "storage"], "edit");
  if (denied) return denied;
  const body = await readJson<{ productId?: string | null }>(req).catch(() => ({ productId: null }));
  const token = await shareToken(body.productId || null);
  return jsonOk({ url: `${new URL(req.url).origin}/share/${token}` });
}
