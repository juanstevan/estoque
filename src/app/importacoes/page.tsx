"use client";

import { useEffect, useState } from "react";
import type { Importation } from "@/lib/types";
import {
  IMPORTATION_STATUS_LABELS,
  formatDate,
  formatMoney,
} from "@/lib/format";

export default function ImportacoesPage() {
  const [items, setItems] = useState<Importation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/importations");
    setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirm(id: string) {
    setMessage(null);
    const res = await fetch(`/api/importations/${id}?action=confirm`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Erro");
      return;
    }
    setMessage("Importação recebida — estoque atualizado.");
    void load();
  }

  return (
    <div style={{ padding: "1.25rem" }}>
      <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.35rem" }}>Importações</h1>
      <p style={{ margin: "0 0 1rem", color: "var(--text-muted)" }}>
        Rascunhos e recebimentos. Rascunhos não alteram quantidade nem custo até a
        confirmação.
      </p>
      {message && (
        <div style={{ marginBottom: "0.75rem", color: "var(--success)" }}>{message}</div>
      )}
      {loading ? (
        <div className="empty">Carregando…</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Status</th>
                <th>Previsão</th>
                <th>Linhas</th>
                <th>Produtos</th>
                <th>Adicionais</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">Nenhuma importação</div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} style={{ cursor: "default" }}>
                    <td className="num">{item.reference}</td>
                    <td>
                      <span className="badge">
                        {IMPORTATION_STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>
                      {item.expectedDate ? formatDate(item.expectedDate) : "—"}
                    </td>
                    <td className="num">{item.lines.length}</td>
                    <td className="num">{formatMoney(item.productSubtotal)}</td>
                    <td className="num">
                      {formatMoney(item.totalAdditionalCosts)}
                    </td>
                    <td>
                      {item.status !== "RECEIVED" && item.status !== "CANCELLED" ? (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => void confirm(item.id)}
                        >
                          Receber
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
