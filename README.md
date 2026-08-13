# Estoque

Sistema interno de inventário e armazém (protótipo MVP).

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3`
- UI em português, usuário demo

## Como rodar (completo)

Use a branch `cursor/estoque-mvp-prototype-d6e2` (o app **não** está em `main`).

```bash
cd ~/repos/estoque
git fetch origin
git checkout cursor/estoque-mvp-prototype-d6e2
git pull origin cursor/estoque-mvp-prototype-d6e2

cp .env.example .env
npm install
npm run setup
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Pedido de exemplo na tela Armazém: `NF-1024`.

`npm run setup` aplica as migrations SQLite e popula os dados de demonstração.

## Scripts

| Script | Descrição |
|---|---|
| `npm run setup` | Cria o banco SQLite, aplica schema e seed |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:seed` | Popular dados de exemplo |
| `npm run db:migrate` | Aplicar migrations (`prisma migrate deploy`) |
