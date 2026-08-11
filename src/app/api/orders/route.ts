import {
  confirmPickup,
  createOrUpdateOrderFromInvoice,
  getOrder,
  getOrderByRef,
  listOrders,
  pickOrderLine,
} from "@/lib/inventory/orders";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  const id = searchParams.get("id");
  if (id) {
    const order = await getOrder(id);
    if (!order) return jsonError("Pedido não encontrado", 404);
    return jsonOk(order);
  }
  if (ref) {
    const order = await getOrderByRef(ref);
    if (!order) return jsonError("Pedido não encontrado", 404);
    return jsonOk(order);
  }
  return jsonOk(await listOrders());
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action?: "create" | "pick" | "pickup";
      externalRef?: string;
      customerName?: string;
      lines?: Array<{ productId: string; quantity: number }>;
      orderId?: string;
      productId?: string;
      quantity?: number;
    }>(req);

    if (body.action === "pick") {
      const order = await pickOrderLine({
        orderId: body.orderId!,
        productId: body.productId!,
        quantity: body.quantity ?? 1,
      });
      return jsonOk(order);
    }
    if (body.action === "pickup") {
      const order = await confirmPickup(body.orderId!);
      return jsonOk(order);
    }

    const order = await createOrUpdateOrderFromInvoice({
      externalRef: body.externalRef!,
      customerName: body.customerName,
      lines: body.lines ?? [],
    });
    return jsonOk(order, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro no pedido", 400);
  }
}
