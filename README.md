# Chaleur Inventory

Internal inventory and warehouse system for Chaleur Manufacturing Co.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- shadcn/ui
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

This app never writes to QuickBooks. Inventory qty is owned here after the first item pull.

Same Intuit app as `~/Desktop/dash`: copy `client_id`, `client_secret`, `realm_id` from `dash/config.json` and `refresh_token` from `dash/data/retail/quickbooks_token.json` into `.env`. For local `npm run qb:sync` you can also set `QB_TOKEN_PATH` to that JSON file so refresh-token rotation stays in sync with dash.

```bash
npm run qb:sync
```

That pulls active Inventory items (SKU, name, opening QtyOnHand) and invoices from the last 7 days. Pipedream can still POST:

```
POST https://YOUR-DOMAIN/api/quickbooks
Authorization: Bearer THE_SECRET
Content-Type: application/json

{ "action": "sync" }
{ "action": "invoice", "invoice": { /* QuickBooks Invoice JSON */ } }
{ "action": "items", "items": [ /* Item objects or QueryResponse */ ] }
```

Matched invoice lines become Exit reservations (SKU, then `qb:{Item.Id}`, then name). Existing products are not overwritten on item import.

## Tabs

- **Storage** — product table, product card (Info/Log), quantity add/remove, reserved invoices
- **Imports** — Kanban (Pending / In Transit / Delayed), domestic vs international cards, archive table
- **Exit** — delivery Kanban, Notion-style invoice drawer, invoice table (drag onto Pending)

Spreadsheet import with supervisor approval is stubbed for a later board.
