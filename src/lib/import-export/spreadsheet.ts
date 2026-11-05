import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { correctCif, createProduct, updateProduct } from "@/lib/inventory/service";

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
  cifCost?: number;
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

export type ImportChange = { field: string; label: string; before: string | number | null; after: string | number };

export type ImportPreviewRow = {
  rowNumber: number;
  sku: string;
  /** "existing": something differs; "unchanged": the sheet matches the product. */
  status: "new" | "existing" | "unchanged" | "invalid";
  errors: string[];
  data: SpreadsheetRow;
  existingId?: string;
  code?: string;
  name?: string;
  changes: ImportChange[];
};

/** Columns an import may change on an existing product, in the order the review shows them. */
const FIELDS: Array<{ field: keyof SpreadsheetRow & string; label: string; number?: boolean; digits?: number }> = [
  { field: "code", label: "ID" },
  { field: "name", label: "Name" },
  { field: "type", label: "Type" },
  { field: "cifCost", label: "CIF", number: true, digits: 2 },
  { field: "b2bPrice", label: "B2B", number: true, digits: 2 },
  { field: "b2cPrice", label: "B2C", number: true, digits: 2 },
  { field: "hsCode", label: "HS code" },
  { field: "secondarySku", label: "Secondary SKU" },
  { field: "ean", label: "EAN" },
  { field: "weight", label: "Weight", number: true },
  { field: "length", label: "Length", number: true },
  { field: "width", label: "Width", number: true },
  { field: "height", label: "Height", number: true },
  { field: "packageLength", label: "Package length", number: true },
  { field: "packageWidth", label: "Package width", number: true },
  { field: "packageHeight", label: "Package height", number: true },
  { field: "packageWeight", label: "Package weight", number: true },
  { field: "cutoutLength", label: "Cut-out length", number: true },
  { field: "cutoutWidth", label: "Cut-out width", number: true },
  { field: "cutoutHeight", label: "Cut-out height", number: true },
  { field: "amazonUrl", label: "Amazon URL" },
  { field: "imageUrl", label: "Image URL" },
  { field: "notes", label: "Notes" },
];

const round = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

/** What the sheet would change on the product. Empty cells change nothing. */
export function diffProduct(product: Record<string, unknown>, row: SpreadsheetRow): ImportChange[] {
  const changes: ImportChange[] = [];
  for (const { field, label, number, digits } of FIELDS) {
    const raw = row[field];
    if (raw === undefined) continue;
    const current = product[field];
    if (number) {
      const after = round(Number(raw), digits);
      const before = typeof current === "number" ? round(current, digits) : null;
      if (before !== after) changes.push({ field, label, before, after });
    } else {
      const after = field === "code" ? String(raw).trim().toUpperCase().slice(0, 3) : String(raw).trim();
      const before = current == null ? null : String(current);
      if ((before ?? "") !== after) changes.push({ field, label, before, after });
    }
  }
  return changes;
}

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
      cifCost: num("cifcost", "cif", "custocif"),
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
  const products = await prisma.product.findMany({ where: { sku: { in: rows.map((r) => r.sku).filter(Boolean) } } });
  const bySku = new Map(products.map((p) => [p.sku, p]));
  return rows.map((data, i) => {
    const errors: string[] = [];
    if (!data.sku) errors.push("SKU is required");
    const existing = data.sku ? bySku.get(data.sku) : undefined;
    if (!existing && !data.name) errors.push("Name is required for a new product");
    if (data.cifCost !== undefined && data.cifCost < 0) errors.push("CIF can't be negative");
    const changes = existing && !errors.length ? diffProduct(existing, data) : [];
    return {
      rowNumber: i + 2,
      sku: data.sku || `(row ${i + 2})`,
      status: errors.length ? "invalid" : !existing ? "new" : changes.length ? "existing" : "unchanged",
      errors,
      data,
      existingId: existing?.id,
      code: existing?.code ?? data.code,
      name: existing?.name ?? data.name,
      changes,
    };
  });
}

/**
 * Applies the rows the person confirmed. Each existing product is compared with the database again,
 * so only what still differs changes. CIF goes through the logged CIF correction (main user only).
 */
export async function applyImport(preview: ImportPreviewRow[], actor: { id: string; main: boolean }) {
  const rows = await previewImport(preview.map((row) => row.data));
  if (!actor.main && rows.some((row) => row.changes.some((c) => c.field === "cifCost"))) {
    throw new Error("Only the main user can change CIF costs. Leave the CIF_Cost column as it is, or ask the main user.");
  }
  const applied = [];
  for (const row of rows) {
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
        userId: actor.id,
      });
      if (row.data.cifCost !== undefined && actor.main) {
        await correctCif({ productId: created.id, cifCost: row.data.cifCost, reason: "Spreadsheet import", userId: actor.id });
      }
      applied.push({ action: "created", sku: row.sku });
    } else if (row.status === "existing" && row.existingId) {
      const fields = Object.fromEntries(
        row.changes.filter((c) => c.field !== "cifCost").map((c) => [c.field, c.after]),
      );
      if (Object.keys(fields).length) await updateProduct(row.existingId, fields as never);
      const cif = row.changes.find((c) => c.field === "cifCost");
      if (cif) await correctCif({ productId: row.existingId, cifCost: Number(cif.after), reason: "Spreadsheet import", userId: actor.id });
      applied.push({ action: "updated", sku: row.sku });
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
