export function roundMoney(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function calcWeightedAverageCost(params: {
  existingQty: number;
  existingValue: number;
  incomingQty: number;
  incomingUnitCost: number;
}): {
  newQty: number;
  newValue: number;
  newAvgCost: number;
  incomingValue: number;
} {
  const incomingValue = roundMoney(params.incomingQty * params.incomingUnitCost);
  const newQty = params.existingQty + params.incomingQty;
  const newValue = roundMoney(params.existingValue + incomingValue);
  const newAvgCost = newQty === 0 ? 0 : roundMoney(newValue / newQty);
  return { newQty, newValue, newAvgCost, incomingValue };
}

export type AllocationLineInput = {
  id: string;
  quantity: number;
  purchaseUnitCost: number;
  /** Import tax of this line, a percent of its cost (25 = 25%). It stays on this line's product. */
  taxRate?: number;
};

export type AllocationLineResult = AllocationLineInput & {
  purchaseValue: number;
  tax: number;
  allocatedAdditionalCost: number;
  landedUnitCost: number;
  landedTotal: number;
};

/**
 * An importation's landed (CIF) cost per line:
 *   purchase value = quantity × cost (FOB)
 *   tax            = purchase value × tax% (this line only)
 *   share          = the lot's additional costs × purchase value ÷ all purchase values
 *   landed total   = purchase value + tax + share;  landed unit cost = landed total ÷ quantity
 * The last line takes the rounding remainder of the shares, so they add up to the costs exactly.
 */
export function allocateAdditionalCosts(
  lines: AllocationLineInput[],
  totalAdditionalCosts: number,
): AllocationLineResult[] {
  const withPurchase = lines.map((line) => {
    const purchaseValue = roundMoney(line.quantity * line.purchaseUnitCost);
    return { ...line, purchaseValue, tax: roundMoney(purchaseValue * (line.taxRate ?? 0) / 100) };
  });
  const sumPurchase = withPurchase.reduce((s, l) => s + l.purchaseValue, 0);
  const spread = sumPurchase > 0 && lines.length > 0;

  let allocatedSum = 0;
  return withPurchase.map((line, index) => {
    let allocated = 0;
    if (spread && index === withPurchase.length - 1) allocated = roundMoney(totalAdditionalCosts - allocatedSum);
    else if (spread) {
      allocated = roundMoney((line.purchaseValue / sumPurchase) * totalAdditionalCosts);
      allocatedSum = roundMoney(allocatedSum + allocated);
    }
    const landedTotal = roundMoney(line.purchaseValue + line.tax + allocated);
    const landedUnitCost = line.quantity === 0 ? 0 : roundMoney(landedTotal / line.quantity);
    return { ...line, allocatedAdditionalCost: allocated, landedUnitCost, landedTotal };
  });
}

/** The whole importation's coefficient: everything it cost ÷ what the products cost (1 when free). */
export function importCoefficient(lines: AllocationLineResult[]) {
  const purchase = lines.reduce((s, l) => s + l.purchaseValue, 0);
  const landed = lines.reduce((s, l) => s + l.landedTotal, 0);
  return purchase > 0 ? roundMoney(landed / purchase, 3) : 1;
}

/**
 * Money or quantity typed into a field: a number, or simple additions and subtractions of numbers
 * ("120+13", "120-13.5"). Anything else is null. Commas as thousands separators are dropped.
 */
export function readAmount(text: string): number | null {
  const clean = text.replace(/[\s,$]/g, "");
  if (!/^-?\d*\.?\d+([+-]\d*\.?\d+)*$/.test(clean)) return null;
  const total = (clean.match(/[+-]?\d*\.?\d+/g) ?? []).reduce((sum, part) => sum + Number(part), 0);
  return Number.isFinite(total) ? roundMoney(total, 4) : null;
}

/** What can still be sold: units on hand, less those reserved for invoices and those that can't be sold. */
export function recomputeAvailable(params: {
  physicalQty: number;
  reservedQty: number;
  unavailableQty: number;
}): number {
  return roundMoney(params.physicalQty - params.reservedQty - params.unavailableQty);
}

export function additionalImportCosts(c: {
  transferFee?: number;
  freight?: number;
  delivery?: number;
  duties?: number;
  customs?: number;
  otherCosts?: number;
}) {
  return roundMoney(
    (c.transferFee ?? 0) +
      (c.freight ?? 0) +
      (c.delivery ?? 0) +
      (c.duties ?? 0) +
      (c.customs ?? 0) +
      (c.otherCosts ?? 0),
  );
}

const M_PER_IN = 0.0254;

/** Package and product sizes are inches. CBM is cubic metres. */
export function packageCbmM3(l?: number | null, w?: number | null, h?: number | null) {
  if (!l || !w || !h) return 0;
  return roundMoney(l * w * h * M_PER_IN ** 3, 6);
}
