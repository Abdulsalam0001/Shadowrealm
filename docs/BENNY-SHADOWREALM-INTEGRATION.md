# Benny × Shadowrealm Integration Runbook

**Status:** Cloudflare route for `shop.bennythedealer.org/*` has been attached by the operator and the shop subdomain was reported to be working. The latest code deployment, database migration, inquiry flow, and full regression checks must still be verified separately.

This runbook documents the intended architecture, setup, smoke tests, troubleshooting, and production-safety rules. It does not claim that a dashboard setting or deployment has been verified unless explicitly stated.

## 1. Architecture and boundaries

- **Benny public site:** `https://bennythedealer.org/`
- **Optional www host:** `https://www.bennythedealer.org/`
- **Shadowrealm shop host:** `https://shop.bennythedealer.org/`
- **Existing Render origin:** `https://shadowrealm-yj6v.onrender.com`
- **Worker source in this repository:** `benny-the-dealer/cloudflare-worker.js`
- **Benny frontend:** `benny-the-dealer/public/`
- **Express server:** existing root `server.js`
- **Existing database:** existing Neon database configured through the current Render environment; do not create a replacement database.

Expected request routing:

| Incoming host/path | Expected upstream path |
|---|---|
| `bennythedealer.org/` | `/benny/` |
| `bennythedealer.org/<path>` (non-API) | `/benny/<path>` |
| `bennythedealer.org/api/*` | same `/api/*` path |
| `shop.bennythedealer.org/*` | same path and query on the existing Render origin |

The Worker uses hostname-based routing. Keep the Render origin fixed in the Worker and do not construct an upstream host from user-controlled input.

## 2. Current reported state

- The operator reported that the shop subdomain began working after attaching the Worker route to `shop.bennythedealer.org/*`.
- The Worker code is maintained on branch `benny-the-dealer-build`; the feature PR remains separate from `main` unless explicitly merged by the repository owner.
- The Cloudflare dashboard is external to GitHub. A repository commit does not publish DNS records or Worker routes.
- The operator should independently verify whether the currently deployed Render revision includes the Benny code and whether the database migration has been applied.

## 3. Cloudflare configuration

### Worker route

In Cloudflare Dashboard, open **Workers & Pages**, select the Worker that contains the routing logic in `benny-the-dealer/cloudflare-worker.js`, and check its **Triggers / Routes**.

Expected routes, if all three hosts are in use:

- `bennythedealer.org/*`
- `www.bennythedealer.org/*`
- `shop.bennythedealer.org/*`

The shop route must be attached to the Worker. Confirm the Worker code is deployed after edits; saving a file in GitHub alone does not deploy the Worker.

### DNS

For route-based Workers, the hostname needs a Cloudflare-proxied DNS record so the Worker route can receive traffic. For `shop`, a typical record is:

- Type: `CNAME`
- Name: `shop`
- Target: `shadowrealm-yj6v.onrender.com`
- Proxy: **Proxied** (orange cloud)

Use Cloudflare's recommended configuration if the zone is instead using a Worker Custom Domain, which can manage DNS differently. Remove any accidental placeholder A record such as `192.0.2.1` if it is still present. Do not alter the apex or `www` records without checking their existing purpose first.

### Why Error 522 may appear

A 522 indicates Cloudflare did not receive a timely response from the configured origin. For this integration, check in order:

1. The exact hostname is routed to the intended Worker.
2. The Worker has been deployed and includes the latest hostname routing code.
3. The `shop` DNS record is valid and proxied for route-based Workers.
4. The Worker forwards to `https://shadowrealm-yj6v.onrender.com` and preserves the incoming path/query for the shop host.
5. The existing Render origin is responding.

Do not change Neon or payment configuration merely because the shop hostname returns 522.

## 4. Benny site and visual direction

The Benny page is a static site mounted by the existing Express app at `/benny/`. Its intended visual language is low-profile black, crimson, and violet, with a more anonymous and direct operator-focused tone rather than a warm, personality-led seller presentation. Copy should remain focused on lawful, authorized security work, research, testing, and legitimate infrastructure.

The Shadowrealm call-to-action points to:

`https://shop.bennythedealer.org/?ref=benny`

The `ref=benny` query parameter is only a referral marker. It does not, by itself, provide attribution analytics, conversion reporting, or affiliate commission accounting.

## 5. Inquiry form and database

The Benny inquiry form submits to `POST /api/inquiries`. The feature adds the Prisma model `BennyInquiry` and migration:

`prisma/migrations/20261020150000_benny_inquiries/migration.sql`

The model records a reference, optional alias/contact, requested service, optional budget, message, consent timestamp, status, optional admin note, and timestamps. The request endpoint is rate-limited and validates required fields. A honeypot field is intended to reduce automated spam.

Authenticated admin review endpoint:

`GET /api/admin/benny-inquiries`

The endpoint must remain behind the existing admin authentication middleware. Do not expose inquiries publicly.

### Migration release step

The root `package.json` defines:

- `npm run db:deploy` → `prisma migrate deploy`
- `npm run start` → `node server.js`
- `postinstall` → `prisma generate`

Before enabling the new inquiry endpoint in a deployment, apply the migration to the **existing** Neon database through the normal controlled release process. Verify the target Render service and its `DATABASE_URL` before running migrations. Never create a new database for this feature and never paste database credentials into GitHub issues or documentation.

If the existing Render build/release process does not already run migrations, run `npm run db:deploy` as a controlled migration step before starting the application. Avoid blindly changing production deployment commands without reviewing the current setup.

Privacy guidance:
- Alias and reply channel are optional.
- Without a reply channel, the request may be reviewable but cannot be answered directly.
- Do not request or store passwords, private keys, seed phrases, identity documents, or production secrets in the inquiry form.
- Keep environment secrets in Render's environment settings; never commit `.env` files.

## 6. Smoke-test checklist

Run after Worker/DNS changes and again after a Render release. Use a harmless inquiry and do not submit fake crypto payments.

- [ ] `https://bennythedealer.org/` loads over HTTPS.
- [ ] `https://shop.bennythedealer.org/` loads the Shadowrealm storefront over HTTPS.
- [ ] The Benny Shadowrealm button opens `shop.bennythedealer.org` and retains `?ref=benny`.
- [ ] Refreshing a nested shop route works; the Worker preserves its path and query.
- [ ] `https://shop.bennythedealer.org/api/health` returns the application's expected health response, if that endpoint exists in the deployed version.
- [ ] Login and logout behave as expected on the shop host.
- [ ] Product/catalogue pages and normal navigation work.
- [ ] Existing payment verification and order flows are unchanged; only test with approved safe test procedures.
- [ ] A harmless inquiry passes client validation and returns a useful success/error message.
- [ ] An inquiry is stored in the existing Neon database after migration.
- [ ] An authenticated admin can view inquiries; an unauthenticated request to the admin endpoint is rejected.
- [ ] Existing Shadowrealm production behaviour remains healthy.
- [ ] No secrets or environment files were committed.

Mark a check complete only after performing the test. A successful homepage load does not prove that the inquiry database migration or every API flow works.

## 7. Troubleshooting map

| Symptom | First checks |
|---|---|
| Shop returns 522 | Worker route, proxied DNS, Worker deployment, upstream origin health |
| Shop returns 404 “Unknown host” | Worker code's host allowlist and exact hostname |
| Benny homepage shows Shadowrealm instead of Benny | Apex/WWW route and Worker mapping of non-API paths to `/benny/` |
| Benny form reports network/server error | Deployed Render revision, `POST /api/inquiries`, server logs, rate limit |
| Inquiry endpoint reports a missing table | Confirm migration status and correct existing `DATABASE_URL`; apply migration through controlled release |
| Admin inquiry endpoint returns 401/403 | Verify an authenticated admin session and existing admin middleware; do not remove authorization |
| Shop homepage works but nested pages fail | Verify Worker preserves incoming path and query string |
| Existing payments/login fail after release | Stop additional changes, inspect Render logs and recent deployment, preserve payment/auth configuration, and roll back through the existing release procedure if needed |

## 8. Production-safety rules

1. Keep this work on `benny-the-dealer-build` until changes are reviewed and the owner explicitly authorizes merging.
2. Reuse the existing Render service and Neon database; do not create duplicates.
3. Do not change existing crypto-payment verification, authentication, order fulfilment, or secrets as part of the domain-routing fix.
4. Treat Cloudflare dashboard configuration and GitHub code as separate deployment surfaces; verify both.
5. Record the deployed Git commit, migration status, and smoke-test results before declaring the integration production-ready.
6. Never claim a route, deployment, migration, or test is complete without direct confirmation.
