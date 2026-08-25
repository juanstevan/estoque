import { createProduct, listProducts } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  return jsonOk(await listProducts(q));
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      name: string;
      sku: string;
      code?: string;
      amazonUrl?: string | null;
      imageUrl?: string | null;
      suppliers?: string | null;
      b2bPrice?: number;
      b2cPrice?: number;
      notes?: string | null;
      weight?: number | null;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      packageLength?: number | null;
      packageWidth?: number | null;
      packageHeight?: number | null;
      packageWeight?: number | null;
      cutoutLength?: number | null;
      cutoutWidth?: number | null;
      cutoutHeight?: number | null;
      initialQty?: number;
      initialUnitCost?: number;
    }>(req);
    if (!body.name?.trim() || !body.sku?.trim()) {
      return jsonError("Name and SKU are required");
    }
    return jsonOk(await createProduct(body), { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not create product", 500);
  }
}
