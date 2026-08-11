import { listProducts, createProduct } from "@/lib/inventory/service";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const products = await listProducts(q);
  return jsonOk(products);
}

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      name: string;
      sku: string;
      secondarySku?: string;
      ean?: string;
      imageUrl?: string;
      b2bPrice?: number;
      b2cPrice?: number;
      weight?: number;
      length?: number;
      width?: number;
      height?: number;
      notes?: string;
      initialQty?: number;
      initialUnitCost?: number;
    }>(req);
    if (!body.name?.trim() || !body.sku?.trim()) {
      return jsonError("Nome e SKU são obrigatórios");
    }
    const product = await createProduct(body);
    return jsonOk(product, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Erro ao criar produto", 500);
  }
}
