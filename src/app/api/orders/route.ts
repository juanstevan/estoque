import type { ExitStatus } from "@prisma/client";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { guard } from "@/lib/guard";
import { saveProofFile } from "@/lib/inventory/proof-file";
import {
  addNote,
  addProof,
  addToWorkflow,
  completeDelivery,
  delayDelivery,
  deliveryMeta,
  ensureTracking,
  getOrder,
  listOrders,
  moveDelivery,
  removeFromWorkflow,
  removeProof,
  scanCode,
  scheduleDelivery,
  setPrepared,
  splitDelivery,
  undoScan,
  updateDelivery,
  updateOrder,
} from "@/lib/inventory/orders";

/** Sync now runs here. The first QuickBooks import takes minutes. */
export const maxDuration = 300;

/** Proof photos must come from the app's own storage, never an arbitrary address. */
function ownedBlob(url: string) {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".blob.vercel-storage.com") && new URL(url).pathname.startsWith("/proofs/");
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const me = await guard("delivery", "view");
  if (me instanceof Response) return me;
  if (searchParams.get("view") === "meta") return jsonOk(await deliveryMeta());
  const id = searchParams.get("id");
  if (id) {
    const order = await getOrder(id);
    if (!order) return jsonError("Invoice not found", 404);
    return jsonOk(order);
  }
  return jsonOk(await listOrders());
}

type Body = {
  action?: string;
  orderId?: string;
  deliveryId?: string;
  status?: ExitStatus;
  mode?: string;
  assigneeId?: string | null;
  address?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  date?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  reason?: string;
  note?: string | null;
  text?: string;
  public?: boolean;
  code?: string;
  scanId?: string;
  lineId?: string;
  counts?: Record<string, number>;
  keep?: Record<string, number>;
  proofId?: string;
  url?: string;
  kind?: string;
  auto?: boolean;
};

export async function POST(req: Request) {
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      // Local development only: production photos go to Blob storage first (see the proof action).
      const me = await guard("delivery", "edit");
      if (me instanceof Response) return me;
      const form = await req.formData();
      const deliveryId = String(form.get("deliveryId") ?? "");
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("No photo uploaded");
      if (process.env.VERCEL) return jsonError("Photos upload to storage first", 400);
      const url = await saveProofFile(deliveryId, file);
      return jsonOk(await addProof(deliveryId, url, form.get("kind") === "signed" ? "signed" : "delivery", me));
    }

    const body = await readJson<Body>(req);
    if (body.action === "sync") {
      // Any signed-in tab keeps QuickBooks current; the server runs it once a minute at most.
      const me = await guard(null);
      if (me instanceof Response) return me;
      const { syncQuickBooks } = await import("@/lib/quickbooks/sync");
      return jsonOk(await syncQuickBooks({ auto: Boolean(body.auto) }));
    }

    const me = await guard("delivery", "edit");
    if (me instanceof Response) return me;
    const orderId = body.orderId ?? "";
    const deliveryId = body.deliveryId ?? "";
    switch (body.action) {
      case "add":
        return jsonOk(await addToWorkflow(orderId, me));
      case "remove":
        return jsonOk(await removeFromWorkflow(orderId, me));
      case "order":
        return jsonOk(await updateOrder(orderId, body));
      case "note":
        return jsonOk(await addNote(orderId, body.text ?? "", Boolean(body.public), me));
      case "track":
        return jsonOk(await ensureTracking(orderId, me));
      case "move":
        if (!body.status) return jsonError("Choose a stage", 400);
        return jsonOk(await moveDelivery(deliveryId, body.status, me, { mode: body.mode }));
      case "delay":
        return jsonOk(await delayDelivery(deliveryId, { reason: body.reason ?? "", date: body.date, note: body.note }, me));
      case "schedule":
        return jsonOk(
          await scheduleDelivery(deliveryId, { date: body.date ?? null, windowStart: body.windowStart, windowEnd: body.windowEnd }, me),
        );
      case "delivery":
        return jsonOk(await updateDelivery(deliveryId, { assigneeId: body.assigneeId, mode: body.mode }, me));
      case "prepare":
        return jsonOk(await setPrepared(deliveryId, body.counts ?? {}, me));
      case "scan":
        return jsonOk(await scanCode(deliveryId, body.code ?? "", body.scanId ?? "", me));
      case "unscan":
        return jsonOk(await undoScan(deliveryId, body.lineId ?? "", me));
      case "split":
        return jsonOk(await splitDelivery(deliveryId, { keep: body.keep ?? {}, date: body.date }, me));
      case "complete":
        return jsonOk(await completeDelivery(deliveryId, { note: body.note }, me));
      case "proof":
        if (!body.url || !ownedBlob(body.url)) return jsonError("Upload the photo through the app", 400);
        return jsonOk(await addProof(deliveryId, body.url, body.kind === "signed" ? "signed" : "delivery", me));
      case "remove-proof":
        return jsonOk(await removeProof(body.proofId ?? ""));
      default:
        return jsonError("Unknown action", 400);
    }
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Delivery error", 400);
  }
}
