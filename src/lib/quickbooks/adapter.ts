import { prisma } from "@/lib/db";
import type { Product } from "@prisma/client";

export type QbInvoiceLine = {
  sku: string;
  quantity: number;
  description?: string;
};

export type QbInvoice = {
  id: string;
  docNumber: string;
  customerName?: string;
  txnDate?: string;
  lines: QbInvoiceLine[];
};

export interface QuickBooksAdapter {
  fetchInvoice(docNumber: string): Promise<QbInvoice | null>;
  mapInvoiceToOrder(invoice: QbInvoice): Promise<{
    externalRef: string;
    customerName?: string;
    lines: Array<{ productId: string; quantity: number }>;
  }>;
}

/** Stub adapter — uses sample payloads / qb_sync_events, no live OAuth. */
export class StubQuickBooksAdapter implements QuickBooksAdapter {
  async fetchInvoice(docNumber: string): Promise<QbInvoice | null> {
    const event = await prisma.qbSyncEvent.findFirst({
      where: {
        OR: [{ externalId: docNumber }, { payload: { contains: docNumber } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (!event) return null;
    return JSON.parse(event.payload) as QbInvoice;
  }

  async mapInvoiceToOrder(invoice: QbInvoice) {
    const lines: Array<{ productId: string; quantity: number }> = [];
    for (const line of invoice.lines) {
      const product = await prisma.product.findFirst({
        where: { sku: line.sku },
      });
      if (!product) {
        throw new Error(`SKU não encontrado no estoque: ${line.sku}`);
      }
      lines.push({ productId: product.id, quantity: line.quantity });
    }
    return {
      externalRef: invoice.docNumber,
      customerName: invoice.customerName,
      lines,
    };
  }
}

export function describeQbFlow() {
  return {
    title: "Fluxo QuickBooks (arquitetura)",
    steps: [
      "Fatura criada no QuickBooks dispara evento (webhook ou polling).",
      "Payload é armazenado em qb_sync_events.",
      "Adapter mapeia linhas da fatura para produtos locais via SKU.",
      "Sistema cria/atualiza pedido e RESERVA quantidade (não remove físico).",
      "Separação/retirada no armazém reduz estoque físico.",
      "Quantidade faturada ≠ quantidade física até a retirada/entrega.",
    ],
  };
}

export async function storeQbSyncEvent(input: {
  eventType: string;
  externalId?: string;
  payload: unknown;
  notes?: string;
}) {
  return prisma.qbSyncEvent.create({
    data: {
      eventType: input.eventType,
      externalId: input.externalId ?? null,
      payload: JSON.stringify(input.payload),
      notes: input.notes ?? null,
    },
  });
}

export async function listQbSyncEvents() {
  return prisma.qbSyncEvent.findMany({ orderBy: { createdAt: "desc" } });
}

export type { Product };
