# Benny the Dealer

Benny the Dealer is a static storefront served by the existing Shadowrealm Express application. It lives in `benny-the-dealer/public` and is mounted at `/benny/` by the existing `server.js`.

## Deployment

No additional Render service or database is needed. Deploy the existing Shadowrealm application from this branch using its existing Render service and existing environment variables. The existing `DATABASE_URL`, customer/admin authentication, crypto-payment verification, and order fulfilment code remain unchanged.

The storefront is available on the origin at `/benny/`. Cloudflare can map requests for `bennythedealer.org/` to the origin path `/benny/`, while forwarding `/api/*` to the existing Shadowrealm API paths.

## Files

- `public/index.html` — Benny storefront markup.
- `public/styles.css` — responsive charcoal, plum, burgundy and gold visual system.
- `public/app.js` — navigation and inquiry form behavior.

## Inquiry form note

The frontend currently posts to `/api/inquiries`, which is not part of the existing Shadowrealm API. The static site can be served without changing the backend, but inquiry submission needs to be explicitly connected to an approved existing endpoint before being advertised as operational. This setup does not add tables, migrate the database, create a second service, or alter payment handling.

Keep all secrets in the existing Render environment. Do not commit `.env` files or database connection strings.


## Benny × Shadowrealm positioning

The storefront now presents Benny as a curated gateway to the Shadowrealm ecosystem, with messaging for authorised red-team exercises, penetration testing, security labs, and legitimate research. The outbound link includes `?ref=benny` as a referral marker; this is not proof of affiliate attribution, conversion tracking, or commission accounting. Those require an analytics/affiliate endpoint to be implemented and verified separately.

## Cloudflare hostname routing

A ready-to-paste Worker script is included at `cloudflare-worker.js`. It uses the same existing Render origin and routes by the incoming hostname:

- `bennythedealer.org/*` and `www.bennythedealer.org/*`: map non-API paths to the existing `/benny/` mount.
- `shop.bennythedealer.org/*`: preserve the original Shadowrealm path and query string, including `/api/*`.
- `/api/*` on Benny's host: stays on the existing Shadowrealm API path.

### Dashboard steps

1. In Cloudflare, open **Workers & Pages** and edit the existing Worker that currently uses `ORIGIN = "https://shadowrealm-yj6v.onrender.com"`. Replace its script with the contents of `cloudflare-worker.js`; do not create a second Worker unless your existing setup cannot accept another route.
2. Under the Worker’s **Triggers / Routes**, attach `bennythedealer.org/*`, `www.bennythedealer.org/*`, and `shop.bennythedealer.org/*` to that same Worker.
3. In **DNS**, add a `shop` CNAME record targeting `shadowrealm-yj6v.onrender.com` and enable the orange-cloud proxy. Keep existing apex and `www` DNS records unchanged.
4. Deploy the existing Shadowrealm Render service from the `benny-the-dealer-build` branch so the `/benny/` mount is available. Do not change its database or payment environment variables.
5. Verify `https://shop.bennythedealer.org/`, `https://shop.bennythedealer.org/api/health`, and `https://bennythedealer.org/`. The health endpoint should return JSON; do not test payment by submitting a fake transaction.

Cloudflare configuration is managed in the dashboard and is not changed by a Git commit. The script in this repository is a deployable template, not confirmation that DNS or Worker routes have already been published. The Benny inquiry form posts to `/api/inquiries`. Requests are stored in the `BennyInquiry` table on the existing Neon database and can be reviewed by an authenticated admin at `/api/admin/benny-inquiries`.

## Inquiry migration and privacy

This branch adds the `BennyInquiry` table through `prisma/migrations/20261020150000_benny_inquiries/migration.sql`. Before running the updated application, apply pending migrations to the **existing** Neon database with `npm run db:deploy` (after installing dependencies / generating Prisma Client). Do not create another database. If the Render build command currently does not run migrations, update the existing service's deployment command to run `npm run db:deploy` before starting the app, or apply the migration as a controlled release step.

The inquiry form accepts an optional alias and optional reply channel. Without a reply channel, the request can be reviewed but cannot be answered directly. The admin-only review endpoint is protected by the existing admin session. Do not collect credentials, private keys, identity documents, or production secrets in the form.
