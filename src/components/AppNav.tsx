"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_USER } from "@/lib/user";

const links = [
  { href: "/", label: "Estoque" },
  { href: "/importacoes", label: "Importações" },
  { href: "/importar-exportar", label: "Importar / Exportar" },
  { href: "/armazem", label: "Armazém" },
  { href: "/integracoes/quickbooks", label: "QuickBooks" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.65rem 1.25rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <Link
          href="/"
          style={{
            fontWeight: 700,
            fontSize: "1.05rem",
            color: "var(--accent)",
            textDecoration: "none",
            letterSpacing: "-0.02em",
          }}
        >
          Estoque
        </Link>
        <nav style={{ display: "flex", gap: "0.25rem" }}>
          {links.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: "0.4rem 0.7rem",
                  borderRadius: 4,
                  textDecoration: "none",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  background: active ? "#e8eef6" : "transparent",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
        {DEMO_USER.name}
      </div>
    </header>
  );
}
