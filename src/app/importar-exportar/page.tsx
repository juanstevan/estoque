"use client";

import { useState } from "react";

type ImportPreviewRow = {
  rowNumber: number;
  sku: string;
  status: "new" | "existing" | "invalid";
  errors: string[];
  data: {
    sku: string;
    name?: string;
    physicalQty?: number;
    avgCost?: number;
  };
};

export default function ImportExportPage() {
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import-export", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao ler arquivo");
      setPreview(data.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao aplicar");
      setMessage(`${data.applied.length} linhas aplicadas com sucesso.`);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "1.25rem", maxWidth: 1100 }}>
      <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.35rem" }}>
        Importar / Exportar
      </h1>
      <p style={{ margin: "0 0 1.25rem", color: "var(--text-muted)" }}>
        Exporte o inventário para planilha ou importe com validação e prévia antes de
        confirmar.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <a className="btn btn-primary" href="/api/import-export">
          Exportar Excel
        </a>
        <label className="btn" style={{ cursor: "pointer" }}>
          Selecionar planilha
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
      </div>

      {busy && <div className="empty">Processando…</div>}
      {message && <div style={{ color: "var(--success)", marginBottom: 12 }}>{message}</div>}
      {error && <div style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {preview && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <strong>Prévia da importação</strong>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || preview.every((r) => r.status === "invalid")}
              onClick={() => void confirm()}
            >
              Confirmar importação
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>SKU</th>
                  <th>Status</th>
                  <th>Erros</th>
                  <th>Nome</th>
                  <th>Qtd</th>
                  <th>Custo</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.rowNumber} style={{ cursor: "default" }}>
                    <td className="num">{row.rowNumber}</td>
                    <td className="num">{row.sku}</td>
                    <td>
                      <span className="badge">
                        {row.status === "new"
                          ? "Novo"
                          : row.status === "existing"
                            ? "Existente"
                            : "Inválido"}
                      </span>
                    </td>
                    <td style={{ color: "var(--danger)", whiteSpace: "normal" }}>
                      {row.errors.join("; ") || "—"}
                    </td>
                    <td>{row.data.name || "—"}</td>
                    <td className="num">{row.data.physicalQty ?? "—"}</td>
                    <td className="num">{row.data.avgCost ?? "—"}</td>
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
