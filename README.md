# Chaleur Inventory

Internal inventory and warehouse system for Chaleur Manufacturing Co.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- shadcn/ui + Tremor
- SQLite via Prisma 7

## Run

```bash
cd ~/repos/estoque
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open http://localhost:3000

**Login:** `admin` / `chaleur`

## Tabs

- **Storage** — product table, product card (Info/Log), quantity add/remove, reserved invoices
- **Imports** — Kanban (Pending / In Transit / Delayed), domestic vs international cards, archive table
- **Exit** — delivery Kanban, Notion-style invoice drawer, invoice table (drag onto Pending)

Spreadsheet import with supervisor approval is stubbed for a later board.
