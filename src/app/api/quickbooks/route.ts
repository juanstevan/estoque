import { jsonError, jsonOk, readJson } from "@/lib/api";
import {
  ingestInvoice,
  ingestItems,
} from "@/lib/quickbooks/ingest";
import { listQbSyncEvents } from "@/lib/quickbooks/adapter";
import { assertQbSecret } from "@/lib/quickbooks/secret";

export async function GET(req: Request) {
  try {
    assertQbSecret(req);
    return jsonOk({ events: await listQbSyncEvents() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "QuickBooks error";
    return jsonError(message, message === "Unauthorized" ? 401 : 400);
  }
}

export async function POST(req: Request) {
  try {
    assertQbSecret(req);
    const body = await readJson<{
      action?: "invoice" | "items" | "ingest" | "sync";
      invoice?: unknown;
      items?: unknown;
      payload?: unknown;
    }>(req);

    if (body.action === "items") {
      return jsonOk(await ingestItems(body.items ?? body.payload));
    }
    if (body.action === "sync") {
      const { syncQuickBooks } = await import("@/lib/quickbooks/sync");
      return jsonOk(await syncQuickBooks());
    }
    const raw = body.invoice ?? body.payload ?? body;
    return jsonOk(await ingestInvoice(raw), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "QuickBooks error";
    return jsonError(message, message === "Unauthorized" ? 401 : 400);
  }
}
