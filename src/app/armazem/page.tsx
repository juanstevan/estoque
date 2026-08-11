"use client";

import { useEffect, useRef, useState } from "react";
import type { Order } from "@/lib/types";
import {
  ORDER_STATUS_LABELS,
  formatQty,
} from "@/lib/format";

export default function ArmazemPage() {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  async function loadOrder() {
    setError(null);
    setFeedback(null);
    const res = await fetch(`/api/orders?ref=${encodeURIComponent(query.trim())}`);
    const data = await res.json();
    if (!res.ok) {
      setOrder(null);
      setError(data.error || "Pedido não encontrado");
      return;
    }
    setOrder(data);
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  async function pickByScan(code: string) {
    if (!order) return;
    const line = order.lines.find(
      (l) =>
        l.product.sku.toLowerCase() === code.toLowerCase() ||
        l.product.ean === code ||
        l.product.secondarySku?.toLowerCase() === code.toLowerCase(),
    );
    if (!line) {
      setFeedback("Produto não pertence a este pedido");
      setScan("");
      return;
    }
    if (line.pickedQty >= line.orderedQty) {
      setFeedback("Quantidade do pedido já totalmente separada");
      setScan("");
      return;
    }
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pick",
        orderId: order.id,
        productId: line.productId,
        quantity: 1,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error || "Erro ao separar");
      return;
    }
    setOrder(data);
    setFeedback(`OK — ${line.product.name} separado`);
    setScan("");
    scanRef.current?.focus();
  }

  async function confirmPickup() {
    if (!order) return;
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pickup", orderId: order.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error || "Erro");
      return;
    }
    setOrder(data);
    setFeedback("Retirada confirmada — estoque físico atualizado");
  }

  useEffect(() => {
    scanRef.current?.focus();
  }, [order?.id]);

  return (
    <div style={{ padding: "1.25rem", maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.6rem" }}>Armazém</h1>
      <p style={{ margin: "0 0 1.25rem", color: "var(--text-muted)", fontSize: 15 }}>
        Interface para separação com leitor de código de barras. Busque o pedido e
        escaneie os produtos.
      </p>

      <div style={{ display: "flex", gap: "0.65rem", marginBottom: "1.25rem" }}>
        <input
          className="input"
          style={{ fontSize: 18, padding: "0.75rem 0.9rem", flex: 1 }}
          placeholder="Nº da fatura / pedido (ex.: NF-1024)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void loadOrder();
          }}
        />
        <button
          className="btn btn-primary"
          type="button"
          style={{ fontSize: 16, padding: "0.75rem 1.1rem" }}
          onClick={() => void loadOrder()}
        >
          Buscar
        </button>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 16 }}>{error}</div>
      )}
      {feedback && (
        <div
          style={{
            marginBottom: 12,
            fontSize: 18,
            fontWeight: 600,
            color: feedback.startsWith("OK") || feedback.includes("confirmada")
              ? "var(--success)"
              : "var(--warning)",
          }}
        >
          {feedback}
        </div>
      )}

      {order && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.85rem",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{order.externalRef}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 15 }}>
                {order.customerName || "Cliente"} ·{" "}
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </div>
            </div>
            <button
              className="btn"
              type="button"
              style={{ fontSize: 15 }}
              onClick={() => void confirmPickup()}
            >
              Confirmar retirada
            </button>
          </div>

          <div className="field" style={{ marginBottom: "1rem" }}>
            <label className="label">Scan / código de barras</label>
            <input
              ref={scanRef}
              className="input"
              style={{ fontSize: 20, padding: "0.85rem 1rem" }}
              value={scan}
              placeholder="Escaneie o produto…"
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && scan.trim()) {
                  void pickByScan(scan.trim());
                }
              }}
            />
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>SKU</th>
                  <th>Pedido</th>
                  <th>Separado</th>
                  <th>Restante</th>
                  <th>Físico</th>
                  <th>Disponível</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.id} style={{ cursor: "default", fontSize: 16 }}>
                    <td style={{ fontWeight: 600 }}>{line.product.name}</td>
                    <td className="num">{line.product.sku}</td>
                    <td className="num">{formatQty(line.orderedQty)}</td>
                    <td className="num">{formatQty(line.pickedQty)}</td>
                    <td className="num">
                      {formatQty(line.orderedQty - line.pickedQty)}
                    </td>
                    <td className="num">{formatQty(line.product.physicalQty)}</td>
                    <td className="num">{formatQty(line.product.availableQty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
