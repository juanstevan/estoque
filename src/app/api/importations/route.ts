import { ImportKind, ImportStatus } from "@prisma/client";
import {
  confirmImportation,
  listImportations,
  setImportStatus,
  upsertImportation,
} from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  return jsonOk(await listImportations());
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      id?: string;
      action?: "save" | "status";
      reference?: string;
      kind?: ImportKind;
      status?: ImportStatus;
      supplierName?: string | null;
      expectedDate?: string | null;
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

    if (body.action === "status" && body.id && body.status) {
      if (body.status === "COMPLETED") {
        return jsonOk(await confirmImportation(body.id));
      }
      return jsonOk(await setImportStatus(body.id, body.status));
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
    });
    return jsonOk(saved, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Importation error", 400);
  }
}
