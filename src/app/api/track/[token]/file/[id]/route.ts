import { jsonError } from "@/lib/api";
import { publicProof } from "@/lib/inventory/orders";
import { readProofBytes } from "@/lib/inventory/proof-file";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await ctx.params;
  const proof = await publicProof(token, id);
  if (!proof) return jsonError("Not found", 404);
  try {
    const file = await readProofBytes(proof.url);
    return new Response(file.bytes, {
      headers: { "Content-Type": file.type, "Cache-Control": "private, no-store" },
    });
  } catch {
    return jsonError("Not found", 404);
  }
}
