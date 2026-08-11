# Estoque

Sistema interno de inventário e armazém (protótipo MVP).

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- SQLite via Prisma 7 + `@prisma/adapter-better-sqlite3`
- UI em português, usuário demo

## Como rodar

```bash
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Funcionalidades do protótipo

- Cadastro e listagem de produtos
- Tabela de estoque com busca, ordenação, colunas e paginação
- Recebimento em lote com rateio de custos adicionais (custo desembarcado)
- Custo médio ponderado + histórico de custos
- Movimentações imutáveis (ajustes geram novas transações)
- Rascunhos de importação (não afetam estoque até o recebimento)
- Importar / exportar planilha
- Tela de armazém (separação por scan / teclado)
- Stub de integração QuickBooks (reserva sem baixar físico)

## Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:seed` | Popular dados de exemplo |
| `npm run db:migrate` | Rodar migrations |
