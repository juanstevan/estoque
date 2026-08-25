import { ExitStatus } from "@prisma/client";
import {
  getOrder,
  listOrders,
  placeOnKanban,
  setExitStatus,
  updateOrder,
} from "@/lib/inventory/orders";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    const order = await getOrder(id);
    if (!order) return jsonError("Invoice not found", 404);
    return jsonOk(order);
  }
  return jsonOk(await listOrders());
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action?: "kanban" | "status" | "update";
      id: string;
      status?: ExitStatus;
      customerName?: string | null;
      assignedTo?: string | null;
      address?: string | null;
      deliverBy?: string | null;
      notes?: string | null;
      photos?: string | null;
    }>(req);

    if (body.action === "kanban") return jsonOk(await placeOnKanban(body.id));
    if (body.action === "status" && body.status) {
      return jsonOk(await setExitStatus(body.id, body.status));
    }
    return jsonOk(
      await updateOrder(body.id, {
        customerName: body.customerName,
        assignedTo: body.assignedTo,
        address: body.address,
        deliverBy: body.deliverBy ? new Date(body.deliverBy) : null,
        notes: body.notes,
        photos: body.photos,
      }),
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Exit error", 400);
  }
}
