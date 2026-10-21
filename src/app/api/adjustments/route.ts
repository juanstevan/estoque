import { adjustCost, changeQuantity, correctFob, editLogEntry, removeLogEntry, resolveSetAside } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { guard } from "@/lib/guard";

/**
 * Stock and cost corrections from the product card:
 * - add / remove: units only (no price), optionally dated in the past
 * - cost / fob: the average or FOB cost (main user)
 * - release / write-off: units set aside after a damaged return
 * - edit-log / remove-log: a log entry (date, quantity and removal: main user)
 */
export async function POST(req: Request) {
  const me = await guard(["storage", "imports"], "edit");
  if (me instanceof Response) return me;
  try {
    const body = await readJson<{
      productId: string;
      mode: "add" | "remove" | "cost" | "fob" | "release" | "write-off" | "edit-log" | "remove-log";
      transactionId?: string;
      notes?: string;
      occurredAt?: string;
      fobCost?: number;
      quantity?: number;
      avgCost?: number;
      reason: string;
      requestId?: string;
    }>(req);
    // Cost corrections (average or FOB) belong to the main user, and so do log changes that
    // move units or dates (the service checks again).
    if ((body.mode === "cost" || body.mode === "fob") && !me.main) {
      return jsonError("Only the main user can correct costs.", 403);
    }
    const logStock = body.mode === "remove-log" || (body.mode === "edit-log" && (body.quantity !== undefined || body.occurredAt !== undefined));
    if (logStock && !me.main) {
      return jsonError("Only the main user can change the units or date of an entry, or remove it.", 403);
    }
    if (body.mode === "cost") {
      return jsonOk(
        await adjustCost({ productId: body.productId, avgCost: Number(body.avgCost), reason: body.reason, userId: me.id }),
        { status: 201 },
      );
    }
    if (body.mode === "fob") {
      return jsonOk(
        { changed: Boolean(await correctFob({ productId: body.productId, fobCost: Number(body.fobCost), reason: body.reason, userId: me.id })) },
        { status: 201 },
      );
    }
    // A YYYY-MM-DD day at noon UTC, the same day in New York.
    const day = body.occurredAt ? new Date(`${body.occurredAt.slice(0, 10)}T12:00:00.000Z`) : undefined;
    if (body.mode === "edit-log") {
      return jsonOk(
        await editLogEntry(
          {
            id: body.transactionId ?? "",
            notes: body.notes,
            occurredAt: day,
            quantity: body.quantity === undefined ? undefined : Number(body.quantity),
            reason: body.reason,
          },
          me,
        ),
      );
    }
    if (body.mode === "remove-log") {
      return jsonOk(await removeLogEntry({ id: body.transactionId ?? "", reason: body.reason }, me));
    }
    if (body.mode === "release" || body.mode === "write-off") {
      return jsonOk(
        await resolveSetAside({ productId: body.productId, mode: body.mode, quantity: Number(body.quantity), reason: body.reason, userId: me.id }),
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
        occurredAt: day,
        requestId: typeof body.requestId === "string" ? body.requestId.slice(0, 80) : undefined,
      }),
      { status: 201 },
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Adjustment failed", 400);
  }
}
