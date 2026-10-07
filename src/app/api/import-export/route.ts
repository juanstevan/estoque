import {
  applyImport,
  exportInventoryWorkbook,
  parseSpreadsheet,
  previewImport,
} from "@/lib/import-export/spreadsheet";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";

function xlsxFile(buffer: Buffer) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="estoque.xlsx"',
    },
  });
}

export async function GET() {
  const denied = await deny("storage", "view");
  if (denied) return denied;
  return xlsxFile(await exportInventoryWorkbook());
}

export async function POST(req: Request) {
  const denied = await deny("storage", "edit");
  if (denied) return denied;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await readJson<{
        preview?: Awaited<ReturnType<typeof previewImport>>;
        confirm?: boolean;
        ids?: string[];
      }>(req);
      if (Array.isArray(body.ids)) {
        return xlsxFile(await exportInventoryWorkbook(body.ids));
      }
      if (body.confirm) {
        const applied = await applyImport(body.preview!);
        return jsonOk({ applied });
      }
      return jsonOk({ preview: body.preview });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError("Arquivo obrigatório");
    }
    const buffer = await file.arrayBuffer();
    const rows = parseSpreadsheet(buffer);
    const preview = await previewImport(rows);
    return jsonOk({ preview });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro na importação", 400);
  }
}
