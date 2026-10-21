import { adjustCost, changeQuantity } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { guard } from "@/lib/guard";

/** A quantity correction (add/remove, at the current average cost) or a cost correction (cost). */
export async function POST(req: Request) {
  const me = await guard(["storage", "imports"], "edit");
  if (me instanceof Response) return me;
  try {
    const body = await readJson<{
      productId: string;
      mode: "add" | "remove" | "cost";
      quantity?: number;
      avgCost?: number;
      reason: string;
      requestId?: string;
    }>(req);
    if (body.mode === "cost") {
      return jsonOk(
        await adjustCost({ productId: body.productId, avgCost: Number(body.avgCost), reason: body.reason, userId: me.id }),
        { status: 201 },
      );
    }
    return jsonOk(
      await changeQuantity({
        productId: body.productId,
        mode: body.mode,
        quantity: Number(body.quantity),
        reason: body.reason,
        userId: me.id,
        requestId: typeof body.requestId === "string" ? body.requestId.slice(0, 80) : undefined,
      }),
      { status: 201 },
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Adjustment failed", 400);
  }
}
