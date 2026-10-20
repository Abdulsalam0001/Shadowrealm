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
