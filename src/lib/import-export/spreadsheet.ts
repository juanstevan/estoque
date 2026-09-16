import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { createProduct, updateProduct } from "@/lib/inventory/service";

export type SpreadsheetRow = {
  sku: string;
  code?: string;
  name?: string;
  type?: string;
  hsCode?: string;
  secondarySku?: string;
  ean?: string;
  amazonUrl?: string;
  imageUrl?: string;
  b2bPrice?: number;
  b2cPrice?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number;
  cutoutLength?: number;
  cutoutWidth?: number;
  cutoutHeight?: number;
  notes?: string;
};

export type ImportPreviewRow = {
  rowNumber: number;
  sku: string;
  status: "new" | "existing" | "invalid";
  errors: string[];
  data: SpreadsheetRow;
  existingId?: string;
};

function suppliersCell(raw: string | null) {
  if (!raw) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).join(", ");
  } catch {
    /* stored as plain text */
  }
  return raw;
}

export function parseSpreadsheet(buffer: ArrayBuffer): SpreadsheetRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return raw.map((r) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const found = Object.entries(r).find(
          ([key]) => key.toLowerCase().replace(/[\s_]/g, "") === k.toLowerCase(),
        );
        if (found && found[1] !== "") return found[1];
      }
      return undefined;
    };
    const str = (...keys: string[]) => {
      const v = get(...keys);
      return v === undefined ? undefined : String(v).trim();
    };
    const num = (...keys: string[]) => {
      const v = get(...keys);
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    return {
      sku: str("sku") ?? "",
      code: str("id", "code"),
      name: str("name", "nome", "productname"),
      type: str("type"),
      hsCode: str("hscode"),
      secondarySku: str("secondarysku", "skusecundario"),
      ean: str("ean", "barcode"),
      amazonUrl: str("amazonurl", "amazon"),
      imageUrl: str("imageurl", "image"),
      b2bPrice: num("b2b", "b2bprice", "precob2b"),
      b2cPrice: num("b2c", "b2cprice", "precob2c"),
      weight: num("weight", "peso"),
      length: num("length"),
      width: num("width"),
      height: num("height"),
      packageLength: num("packagelength"),
      packageWidth: num("packagewidth"),
      packageHeight: num("packageheight"),
      packageWeight: num("packageweight"),
      cutoutLength: num("cutoutlength"),
      cutoutWidth: num("cutoutwidth"),
      cutoutHeight: num("cutoutheight"),
      notes: str("notes", "observacoes", "notas"),
    };
  });
}

export async function previewImport(
  rows: SpreadsheetRow[],
): Promise<ImportPreviewRow[]> {
  const result: ImportPreviewRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const data = rows[i];
    const errors: string[] = [];
    if (!data.sku) errors.push("SKU is required");

    const existing = data.sku
      ? await prisma.product.findUnique({ where: { sku: data.sku } })
      : null;

    if (!existing && !data.name) {
      errors.push("Name is required for a new product");
    }

    result.push({
      rowNumber: i + 2,
      sku: data.sku || `(row ${i + 2})`,
      status: errors.length ? "invalid" : existing ? "existing" : "new",
      errors,
      data,
      existingId: existing?.id,
    });
  }
  return result;
}

function editableFields(row: SpreadsheetRow) {
  const data: Record<string, unknown> = {};
  if (row.name !== undefined) data.name = row.name;
  if (row.code !== undefined) data.code = row.code;
  if (row.type !== undefined) data.type = row.type;
  if (row.hsCode !== undefined) data.hsCode = row.hsCode;
  if (row.secondarySku !== undefined) data.secondarySku = row.secondarySku;
  if (row.ean !== undefined) data.ean = row.ean;
  if (row.amazonUrl !== undefined) data.amazonUrl = row.amazonUrl;
  if (row.imageUrl !== undefined) data.imageUrl = row.imageUrl;
  if (row.b2bPrice !== undefined) data.b2bPrice = row.b2bPrice;
  if (row.b2cPrice !== undefined) data.b2cPrice = row.b2cPrice;
  if (row.weight !== undefined) data.weight = row.weight;
  if (row.length !== undefined) data.length = row.length;
  if (row.width !== undefined) data.width = row.width;
  if (row.height !== undefined) data.height = row.height;
  if (row.packageLength !== undefined) data.packageLength = row.packageLength;
  if (row.packageWidth !== undefined) data.packageWidth = row.packageWidth;
  if (row.packageHeight !== undefined) data.packageHeight = row.packageHeight;
  if (row.packageWeight !== undefined) data.packageWeight = row.packageWeight;
  if (row.cutoutLength !== undefined) data.cutoutLength = row.cutoutLength;
  if (row.cutoutWidth !== undefined) data.cutoutWidth = row.cutoutWidth;
  if (row.cutoutHeight !== undefined) data.cutoutHeight = row.cutoutHeight;
  if (row.notes !== undefined) data.notes = row.notes;
  return data;
}

export async function applyImport(preview: ImportPreviewRow[]) {
  const applied = [];
  for (const row of preview) {
    if (row.status === "invalid") continue;
    const fields = editableFields(row.data);
    if (row.status === "new") {
      const created = await createProduct({
        name: row.data.name!,
        sku: row.data.sku,
        code: row.data.code,
        type: row.data.type,
        hsCode: row.data.hsCode,
        secondarySku: row.data.secondarySku,
        ean: row.data.ean,
        amazonUrl: row.data.amazonUrl,
        imageUrl: row.data.imageUrl,
        b2bPrice: row.data.b2bPrice ?? 0,
        b2cPrice: row.data.b2cPrice ?? 0,
        weight: row.data.weight,
        length: row.data.length,
        width: row.data.width,
        height: row.data.height,
        packageLength: row.data.packageLength,
        packageWidth: row.data.packageWidth,
        packageHeight: row.data.packageHeight,
        packageWeight: row.data.packageWeight,
        cutoutLength: row.data.cutoutLength,
        cutoutWidth: row.data.cutoutWidth,
        cutoutHeight: row.data.cutoutHeight,
        notes: row.data.notes,
      });
      applied.push({ action: "created", product: created });
    } else if (row.existingId) {
      await updateProduct(row.existingId, fields as never);
      applied.push({
        action: "updated",
        product: await prisma.product.findUniqueOrThrow({
          where: { id: row.existingId },
        }),
      });
    }
  }
  return applied;
}

export async function exportInventoryWorkbook(ids?: string[]) {
  const products = await prisma.product.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: "asc" },
  });
  const rows = products.map((p) => ({
    ID: p.code,
    Name: p.name,
    Type: p.type ?? "",
    SKU: p.sku,
    HS_Code: p.hsCode ?? "",
    Quantity: p.physicalQty,
    Available: p.availableQty,
    Reserved: p.reservedQty,
    Cost: p.avgCost,
    CIF_Cost: p.cifCost,
    FOB_Cost: p.fobCost,
    Total: p.inventoryValue,
    Last_Sold: p.lastSoldPrice,
    B2B: p.b2bPrice,
    B2C: p.b2cPrice,
    Weight: p.weight ?? "",
    Length: p.length ?? "",
    Width: p.width ?? "",
    Height: p.height ?? "",
    Package_Length: p.packageLength ?? "",
    Package_Width: p.packageWidth ?? "",
    Package_Height: p.packageHeight ?? "",
    Package_Weight: p.packageWeight ?? "",
    Cutout_Length: p.cutoutLength ?? "",
    Cutout_Width: p.cutoutWidth ?? "",
    Cutout_Height: p.cutoutHeight ?? "",
    Notes: p.notes ?? "",
    Amazon_URL: p.amazonUrl ?? "",
    Image_URL: p.imageUrl ?? "",
    Suppliers: suppliersCell(p.suppliers),
    EAN: p.ean ?? "",
    Secondary_SKU: p.secondarySku ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estoque");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
