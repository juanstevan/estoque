import * as XLSX from "xlsx";
import { jsonError, readJson } from "@/lib/api";
import { deny } from "@/lib/guard";

export async function POST(req: Request) {
  const denied = await deny("reports", "view");
  if (denied) return denied;
  try {
    const body = await readJson<{
      lines?: { name?: string; sku?: string; qty?: number }[];
    }>(req);
    const lines = (body.lines ?? []).filter((l) => l.name || l.sku);
    const sheet = XLSX.utils.json_to_sheet(
      lines.map((l) => ({
        Product: l.name ?? "",
        SKU: l.sku ?? "",
        Quantity: Number(l.qty) || 0,
      })),
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Cart");
    const bodyOut = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(bodyOut), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="purchase-cart.xlsx"',
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not export", 400);
  }
}
