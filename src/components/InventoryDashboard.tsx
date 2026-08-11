"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { InventoryTable } from "@/components/InventoryTable";
import { ProductFormModal } from "@/components/ProductFormModal";
import { ProductDetailModal } from "@/components/ProductDetailModal";
import { AdjustModal } from "@/components/AdjustModal";
import { BulkReceiveModal } from "@/components/BulkReceiveModal";
import type { Product } from "@/lib/types";

export function InventoryDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = products.find((p) => p.id === selectedId) ?? null;

  return (
    <div style={{ padding: "1rem 1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 260, maxWidth: 480 }}
          placeholder="Buscar por nome, ID, SKU, SKU secundário ou EAN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary" type="button" onClick={() => setReceiveOpen(true)}>
          Importação em lote
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + Produto
        </button>
        <Link className="btn" href="/importar-exportar">
          Importar / Exportar
        </Link>
      </div>

      {loading ? (
        <div className="empty">Carregando estoque…</div>
      ) : (
        <InventoryTable
          data={products}
          globalFilter={search}
          onSelect={(p) => {
            setSelectedId(p.id);
            setDetailOpen(true);
          }}
        />
      )}

      <ProductDetailModal
        open={detailOpen}
        productId={selectedId}
        onClose={() => setDetailOpen(false)}
        onEdit={() => {
          setEditing(selected);
          setFormOpen(true);
        }}
        onAdjust={() => setAdjustOpen(true)}
      />

      <ProductFormModal
        open={formOpen}
        product={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />

      <AdjustModal
        open={adjustOpen}
        productId={selectedId}
        productName={selected?.name}
        onClose={() => setAdjustOpen(false)}
        onSaved={() => void load()}
      />

      <BulkReceiveModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
