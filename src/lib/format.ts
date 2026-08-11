export function formatMoney(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value || 0);
}

export function formatQty(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(value || 0);
}

export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  RECEIVED: "Recebido",
  SOLD: "Vendido",
  RESERVED: "Reservado",
  RELEASED: "Liberado",
  PICKED_UP: "Retirado",
  DELIVERED: "Entregue",
  ADJUSTMENT: "Ajuste",
  CORRECTION: "Correção",
  RETURNED: "Devolvido",
  TRANSFER: "Transferência",
  IMPORTATION: "Importação",
};

export const IMPORTATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  IN_TRANSIT: "Em trânsito",
  PARTIALLY_RECEIVED: "Parcialmente recebido",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberto",
  PARTIALLY_PICKED: "Parcialmente separado",
  READY_PICKUP: "Pronto para retirada",
  READY_DELIVERY: "Pronto para entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};
