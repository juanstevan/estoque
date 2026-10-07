import { changeQuantity } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";

export async function POST(req: Request) {
  const denied = await deny(["storage", "imports"], "edit");
  if (denied) return denied;
  try {
    const body = await readJson<{
      productId: string;
      mode: "add" | "remove";
      quantity: number;
      price: number;
      reason: string;
    }>(req);
    return jsonOk(await changeQuantity(body), { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Adjustment failed", 400);
  }
}
