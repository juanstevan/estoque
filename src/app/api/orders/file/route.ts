import { jsonError } from "@/lib/api";
import { deny } from "@/lib/guard";
import { proofForActor } from "@/lib/inventory/orders";
import { readProofBytes } from "@/lib/inventory/proof-file";

export async function GET(req: Request) {
  const denied = await deny("delivery", "view");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("Missing proof", 400);
  const proof = await proofForActor(id);
  if (!proof) return jsonError("Proof not found", 404);
  try {
    const file = await readProofBytes(proof.url);
    return new Response(file.bytes, {
      headers: { "Content-Type": file.type, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Proof not found", 404);
  }
}
