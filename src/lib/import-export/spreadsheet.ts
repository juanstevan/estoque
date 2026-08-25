import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { adjustInventory, createProduct, updateProduct } from "@/lib/inventory/service";

export type SpreadsheetRow = {
  sku: string;
  name?: string;
  secondarySku?: string;
  ean?: string;
  physicalQty?: number;
  avgCost?: number;
  b2bPrice?: number;
  b2cPrice?: number;
  weight?: number;
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
          ([key]) => key.toLowerCase().replace(/\s/g, "") === k.toLowerCase(),
        );
        if (found && found[1] !== "") return found[1];
      }
      return undefined;
    };
    const num = (v: unknown) => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };
    return {
      sku: String(get("sku", "SKU") ?? "").trim(),
      name: get("name", "nome", "productname")
        ? String(get("name", "nome", "productname"))
        : undefined,
      secondarySku: get("secondarysku", "skusecundario")
        ? String(get("secondarysku", "skusecundario"))
        : undefined,
      ean: get("ean", "barcode", "codigoBarras")
        ? String(get("ean", "barcode", "codigoBarras"))
        : undefined,
      physicalQty: num(get("physicalqty", "quantidade", "qty", "qtd")),
      avgCost: num(get("avgcost", "customedio", "custo")),
      b2bPrice: num(get("b2bprice", "precob2b", "b2b")),
      b2cPrice: num(get("b2cprice", "precob2c", "b2c")),
      weight: num(get("weight", "peso")),
      notes: get("notes", "observacoes", "notas")
        ? String(get("notes", "observacoes", "notas"))
        : undefined,
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
    if (!data.sku) errors.push("SKU obrigatório");
    if (data.physicalQty !== undefined && Number.isNaN(data.physicalQty)) {
      errors.push("Quantidade inválida");
    }
    if (data.physicalQty !== undefined && data.physicalQty < 0) {
      errors.push("Quantidade não pode ser negativa");
    }
    if (data.avgCost !== undefined && Number.isNaN(data.avgCost)) {
      errors.push("Custo inválido");
    }
    if (data.b2bPrice !== undefined && Number.isNaN(data.b2bPrice)) {
      errors.push("Preço B2B inválido");
    }
    if (data.b2cPrice !== undefined && Number.isNaN(data.b2cPrice)) {
      errors.push("Preço B2C inválido");
    }

    const existing = data.sku
      ? await prisma.product.findUnique({ where: { sku: data.sku } })
      : null;

    if (!existing && !data.name) {
      errors.push("Nome obrigatório para produto novo");
    }

    result.push({
      rowNumber: i + 2,
      sku: data.sku || `(linha ${i + 2})`,
      status: errors.length
        ? "invalid"
        : existing
          ? "existing"
          : "new",
      errors,
      data,
      existingId: existing?.id,
    });
  }
  return result;
}

export async function applyImport(preview: ImportPreviewRow[]) {
  const applied = [];
  for (const row of preview) {
    if (row.status === "invalid") continue;
    if (row.status === "new") {
      const created = await createProduct({
        name: row.data.name!,
        sku: row.data.sku,
        secondarySku: row.data.secondarySku,
        ean: row.data.ean,
        b2bPrice: row.data.b2bPrice ?? 0,
        b2cPrice: row.data.b2cPrice ?? 0,
        weight: row.data.weight,
        notes: row.data.notes,
        initialQty: row.data.physicalQty ?? 0,
        initialUnitCost: row.data.avgCost ?? 0,
      });
      applied.push({ action: "created", product: created });
    } else if (row.existingId) {
      const existing = await prisma.product.findUniqueOrThrow({
        where: { id: row.existingId },
      });
      await updateProduct(row.existingId, {
        name: row.data.name ?? existing.name,
        secondarySku: row.data.secondarySku ?? existing.secondarySku,
        ean: row.data.ean ?? existing.ean,
        b2bPrice: row.data.b2bPrice ?? existing.b2bPrice,
        b2cPrice: row.data.b2cPrice ?? existing.b2cPrice,
        weight: row.data.weight ?? existing.weight,
        notes: row.data.notes ?? existing.notes,
      });
      if (
        row.data.physicalQty !== undefined &&
        row.data.physicalQty !== existing.physicalQty
      ) {
        const delta = row.data.physicalQty - existing.physicalQty;
        await adjustInventory({
          productId: existing.id,
          quantityDelta: delta,
          reason: "Importação planilha",
          notes: "Ajuste de quantidade via importação de planilha",
          type: "CORRECTION",
        });
      }
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

export async function exportInventoryWorkbook() {
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
  const rows = products.map((p) => ({
    ID: p.code,
    Name: p.name,
    SKU: p.sku,
    Quantity: p.physicalQty,
    Available: p.availableQty,
    Reserved: p.reservedQty,
    Avg_Cost: p.avgCost,
    B2B: p.b2bPrice,
    B2C: p.b2cPrice,
    Total: p.inventoryValue,
    Notes: p.notes ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estoque");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
