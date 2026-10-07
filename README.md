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

## QuickBooks

Same Intuit app as `~/Desktop/dash`: copy `client_id`, `client_secret`, `realm_id` and `redirect_uri` from `dash/config.json` into `.env` (and Vercel) as `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REALM_ID` and `QB_REDIRECT_URI`.

Then connect this app: Settings → API config → Connect QuickBooks, approve, and paste the address it lands on. The connection lives in the database and refreshes itself. Never copy dash's refresh token here: Intuit rotates it and the old one stops working, so two apps sharing one token break each other.

Saving a product pushes its name (as `ID - name`) and SKU to the linked QuickBooks item. Inventory qty is owned here after the first item pull.

```bash
npm run qb:sync
```

That pulls active Inventory items and every invoice since 2000, plus deleted invoices from the last 28 days. Unchanged invoices are skipped, so only the first run is long. New invoices stay in the Delivery table until someone adds them to the board.

Sync now in Delivery runs the same job. Do not import from every open browser.

Scheduled sync, once this app is deployed on Vercel with `CRON_SECRET` set:

- Cron path: `GET /api/quickbooks/cron`
- Header: `Authorization: Bearer $CRON_SECRET`
- Schedule in `vercel.json`: 11:30 UTC daily
- Off Vercel, call that URL from your own scheduler

Invoice webhook, after Intuit is configured:

- Endpoint: `https://<host>/api/quickbooks/webhook`
- Env: `QB_WEBHOOK_VERIFIER` = the Intuit verifier token
- Until that variable is set, the webhook route stays off and the cron or Sync now is the sync

Pipedream can still POST:

```
POST https://YOUR-DOMAIN/api/quickbooks
Authorization: Bearer THE_SECRET
Content-Type: application/json

{ "action": "sync" }
{ "action": "invoice", "invoice": { /* QuickBooks Invoice JSON */ } }
{ "action": "items", "items": [ /* Item objects or QueryResponse */ ] }
```

Matched invoice lines are stored without a reservation. Adding the invoice to Delivery reserves stock. Existing products are not overwritten on item import.

## Tabs

- **Storage** — product table, product card (Info/Log), quantity add/remove, reserved invoices
- **Imports** — Kanban (Pending / In Transit / Delayed), domestic vs international cards, archive table
- **Delivery** — fulfillment board, invoice dialog, preparation scans, proof, customer tracking link

Spreadsheet import with supervisor approval is stubbed for a later board.
