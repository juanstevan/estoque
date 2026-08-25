import {
  describeQbFlow,
  listQbSyncEvents,
  storeQbSyncEvent,
} from "@/lib/quickbooks/adapter";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  const events = await listQbSyncEvents();
  return jsonOk({ flow: describeQbFlow(), events });
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{ action?: string; payload?: unknown }>(req);
    if (body.action === "ingest") {
      const payload = body.payload as { docNumber?: string; id?: string };
      const event = await storeQbSyncEvent({
        eventType: "invoice.created",
        externalId: payload?.docNumber ?? payload?.id,
        payload: body.payload,
        notes: "Stored (stub). Exit invoices are managed on the Exit tab.",
      });
      return jsonOk(event, { status: 201 });
    }
    return jsonError("Live QuickBooks processing is stubbed in this version");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "QuickBooks error", 400);
  }
}
