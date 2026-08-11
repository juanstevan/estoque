export type Product = {
  id: string;
  name: string;
  sku: string;
  secondarySku: string | null;
  ean: string | null;
  imageUrl: string | null;
  b2bPrice: number;
  b2cPrice: number;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  notes: string | null;
  physicalQty: number;
  availableQty: number;
  reservedQty: number;
  waitingPickupQty: number;
  waitingDeliveryQty: number;
  unavailableQty: number;
  avgCost: number;
  inventoryValue: number;
  createdAt: string;
  updatedAt: string;
};

export type InventoryTransaction = {
  id: string;
  productId: string;
  type: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  reference: string | null;
  notes: string | null;
  userId: string;
  occurredAt: string;
};

export type CostHistory = {
  id: string;
  productId: string;
  eventType: string;
  quantityDelta: number;
  unitCost: number;
  resultingAvgCost: number;
  resultingQty: number;
  resultingValue: number;
  occurredAt: string;
};

export type ProductDetail = Product & {
  transactions: InventoryTransaction[];
  costHistory: CostHistory[];
};

export type ImportationLine = {
  id: string;
  productId: string | null;
  draftName: string | null;
  draftSku: string | null;
  draftEan: string | null;
  quantity: number;
  purchaseUnitCost: number;
  allocatedAdditionalCost: number;
  landedUnitCost: number;
  weight: number | null;
  notes: string | null;
  product?: Product | null;
};

export type Importation = {
  id: string;
  reference: string;
  status: string;
  expectedDate: string | null;
  notes: string | null;
  freightIntl: number;
  customs: number;
  brokerFees: number;
  portFees: number;
  freightDomestic: number;
  otherCosts: number;
  productSubtotal: number;
  totalAdditionalCosts: number;
  lines: ImportationLine[];
};

export type OrderLine = {
  id: string;
  productId: string;
  orderedQty: number;
  reservedQty: number;
  pickedQty: number;
  waitingPickupQty: number;
  deliveredQty: number;
  remainingQty: number;
  product: Product;
};

export type Order = {
  id: string;
  externalRef: string;
  customerName: string | null;
  status: string;
  source: string;
  notes: string | null;
  lines: OrderLine[];
};
