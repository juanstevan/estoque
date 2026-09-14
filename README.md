# Chaleur Inventory

Internal inventory and warehouse system for Chaleur Manufacturing Co.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- shadcn/ui + Tremor
- Prisma Postgres

## Run

Copy the **Prisma Postgres** connection string from Prisma Console → Connect (or Vercel → Storage → prisma-estoque) into `.env` as `DATABASE_URL`.

```bash
cd ~/repos/estoque
cp .env.example .env
# paste the postgres:// URL into .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open http://localhost:3000

**Login:** `admin` / `chaleur`

## QuickBooks (read-only)

Pipedream keeps OAuth. It POSTs invoices (and a one-shot item list) here. This app never writes to QuickBooks.

Set `QB_SYNC_SECRET` in `.env` and in Vercel. Pipedream:

```
POST https://YOUR-DOMAIN/api/quickbooks
Authorization: Bearer THE_SECRET
Content-Type: application/json

{ "action": "invoice", "invoice": { /* QuickBooks Invoice JSON */ } }
{ "action": "items", "items": [ /* Item objects or QueryResponse */ ] }
```

Matched invoice lines become Exit reservations (SKU, then `qb:{Item.Id}`, then name). Existing products are not overwritten on item import.

## Tabs

- **Storage** — product table, product card (Info/Log), quantity add/remove, reserved invoices
- **Imports** — Kanban (Pending / In Transit / Delayed), domestic vs international cards, archive table
- **Exit** — delivery Kanban, Notion-style invoice drawer, invoice table (drag onto Pending)

Spreadsheet import with supervisor approval is stubbed for a later board.
