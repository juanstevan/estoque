"use client";

import { useEffect, useState } from "react";

type QbEvent = {
  id: string;
  eventType: string;
  externalId: string | null;
  payload: string;
  processed: boolean;
  notes: string | null;
  createdAt: string;
};

export default function QuickBooksPage() {
  const [flow, setFlow] = useState<{ title: string; steps: string[] } | null>(
    null,
  );
  const [events, setEvents] = useState<QbEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const sample = `{
  "id": "qb-inv-2001",
  "docNumber": "NF-2001",
  "customerName": "Loja Parceira",
  "txnDate": "2026-04-01",
  "lines": [
    { "sku": "CAB-HDMI-2M", "quantity": 3 },
    { "sku": "FON-12V-5A", "quantity": 1 }
  ]
}`;

  async function load() {
    const res = await fetch("/api/quickbooks");
    const data = await res.json();
    setFlow(data.flow);
    setEvents(data.events);
  }

  useEffect(() => {
    void load();
  }, []);

  async function ingestSample() {
    setMessage(null);
    const res = await fetch("/api/quickbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ingest",
        payload: JSON.parse(sample),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setMessage("Evento armazenado (stub). Processe para reservar estoque.");
    void load();
  }

  async function processEvent(id: string) {
    setMessage(null);
    const res = await fetch("/api/quickbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process", eventId: id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error);
      return;
    }
    setMessage(
      `Pedido ${data.order.externalRef} criado/atualizado com reserva (estoque físico intacto).`,
    );
    void load();
  }

  return (
    <div style={{ padding: "1.25rem", maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.35rem" }}>
        Integração QuickBooks
      </h1>
      <p style={{ margin: "0 0 1rem", color: "var(--text-muted)" }}>
        Arquitetura stub — sem OAuth ao vivo. Faturas geram reservas; a saída física
        ocorre só na separação/retirada no armazém.
      </p>

      {flow && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "1rem",
            background: "#fff",
            marginBottom: "1.25rem",
          }}
        >
          <strong>{flow.title}</strong>
          <ol style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
            {flow.steps.map((s) => (
              <li key={s} style={{ marginBottom: 4 }}>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.65rem", marginBottom: "1rem" }}>
        <button className="btn btn-primary" type="button" onClick={() => void ingestSample()}>
          Ingerir fatura de exemplo
        </button>
      </div>

      {message && (
        <div style={{ marginBottom: 12, color: "var(--accent)" }}>{message}</div>
      )}

      <h2 style={{ fontSize: "1.05rem", marginBottom: 8 }}>Eventos sincronizados</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Externo</th>
              <th>Tipo</th>
              <th>Processado</th>
              <th>Notas</th>
              <th>Payload</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} style={{ cursor: "default" }}>
                <td className="num">{ev.externalId || "—"}</td>
                <td>{ev.eventType}</td>
                <td>{ev.processed ? "Sim" : "Não"}</td>
                <td>{ev.notes || "—"}</td>
                <td style={{ maxWidth: 280, whiteSpace: "normal", fontSize: 12 }}>
                  <code>{ev.payload.slice(0, 120)}…</code>
                </td>
                <td>
                  {!ev.processed && (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => void processEvent(ev.id)}
                    >
                      Processar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: "1.05rem", margin: "1.25rem 0 0.5rem" }}>
        Exemplo de payload
      </h2>
      <pre
        style={{
          background: "#1a1d23",
          color: "#e8ecf1",
          padding: "1rem",
          borderRadius: 6,
          overflow: "auto",
          fontSize: 12,
        }}
      >
        {sample}
      </pre>
    </div>
  );
}
