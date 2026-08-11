import { ImportationStatus } from "@prisma/client";
import {
  confirmImportation,
  listImportations,
  upsertImportation,
} from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  const items = await listImportations();
  return jsonOk(items);
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      id?: string;
      reference?: string;
      status?: ImportationStatus;
      expectedDate?: string | null;
      notes?: string | null;
      freightIntl?: number;
      customs?: number;
      brokerFees?: number;
      portFees?: number;
      freightDomestic?: number;
      otherCosts?: number;
      lines: Array<{
        productId?: string | null;
        draftName?: string | null;
        draftSku?: string | null;
        draftEan?: string | null;
        quantity: number;
        purchaseUnitCost: number;
        weight?: number | null;
        length?: number | null;
        width?: number | null;
        height?: number | null;
        notes?: string | null;
      }>;
      confirm?: boolean;
    }>(req);

    if (!body.lines?.length) {
      return jsonError("Adicione ao menos uma linha");
    }

    const saved = await upsertImportation({
      ...body,
      status: body.status ?? ImportationStatus.DRAFT,
      expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
    });

    if (body.confirm) {
      const received = await confirmImportation(saved.id);
      return jsonOk(received, { status: 201 });
    }

    return jsonOk(saved, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro na importação", 400);
  }
}
