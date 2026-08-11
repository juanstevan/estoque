import {
  applyImport,
  exportInventoryWorkbook,
  parseSpreadsheet,
  previewImport,
} from "@/lib/import-export/spreadsheet";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  const buffer = await exportInventoryWorkbook();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="estoque.xlsx"',
    },
  });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await readJson<{ preview: Awaited<ReturnType<typeof previewImport>>; confirm?: boolean }>(req);
      if (body.confirm) {
        const applied = await applyImport(body.preview);
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
