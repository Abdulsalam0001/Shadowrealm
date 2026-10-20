# Benny the Dealer

A separate brand and inquiry storefront inside the Shadowrealm repository. It uses its own folder, Node/Express entry point, frontend assets, and a dedicated Neon table prefix. It does not change Shadowrealm's existing storefront, routes, Prisma schema, crypto-payment verification, or database tables.

## Brand direction

Benny is a fictional illustrated brand avatar — dark shades, gold earrings, layered chains, and rings — with a Tokyo-night palette of charcoal, plum, burgundy, and gold. The offer is legitimate digital infrastructure and business services: managed servers, web hosting, business email, media placement, and digital toolkits.

## Run locally

Requires Node.js 20+.

```bash
cd benny-the-dealer
npm install
cp .env.example .env
# Add DATABASE_URL to .env for inquiry storage
npm start
```

Open http://localhost:3030. Without `DATABASE_URL`, the static page still starts, but the inquiry API returns 503 until a database connection is configured.

## Deploy as a separate Render service

Create a new **Web Service** from the existing `Abdulsalam0001/Shadowrealm` repository.

- **Branch:** `benny-the-dealer-build` while reviewing this implementation; switch to `main` after merging the folder.
- **Root Directory:** `benny-the-dealer`
- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health check path:** `/api/health`
- **Environment:** `NODE_ENV=production`, and `DATABASE_URL` set in the Render dashboard to the existing Neon connection string.

Never commit a real connection string. Use Render environment variables only.

## Neon integration and isolation

The app uses the existing Neon database connection via `DATABASE_URL`, but writes only to `benny_dealer_inquiries`. The table is created with `CREATE TABLE IF NOT EXISTS`; no existing Shadowrealm table is altered, dropped, or migrated. Keep the two services on the same Neon project only if that is intentional; for production, consider a dedicated Neon role with the minimum required permissions on the Benny table.

## Inquiry API

- `GET /api/health` — service/database readiness.
- `POST /api/inquiries` — validates and stores a customer inquiry, protected by rate limiting and a honeypot field.

The form does not create orders, take payment, promise delivery, or mark anything as paid. It is an inquiry workflow. Add a separately reviewed, server-side checkout/fulfilment flow only when product suppliers, terms, refunds, and fulfilment policies are ready.

## Security notes

- Configure TLS through Render.
- Keep `.env`, credentials, and connection strings out of Git.
- Rotate any database password that has previously been committed.
- The inquiry endpoint has size limits, input validation, parameterized SQL, and rate limiting.
- Add privacy, terms, refund, and support details before a public launch.
