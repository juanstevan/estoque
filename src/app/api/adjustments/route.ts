import { adjustInventory } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      productId: string;
      quantityDelta: number;
      reason: string;
      notes?: string;
      occurredAt?: string;
      type?: "ADJUSTMENT" | "CORRECTION";
    }>(req);
    const txn = await adjustInventory({
      ...body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
    return jsonOk(txn, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro no ajuste", 400);
  }
}
