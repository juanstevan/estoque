import { jsonError, jsonOk } from "@/lib/api";
import { sharedPhotos } from "@/lib/photos/share";

type Ctx = { params: Promise<{ token: string }> };

/** Machine-readable twin of the share page, for AI tools and scripts. */
export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const data = await sharedPhotos(token, new URL(req.url).origin);
  if (!data) return jsonError("Link not found", 404);
  return jsonOk(data, { headers: { "X-Robots-Tag": "noindex" } });
}
