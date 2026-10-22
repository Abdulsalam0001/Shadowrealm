# Shadowrealm store

Responsive storefront + Node.js/Express API + Neon PostgreSQL. Render can deploy this repo from the root using `render.yaml`. The storefront is `/` and the public homepage is Japan-inspired, and the product catalogue is available only after customer registration or login. The admin interface is `/admin` and uses username/password login with a signed, HTTP-only session cookie.

## Current scope

- Products and server-side USD price calculation for the active catalogue, returned only to authenticated customers.
- Order creation with a private order access token.
- Payment choices include BTC, ETH, USDT (ERC-20 and TRC-20), USDC (ERC-20 and Solana), SOL, LTC, XRP, DOGE, BNB (BEP-20), and TRX. Alternate networks appear only after an admin saves and enables a receiving address.
- Customer submits a transaction hash. BTC and ETH can be automatically verified when their verification configuration is available; alternate networks are explicitly held for manual admin review and are never auto-confirmed from a submitted hash.
- BTC checks use mempool.space transaction outputs and confirmation status. ETH checks use Ethereum JSON-RPC transaction + receipt and explicitly require chain ID 1 when `ETH_RPC_URL` is configured.
- Required confirmations default to 2 BTC and 12 ETH. Adjust only after evaluating your risk tolerance.
- Duplicate transaction hashes are rejected by a database unique constraint.
- Admin order queue and paid-order fulfilment/review endpoints protected by a signed, expiring HTTP-only session cookie.
- Manual fulfilment is the default. Optional automatic fulfilment requires an external provisioner webhook and products explicitly set to `AUTO`.

## Required deployment setup

1. Create a Neon PostgreSQL database and copy its TLS-enabled connection string into Render's `DATABASE_URL`.
2. Set `CUSTOMER_SESSION_SECRET` to a cryptographically random secret of at least 32 characters for customer sessions. Set `ADMIN_USERNAME` to your chosen admin username, `ADMIN_PASSWORD` to a long unique password, and `ADMIN_SESSION_SECRET` to a cryptographically random secret of at least 32 characters. Keep all three only in Render environment variables.
3. Optionally set `BTC_USD_RATE` and `ETH_USD_RATE` as numeric USD-per-coin rates. Otherwise the server requests a live Coinbase quote and falls back to CoinGecko. Stablecoin and altcoin rates use those live quote sources too.
4. Set `ETH_RPC_URL` to a reliable Ethereum mainnet RPC endpoint for automatic ETH verification. If it is absent, ETH invoices remain available but require manual review. Set `BTC_RECEIVING_ADDRESS` and `ETH_RECEIVING_ADDRESS` in Render to change the fixed BTC/ETH wallets; these are intentionally read-only in `/admin`.
5. Deploy with the included Render blueprint. The build command applies Prisma migrations.
6. Visit `/api/health` and confirm `crypto.BTC` and `crypto.ETH` are true before testing checkout.
7. In `/admin` → **Crypto payment wallets**, paste a receiving address for each desired non-BTC/ETH network and enable it. Wallet addresses are stored in Neon; do not enable a network until you have confirmed the address and network. Keep secrets only in Render environment variables; never add `.env` to Git.

## First database migration

The initial migration is included in `prisma/migrations`. Render runs `prisma migrate deploy` during deployment. For future schema changes, run `npx prisma migrate dev --name describe_change` locally and commit the generated migration. Do not rely on `db push` for production.

## API overview

- `GET /api/health`
- `POST /api/auth/register` — create an account with email and a password of at least 12 characters.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` — customer authentication.
- `GET /api/products` — requires an authenticated customer session.
- `GET /api/payment-methods` — returns payment methods that have a fixed or enabled receiving wallet.
- `POST /api/orders` — authenticated JSON: `{ "asset": "BTC", "items": [{ "sku": "rdppro", "quantity": 1 }] }`.
- `POST /api/orders/smtp` — authenticated SMTP order intake; guest checkout is disabled.
- `POST /api/orders/:id/transaction` — header `x-order-token`, JSON `{ "txHash": "..." }`
- `GET /api/orders/:id/status` — header `x-order-token`
- `GET /api/admin/products` — an authenticated admin session.
- `PATCH /api/admin/products/:sku` — an authenticated admin session; accepts `priceUsd`, `active`, `name`, `description`, and `fulfillmentMode` (`AUTO` or `MANUAL`).
- `GET /api/admin/payment-wallets` and `PUT /api/admin/payment-wallets/:asset` — manage non-BTC/ETH receiving wallets.
- `GET /api/admin/orders` — an authenticated admin session.
- `PATCH /api/admin/orders/:id/fulfill` — an authenticated admin session; only chain-verified paid orders may be fulfilled.
- `PATCH /api/admin/orders/:id/review` — an authenticated admin session

## Shared receiving addresses and payment matching

Because each asset uses one shared address, the buyer must submit the transaction hash. The backend independently verifies that the transaction exists, pays the exact configured address, has enough value, and has the required confirmations. Each quote has a small unique amount increment so customers can be instructed to send the exact quoted amount. This is not a substitute for displaying the quote carefully; do not reuse quotes or manually mark unverified orders as paid.

A transaction sent to the wrong chain/address, a failed ETH receipt, or an underpayment is moved to payment review. An unconfirmed transaction stays pending/confirming. If the explorer/RPC is unavailable, the backend leaves the current status unchanged; it does not manufacture confirmation. Alternate networks remain submitted until an admin checks the transaction on the correct explorer and uses the manual confirmation action.

## Fulfilment

All seeded products are `MANUAL`. Admin must review supplier fulfilment and mark an order fulfilled after delivery. To enable automation, change a product to `AUTO` in the database only after a real provisioner is configured. The provisioner must validate the HMAC signature in `x-shadowrealm-signature`, use `idempotency-key`, and return 2xx only when the delivery job has actually been accepted. In this first version, a 2xx changes status to `FULFILLMENT_PENDING`; admin completes the order after confirming delivery.

## Security / launch checklist

- Protect admin credentials; rotate the password and session secret if exposed. Admin sessions expire after 8 hours.
- Use a private repo or secret manager for sensitive business information.
- Add customer privacy/terms/refund pages and support contact before launch.
- Set real supplier prices and fulfilment policies; the current prices are demo seed values.
- Configure backups and monitoring for Neon/Render.
- Test on small amounts first. BTC and native ETH have automatic verifiers; the configured token and altcoin options use manual review until chain-specific automated verifiers are added. The receiving address must match the selected network exactly.
