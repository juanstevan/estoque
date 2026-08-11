"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { ProductDetail } from "@/lib/types";
import {
  TRANSACTION_TYPE_LABELS,
  formatDateTime,
  formatMoney,
  formatQty,
} from "@/lib/format";

type Props = {
  productId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
};

export function ProductDetailModal({
  productId,
  open,
  onClose,
  onEdit,
  onAdjust,
}: Props) {
  if (!open || !productId) return null;
  return (
    <ProductDetailInner
      key={productId}
      productId={productId}
      onClose={onClose}
      onEdit={onEdit}
      onAdjust={onAdjust}
    />
  );
}

function ProductDetailInner({
  productId,
  onClose,
  onEdit,
  onAdjust,
}: {
  productId: string;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "history" | "cost">("overview");
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/products/${productId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setProduct(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? product.name : "Detalhes do produto"}
      wide
      footer={
        <>
          <button className="btn" type="button" onClick={onAdjust}>
            Ajuste manual
          </button>
          <button className="btn" type="button" onClick={onEdit}>
            Editar
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      {loading || !product ? (
        <div className="empty">Carregando…</div>
      ) : (
        <>
          <div className="tabs" style={{ marginBottom: "1rem" }}>
            {(
              [
                ["overview", "Visão geral"],
                ["history", "Histórico"],
                ["cost", "Histórico de custos"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="tab"
                data-active={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: "1.25rem",
              }}
            >
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  height: 160,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fafbfc",
                  color: "var(--text-muted)",
                }}
              >
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt=""
                    style={{ maxWidth: "100%", maxHeight: "100%" }}
                  />
                ) : (
                  "Sem imagem"
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.85rem",
                }}
              >
                <Info label="SKU" value={product.sku} />
                <Info label="SKU secundário" value={product.secondarySku || "—"} />
                <Info label="EAN" value={product.ean || "—"} />
                <Info label="Qtd física" value={formatQty(product.physicalQty)} mono />
                <Info label="Disponível" value={formatQty(product.availableQty)} mono />
                <Info label="Reservado" value={formatQty(product.reservedQty)} mono />
                <Info
                  label="Aguardando retirada"
                  value={formatQty(product.waitingPickupQty)}
                  mono
                />
                <Info label="Custo médio" value={formatMoney(product.avgCost)} mono />
                <Info
                  label="Valor estoque"
                  value={formatMoney(product.inventoryValue)}
                  mono
                />
                <Info label="B2B" value={formatMoney(product.b2bPrice)} mono />
                <Info label="B2C" value={formatMoney(product.b2cPrice)} mono />
                <Info
                  label="Peso"
                  value={product.weight != null ? `${product.weight} kg` : "—"}
                />
                <Info
                  label="Dimensões"
                  value={
                    product.length != null
                      ? `${product.length} × ${product.width} × ${product.height}`
                      : "—"
                  }
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <Info label="Observações" value={product.notes || "—"} />
                </div>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Qtd</th>
                    <th>Custo unit.</th>
                    <th>Total</th>
                    <th>Referência</th>
                    <th>Usuário</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {product.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="empty">Sem movimentações</div>
                      </td>
                    </tr>
                  ) : (
                    product.transactions.map((t) => (
                      <tr key={t.id} style={{ cursor: "default" }}>
                        <td>{formatDateTime(t.occurredAt)}</td>
                        <td>{TRANSACTION_TYPE_LABELS[t.type] ?? t.type}</td>
                        <td className="num">
                          {t.quantity > 0 ? "+" : ""}
                          {formatQty(t.quantity)}
                        </td>
                        <td className="num">{formatMoney(t.unitCost)}</td>
                        <td className="num">{formatMoney(t.totalValue)}</td>
                        <td>{t.reference || "—"}</td>
                        <td>{t.userId}</td>
                        <td style={{ maxWidth: 220, whiteSpace: "normal" }}>
                          {t.notes || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "cost" && (
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Evento</th>
                    <th>Quantidade</th>
                    <th>Custo unit.</th>
                    <th>Custo médio</th>
                    <th>Qtd resultante</th>
                    <th>Valor resultante</th>
                  </tr>
                </thead>
                <tbody>
                  {product.costHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty">Sem histórico de custos</div>
                      </td>
                    </tr>
                  ) : (
                    [...product.costHistory]
                      .sort(
                        (a, b) =>
                          new Date(a.occurredAt).getTime() -
                          new Date(b.occurredAt).getTime(),
                      )
                      .map((c) => (
                        <tr key={c.id} style={{ cursor: "default" }}>
                          <td>{formatDateTime(c.occurredAt)}</td>
                          <td>
                            {TRANSACTION_TYPE_LABELS[c.eventType] ?? c.eventType}
                          </td>
                          <td className="num">
                            {c.quantityDelta > 0 ? "+" : ""}
                            {formatQty(c.quantityDelta)}
                          </td>
                          <td className="num">{formatMoney(c.unitCost)}</td>
                          <td className="num">
                            {formatMoney(c.resultingAvgCost)}
                          </td>
                          <td className="num">{formatQty(c.resultingQty)}</td>
                          <td className="num">
                            {formatMoney(c.resultingValue)}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={mono ? "num" : undefined} style={{ fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
