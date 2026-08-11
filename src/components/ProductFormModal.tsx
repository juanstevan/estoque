"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { Product } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (product: Product) => void;
  product?: Product | null;
};

const empty = {
  name: "",
  sku: "",
  secondarySku: "",
  ean: "",
  imageUrl: "",
  b2bPrice: 0,
  b2cPrice: 0,
  weight: "",
  length: "",
  width: "",
  height: "",
  notes: "",
  initialQty: 0,
  initialUnitCost: 0,
};

function formFromProduct(product: Product | null | undefined) {
  if (!product) return empty;
  return {
    name: product.name,
    sku: product.sku,
    secondarySku: product.secondarySku ?? "",
    ean: product.ean ?? "",
    imageUrl: product.imageUrl ?? "",
    b2bPrice: product.b2bPrice,
    b2cPrice: product.b2cPrice,
    weight: product.weight?.toString() ?? "",
    length: product.length?.toString() ?? "",
    width: product.width?.toString() ?? "",
    height: product.height?.toString() ?? "",
    notes: product.notes ?? "",
    initialQty: 0,
    initialUnitCost: 0,
  };
}

export function ProductFormModal({ open, onClose, onSaved, product }: Props) {
  if (!open) return null;
  return (
    <ProductFormInner
      key={product?.id ?? "new"}
      product={product}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function ProductFormInner({
  onClose,
  onSaved,
  product,
}: {
  onClose: () => void;
  onSaved: (product: Product) => void;
  product?: Product | null;
}) {
  const [form, setForm] = useState(() => formFromProduct(product));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(product);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        secondarySku: form.secondarySku.trim() || null,
        ean: form.ean.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        b2bPrice: Number(form.b2bPrice) || 0,
        b2cPrice: Number(form.b2cPrice) || 0,
        weight: form.weight === "" ? null : Number(form.weight),
        length: form.length === "" ? null : Number(form.length),
        width: form.width === "" ? null : Number(form.width),
        height: form.height === "" ? null : Number(form.height),
        notes: form.notes.trim() || null,
        initialQty: editing ? undefined : Number(form.initialQty) || 0,
        initialUnitCost: editing ? undefined : Number(form.initialUnitCost) || 0,
      };
      if (!payload.name || !payload.sku) {
        throw new Error("Nome e SKU são obrigatórios");
      }
      const res = await fetch(editing ? `/api/products/${product!.id}` : "/api/products", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      onSaved(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar produto" : "Novo produto"}
      wide
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
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
          gridTemplateColumns: "1fr 1fr",
          gap: "1.25rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div
            style={{
              border: "1px dashed var(--border-strong)",
              borderRadius: 6,
              height: 140,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              background: "#fafbfc",
              overflow: "hidden",
            }}
          >
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.imageUrl}
                alt=""
                style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
              />
            ) : (
              "Sem imagem"
            )}
          </div>
          <div className="field">
            <label className="label">URL da imagem</label>
            <input
              className="input"
              value={form.imageUrl}
              onChange={(e) => set("imageUrl", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Nome do produto</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">SKU</label>
            <input
              className="input"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              disabled={editing}
            />
          </div>
          <div className="field">
            <label className="label">SKU secundário</label>
            <input
              className="input"
              value={form.secondarySku}
              onChange={(e) => set("secondarySku", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">EAN / Código de barras</label>
            <input
              className="input"
              value={form.ean}
              onChange={(e) => set("ean", e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {!editing && (
            <>
              <div className="field">
                <label className="label">Quantidade inicial</label>
                <input
                  className="input"
                  type="number"
                  value={form.initialQty}
                  onChange={(e) => set("initialQty", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="label">Custo unitário inicial</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={form.initialUnitCost}
                  onChange={(e) => set("initialUnitCost", Number(e.target.value))}
                />
              </div>
            </>
          )}
          {editing && (
            <>
              <div className="field">
                <label className="label">Quantidade atual</label>
                <input className="input" value={product!.physicalQty} disabled />
              </div>
              <div className="field">
                <label className="label">Custo médio atual</label>
                <input className="input" value={product!.avgCost} disabled />
              </div>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="field">
              <label className="label">Preço B2B</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.b2bPrice}
                onChange={(e) => set("b2bPrice", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label className="label">Preço B2C</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.b2cPrice}
                onChange={(e) => set("b2cPrice", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label className="label">Peso (kg)</label>
            <input
              className="input"
              type="number"
              step="0.001"
              value={form.weight}
              onChange={(e) => set("weight", e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
            <div className="field">
              <label className="label">Comp.</label>
              <input
                className="input"
                type="number"
                value={form.length}
                onChange={(e) => set("length", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Larg.</label>
              <input
                className="input"
                type="number"
                value={form.width}
                onChange={(e) => set("width", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Alt.</label>
              <input
                className="input"
                type="number"
                value={form.height}
                onChange={(e) => set("height", e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="label">Observações</label>
            <textarea
              className="input"
              rows={4}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
