import { ImportKind, ImportStatus } from "@prisma/client";
import {
  deleteImportation,
  listImportations,
  receiveImportation,
  setImportStatus,
  upsertImportation,
} from "@/lib/inventory/service";
import { ownedProofUrl, removeLocalProofs, saveProofFile } from "@/lib/inventory/proof-file";
import { photoStorage } from "@/lib/photos/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny, guard } from "@/lib/guard";

export async function GET() {
  const denied = await deny("imports", "view");
  if (denied) return denied;
  try {
    return jsonOk(await listImportations());
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Importation error",
      500,
    );
  }
}

/** A YYYY-MM-DD day at noon UTC, the same day in New York. */
function day(value: string | null | undefined) {
  return value ? new Date(`${value.slice(0, 10)}T12:00:00.000Z`) : null;
}

export async function POST(req: Request) {
  const me = await guard("imports", "edit");
  if (me instanceof Response) return me;
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    // Local development: the photos come with the request and are saved here first.
    if (photoStorage() !== "local") return jsonError("Photos upload to storage first", 400);
    const form = await req.formData();
    const id = String(form.get("id") ?? "");
    const files = form.getAll("file").filter((file): file is File => file instanceof File);
    const saved: string[] = [];
    try {
      for (const file of files) saved.push(await saveProofFile(`import-${id}`, file));
      return jsonOk(await receiveImportation(id, { receivedAt: day(String(form.get("receivedAt") ?? "")) ?? new Date(NaN), photos: saved, actor: me }));
    } catch (e) {
      await removeLocalProofs(saved);
      return jsonError(e instanceof Error ? e.message : "Couldn't receive it", 400);
    }
  }
  try {
    const body = await readJson<{
      id?: string;
      action?: "save" | "status" | "delete" | "receive";
      photos?: string[];
      reference?: string;
      kind?: ImportKind;
      status?: ImportStatus;
      supplierName?: string | null;
      expectedDate?: string | null;
      receivedAt?: string | null;
      historical?: boolean;
      notes?: string | null;
      transferFee?: number;
      freight?: number;
      delivery?: number;
      duties?: number;
      customs?: number;
      otherCosts?: number;
      lines?: Array<{
        productId?: string | null;
        draftName?: string | null;
        draftSku?: string | null;
        quantity: number;
        purchaseUnitCost: number;
      }>;
    }>(req);

    if (body.action === "receive" && body.id) {
      const photos = Array.isArray(body.photos) ? body.photos : [];
      if (photos.some((url) => typeof url !== "string" || !ownedProofUrl(url, `import-${body.id}`))) {
        return jsonError("Upload the photos through the app", 400);
      }
      return jsonOk(await receiveImportation(body.id, { receivedAt: day(body.receivedAt) ?? new Date(NaN), photos, actor: me }));
    }

    if (body.action === "status" && body.id && body.status) {
      return jsonOk(await setImportStatus(body.id, body.status, me.id));
    }

    if (body.action === "delete" && body.id) {
      await deleteImportation(body.id);
      return jsonOk({ ok: true });
    }

    if (!body.lines?.length) return jsonError("Add at least one product line");
    const saved = await upsertImportation({
      id: body.id,
      kind: body.kind,
      status: body.status,
      reference: body.reference,
      supplierName: body.supplierName,
      notes: body.notes,
      transferFee: body.transferFee,
      freight: body.freight,
      delivery: body.delivery,
      duties: body.duties,
      customs: body.customs,
      otherCosts: body.otherCosts,
      lines: body.lines,
      expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
      // A day (YYYY-MM-DD) at noon UTC, the same day in New York.
      historical: body.historical,
      userId: me.id,
    });
    return jsonOk(saved, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Importation error", 400);
  }
}
