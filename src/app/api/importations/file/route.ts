import { jsonError } from "@/lib/api";
import { deny } from "@/lib/guard";
import { importationProof } from "@/lib/inventory/service";
import { readProofBytes } from "@/lib/inventory/proof-file";

/** An arrival photo, for people who can see importations. */
export async function GET(req: Request) {
  const denied = await deny("imports", "view");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("Missing photo", 400);
  const proof = await importationProof(id);
  if (!proof) return jsonError("Photo not found", 404);
  try {
    const file = await readProofBytes(proof.url);
    return new Response(file.bytes, { headers: { "Content-Type": file.type, "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("Photo not found", 404);
  }
}
