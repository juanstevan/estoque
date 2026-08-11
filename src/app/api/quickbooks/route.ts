import {
  StubQuickBooksAdapter,
  describeQbFlow,
  listQbSyncEvents,
  storeQbSyncEvent,
} from "@/lib/quickbooks/adapter";
import { createOrUpdateOrderFromInvoice } from "@/lib/inventory/orders";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  const events = await listQbSyncEvents();
  return jsonOk({ flow: describeQbFlow(), events });
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action?: "ingest" | "process";
      payload?: unknown;
      eventId?: string;
    }>(req);

    if (body.action === "ingest") {
      const payload = body.payload as {
        docNumber?: string;
        id?: string;
      };
      const event = await storeQbSyncEvent({
        eventType: "invoice.created",
        externalId: payload?.docNumber ?? payload?.id,
        payload: body.payload,
        notes: "Evento recebido (stub)",
      });
      return jsonOk(event, { status: 201 });
    }

    if (body.action === "process") {
      const event = await prisma.qbSyncEvent.findUniqueOrThrow({
        where: { id: body.eventId! },
      });
      const adapter = new StubQuickBooksAdapter();
      const invoice = JSON.parse(event.payload);
      const mapped = await adapter.mapInvoiceToOrder(invoice);
      const order = await createOrUpdateOrderFromInvoice({
        ...mapped,
        source: "quickbooks",
      });
      await prisma.qbSyncEvent.update({
        where: { id: event.id },
        data: { processed: true, processedAt: new Date() },
      });
      return jsonOk({ order, eventId: event.id });
    }

    return jsonError("Ação inválida");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro QuickBooks", 400);
  }
}
