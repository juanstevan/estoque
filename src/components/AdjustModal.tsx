"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";

type Props = {
  open: boolean;
  productId: string | null;
  productName?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function AdjustModal({
  open,
  productId,
  productName,
  onClose,
  onSaved,
}: Props) {
  const [quantityDelta, setQuantityDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<"ADJUSTMENT" | "CORRECTION">("ADJUSTMENT");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!productId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantityDelta,
          reason,
          notes,
          type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha");
      setQuantityDelta(0);
      setReason("");
      setNotes("");
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
      title={`Ajuste manual${productName ? ` — ${productName}` : ""}`}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            Registrar ajuste
          </button>
        </>
      }
    >
      {error && (
        <div style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</div>
      )}
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 480 }}>
        <div className="field">
          <label className="label">Quantidade (+ / −)</label>
          <input
            className="input"
            type="number"
            value={quantityDelta}
            onChange={(e) => setQuantityDelta(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label className="label">Tipo</label>
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as "ADJUSTMENT" | "CORRECTION")}
          >
            <option value="ADJUSTMENT">Ajuste</option>
            <option value="CORRECTION">Correção</option>
          </select>
        </div>
        <div className="field">
          <label className="label">Motivo</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: dano, inventário, produto encontrado…"
          />
        </div>
        <div className="field">
          <label className="label">Observação</label>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
