import { createHmac, timingSafeEqual } from "crypto";
import { jsonError, jsonOk } from "@/lib/api";
import { ingestInvoice } from "@/lib/quickbooks/ingest";
import { qboInvoice } from "@/lib/quickbooks/qbo";

/**
 * Intuit invoice webhook.
 * Setup: Intuit Developer → Webhooks → endpoint https://<host>/api/quickbooks/webhook
 * and the verifier token in QB_WEBHOOK_VERIFIER. Without that env var this route stays off.
 */
export async function POST(req: Request) {
  const verifier = process.env.QB_WEBHOOK_VERIFIER?.trim();
  if (!verifier) {
    return jsonError("Set QB_WEBHOOK_VERIFIER before enabling the QuickBooks webhook.", 501);
  }
  const raw = await req.text();
  const signature = req.headers.get("intuit-signature") ?? "";
  const digest = createHmac("sha256", verifier).update(raw).digest("base64");
  const left = Buffer.from(signature);
  const right = Buffer.from(digest);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return jsonError("Unauthorized", 401);
  }
  let body: {
    eventNotifications?: Array<{
      dataChangeEvent?: { entities?: Array<{ name?: string; id?: string }> };
    }>;
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return jsonError("Invalid webhook payload", 400);
  }
  const ids = new Set<string>();
  for (const note of body.eventNotifications ?? []) {
    for (const entity of note.dataChangeEvent?.entities ?? []) {
      if (entity.name === "Invoice" && entity.id) ids.add(String(entity.id));
    }
  }
  for (const id of ids) {
    await ingestInvoice(await qboInvoice(id));
  }
  return jsonOk({ ok: true, invoices: ids.size });
}
