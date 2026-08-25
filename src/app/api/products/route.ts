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
      amazonUrl?: string;
      b2bPrice?: number;
      b2cPrice?: number;
      notes?: string;
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
