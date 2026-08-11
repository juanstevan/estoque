"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import type { Product } from "@/lib/types";
import { formatMoney } from "@/lib/format";

type Line = {
  key: string;
  productId: string | null;
  productLabel: string;
  draftName: string;
  draftSku: string;
  draftEan: string;
  quantity: number;
  purchaseUnitCost: number;
  weight: string;
  dimensions: string;
  notes: string;
  query: string;
  suggestions: Product[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function newLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    productId: null,
    productLabel: "",
    draftName: "",
    draftSku: "",
    draftEan: "",
    quantity: 1,
    purchaseUnitCost: 0,
    weight: "",
    dimensions: "",
    notes: "",
    query: "",
    suggestions: [],
  };
}

export function BulkReceiveModal({ open, onClose, onSaved }: Props) {
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [reference, setReference] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [freightIntl, setFreightIntl] = useState(0);
  const [customs, setCustoms] = useState(0);
  const [brokerFees, setBrokerFees] = useState(0);
  const [portFees, setPortFees] = useState(0);
  const [freightDomestic, setFreightDomestic] = useState(0);
  const [otherCosts, setOtherCosts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!open) return;
    setLines([newLine()]);
    setReference("");
    setExpectedDate("");
    setNotes("");
    setFreightIntl(0);
    setCustoms(0);
    setBrokerFees(0);
    setPortFees(0);
    setFreightDomestic(0);
    setOtherCosts(0);
    setError(null);
  }, [open]);

  const productSubtotal = useMemo(
    () =>
      lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.purchaseUnitCost) || 0), 0),
    [lines],
  );
  const totalAdditional =
    freightIntl + customs + brokerFees + portFees + freightDomestic + otherCosts;

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function searchProducts(key: string, q: string) {
    updateLine(key, { query: q, productLabel: q });
    if (searchTimers.current[key]) clearTimeout(searchTimers.current[key]);
    searchTimers.current[key] = setTimeout(async () => {
      if (!q.trim()) {
        updateLine(key, { suggestions: [] });
        return;
      }
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as Product[];
      updateLine(key, { suggestions: data.slice(0, 8) });
    }, 200);
  }

  function selectProduct(key: string, p: Product) {
    updateLine(key, {
      productId: p.id,
      productLabel: `${p.name} (${p.sku})`,
      query: `${p.name} (${p.sku})`,
      draftName: "",
      draftSku: "",
      draftEan: "",
      suggestions: [],
      weight: p.weight != null ? String(p.weight) : "",
    });
  }

  function createNewOnLine(key: string) {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    updateLine(key, {
      productId: null,
      draftName: line.query,
      draftSku: "",
      productLabel: line.query || "Novo produto",
      suggestions: [],
    });
  }

  async function submit(confirm: boolean) {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        reference: reference || undefined,
        status: confirm ? undefined : "DRAFT",
        expectedDate: expectedDate || null,
        notes: notes || null,
        freightIntl,
        customs,
        brokerFees,
        portFees,
        freightDomestic,
        otherCosts,
        confirm,
        lines: lines.map((l) => ({
          productId: l.productId,
          draftName: l.productId ? null : l.draftName || l.query || null,
          draftSku: l.productId ? null : l.draftSku || null,
          draftEan: l.productId ? null : l.draftEan || null,
          quantity: Number(l.quantity) || 0,
          purchaseUnitCost: Number(l.purchaseUnitCost) || 0,
          weight: l.weight === "" ? null : Number(l.weight),
          notes: l.notes || null,
        })),
      };
      if (payload.lines.some((l) => l.quantity <= 0)) {
        throw new Error("Todas as linhas precisam de quantidade > 0");
      }
      if (payload.lines.some((l) => !l.productId && !l.draftName && !l.draftSku)) {
        throw new Error("Selecione ou crie um produto em cada linha");
      }
      const res = await fetch("/api/importations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importação / Recebimento em lote"
      wide
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn"
            type="button"
            disabled={saving}
            onClick={() => submit(false)}
          >
            Salvar rascunho
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={() => submit(true)}
          >
            Confirmar recebimento
          </button>
        </>
      }
    >
      {error && (
        <div style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div className="field">
          <label className="label">Referência</label>
          <input
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="IMP-…"
          />
        </div>
        <div className="field">
          <label className="label">Previsão de chegada</label>
          <input
            className="input"
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label className="label">Observações</label>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 6,
          marginBottom: "1rem",
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        <table className="data-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>Produto</th>
              <th>Qtd</th>
              <th>Custo unit.</th>
              <th>Peso</th>
              <th>Dimensões</th>
              <th>SKU/EAN (novo)</th>
              <th>Notas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} style={{ cursor: "default", verticalAlign: "top" }}>
                <td style={{ position: "relative", minWidth: 240 }}>
                  <input
                    className="input"
                    value={line.query}
                    placeholder="Buscar nome ou SKU…"
                    onChange={(e) => searchProducts(line.key, e.target.value)}
                  />
                  {line.suggestions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 8,
                        right: 8,
                        top: "100%",
                        background: "#fff",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        zIndex: 5,
                        maxHeight: 180,
                        overflow: "auto",
                      }}
                    >
                      {line.suggestions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="btn btn-ghost"
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            borderRadius: 0,
                          }}
                          onClick={() => selectProduct(line.key, p)}
                        >
                          {p.name} · {p.sku}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          borderRadius: 0,
                          color: "var(--accent)",
                        }}
                        onClick={() => createNewOnLine(line.key)}
                      >
                        + Criar novo produto
                      </button>
                    </div>
                  )}
                  {!line.productId && (line.draftName || line.query) && (
                    <div style={{ fontSize: 12, color: "var(--warning)", marginTop: 4 }}>
                      Novo: {line.draftName || line.query}
                    </div>
                  )}
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 80 }}
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(line.key, { quantity: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    style={{ width: 100 }}
                    value={line.purchaseUnitCost}
                    onChange={(e) =>
                      updateLine(line.key, {
                        purchaseUnitCost: Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    style={{ width: 80 }}
                    value={line.weight}
                    onChange={(e) => updateLine(line.key, { weight: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    style={{ width: 100 }}
                    value={line.dimensions}
                    onChange={(e) =>
                      updateLine(line.key, { dimensions: e.target.value })
                    }
                    placeholder="C×L×A"
                  />
                </td>
                <td>
                  {!line.productId ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        className="input"
                        style={{ width: 90 }}
                        placeholder="SKU"
                        value={line.draftSku}
                        onChange={(e) =>
                          updateLine(line.key, { draftSku: e.target.value })
                        }
                      />
                      <input
                        className="input"
                        style={{ width: 90 }}
                        placeholder="EAN"
                        value={line.draftEan}
                        onChange={(e) =>
                          updateLine(line.key, { draftEan: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <input
                    className="input"
                    style={{ width: 120 }}
                    value={line.notes}
                    onChange={(e) => updateLine(line.key, { notes: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() =>
                      setLines((prev) =>
                        prev.length === 1
                          ? prev
                          : prev.filter((l) => l.key !== line.key),
                      )
                    }
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn" type="button" onClick={() => setLines((p) => [...p, newLine()])}>
        + Adicionar linha
      </button>

      <div
        style={{
          marginTop: "1.25rem",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem",
          padding: "0.85rem",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "#fafbfc",
        }}
      >
        <CostInput label="Frete internacional" value={freightIntl} onChange={setFreightIntl} />
        <CostInput label="Alfândega" value={customs} onChange={setCustoms} />
        <CostInput label="Despachante" value={brokerFees} onChange={setBrokerFees} />
        <CostInput label="Taxas portuárias" value={portFees} onChange={setPortFees} />
        <CostInput label="Frete doméstico" value={freightDomestic} onChange={setFreightDomestic} />
        <CostInput label="Outros" value={otherCosts} onChange={setOtherCosts} />
        <div>
          <div className="label">Custo produtos</div>
          <div className="num" style={{ fontWeight: 600 }}>
            {formatMoney(productSubtotal)}
          </div>
        </div>
        <div>
          <div className="label">Custos adicionais</div>
          <div className="num" style={{ fontWeight: 600 }}>
            {formatMoney(totalAdditional)}
          </div>
        </div>
        <div>
          <div className="label">Total estimado</div>
          <div className="num" style={{ fontWeight: 700, color: "var(--accent)" }}>
            {formatMoney(productSubtotal + totalAdditional)}
          </div>
        </div>
      </div>
      <p style={{ margin: "0.75rem 0 0", color: "var(--text-muted)", fontSize: 13 }}>
        Custos adicionais são rateados proporcionalmente ao valor de cada linha (custo
        desembarcado).
      </p>
    </Modal>
  );
}

function CostInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input
        className="input"
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
