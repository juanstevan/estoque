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
};

export type AllocationLineResult = AllocationLineInput & {
  purchaseValue: number;
  allocatedAdditionalCost: number;
  landedUnitCost: number;
  landedTotal: number;
};

/** Value-proportional allocation of additional importation costs. */
export function allocateAdditionalCosts(
  lines: AllocationLineInput[],
  totalAdditionalCosts: number,
): AllocationLineResult[] {
  const withPurchase = lines.map((line) => ({
    ...line,
    purchaseValue: roundMoney(line.quantity * line.purchaseUnitCost),
  }));
  const sumPurchase = withPurchase.reduce((s, l) => s + l.purchaseValue, 0);

  if (sumPurchase <= 0 || lines.length === 0) {
    return withPurchase.map((line) => ({
      ...line,
      allocatedAdditionalCost: 0,
      landedUnitCost: roundMoney(line.purchaseUnitCost),
      landedTotal: roundMoney(line.quantity * line.purchaseUnitCost),
    }));
  }

  let allocatedSum = 0;
  const results: AllocationLineResult[] = withPurchase.map((line, index) => {
    const isLast = index === withPurchase.length - 1;
    let allocated: number;
    if (isLast) {
      allocated = roundMoney(totalAdditionalCosts - allocatedSum);
    } else {
      allocated = roundMoney(
        (line.purchaseValue / sumPurchase) * totalAdditionalCosts,
      );
      allocatedSum = roundMoney(allocatedSum + allocated);
    }
    const landedTotal = roundMoney(line.purchaseValue + allocated);
    const landedUnitCost =
      line.quantity === 0 ? 0 : roundMoney(landedTotal / line.quantity);
    return {
      ...line,
      allocatedAdditionalCost: allocated,
      landedUnitCost,
      landedTotal,
    };
  });

  return results;
}

export function recomputeAvailable(params: {
  physicalQty: number;
  reservedQty: number;
  waitingPickupQty: number;
  waitingDeliveryQty: number;
  unavailableQty: number;
}): number {
  return roundMoney(
    params.physicalQty -
      params.reservedQty -
      params.waitingPickupQty -
      params.waitingDeliveryQty -
      params.unavailableQty,
  );
}
