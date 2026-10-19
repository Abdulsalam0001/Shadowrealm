# Shadowrealm store

Responsive storefront + Node.js/Express API + Neon PostgreSQL. Render can deploy this repo from the root using `render.yaml`.

## Current scope

- Products and server-side price calculation for the eight demo SKUs shown on the storefront.
- Order creation with a private order access token.
- Direct **Bitcoin mainnet** and **Ethereum mainnet native ETH** payments to the configured receiving addresses.
- Customer submits a transaction hash; the server verifies live chain data instead of trusting the submitted hash.
- BTC checks use mempool.space transaction outputs and confirmation status. ETH checks use Ethereum JSON-RPC transaction + receipt and explicitly require chain ID 1.
- Required confirmations default to 2 BTC and 12 ETH. Adjust only after evaluating your risk tolerance.
- Duplicate transaction hashes are rejected by a database unique constraint.
- Admin order queue and paid-order fulfilment/review endpoints protected by `x-admin-key`.
- Manual fulfilment is the default. Optional automatic fulfilment requires an external provisioner webhook and products explicitly set to `AUTO`.

## Required deployment setup

1. Create a Neon PostgreSQL database and copy its TLS-enabled connection string into Render's `DATABASE_URL`.
2. Set `ADMIN_API_KEY` to a strong random secret.
3. Set `BTC_NGN_RATE` and `ETH_NGN_RATE` to trusted NGN-per-coin rates. The rates are configuration values, not live market data. Update them regularly or integrate a trusted pricing feed before production.
4. Set `ETH_RPC_URL` to a reliable Ethereum mainnet RPC endpoint. Do not use a testnet.
5. Deploy with the included Render blueprint. The build command applies Prisma migrations.
6. Visit `/api/health` and confirm `crypto.BTC` and `crypto.ETH` are true before testing checkout.
7. Keep secrets only in Render environment variables; never add `.env` to Git.

## First database migration

The initial migration is included in `prisma/migrations`. Render runs `prisma migrate deploy` during deployment. For future schema changes, run `npx prisma migrate dev --name describe_change` locally and commit the generated migration. Do not rely on `db push` for production.

## API overview

- `GET /api/health`
- `GET /api/products`
- `POST /api/orders` — JSON: `{ "email": "buyer@example.com", "asset": "BTC", "items": [{ "sku": "toolkit", "quantity": 1 }] }`
- `POST /api/orders/:id/transaction` — header `x-order-token`, JSON `{ "txHash": "..." }`
- `GET /api/orders/:id/status` — header `x-order-token`
- `GET /api/admin/products` — header `x-admin-key`\n- `PATCH /api/admin/products/:sku` — header `x-admin-key`; accepts `priceNgn`, `active`, `name`, `description`, and `fulfillmentMode` (`AUTO` or `MANUAL`)\n- `GET /api/admin/orders` — header `x-admin-key`
- `PATCH /api/admin/orders/:id/fulfill` — header `x-admin-key`; only chain-verified paid orders may be fulfilled.
- `PATCH /api/admin/orders/:id/review` — header `x-admin-key`

## Shared receiving addresses and payment matching

Because each asset uses one shared address, the buyer must submit the transaction hash. The backend independently verifies that the transaction exists, pays the exact configured address, has enough value, and has the required confirmations. Each quote has a small unique amount increment so customers can be instructed to send the exact quoted amount. This is not a substitute for displaying the quote carefully; do not reuse quotes or manually mark unverified orders as paid.

A transaction sent to the wrong chain/address, a failed ETH receipt, or an underpayment is moved to payment review. An unconfirmed transaction stays pending/confirming. If the explorer/RPC is unavailable, the backend leaves the current status unchanged; it does not manufacture confirmation.

## Fulfilment

All seeded products are `MANUAL`. Admin must review supplier fulfilment and mark an order fulfilled after delivery. To enable automation, change a product to `AUTO` in the database only after a real provisioner is configured. The provisioner must validate the HMAC signature in `x-shadowrealm-signature`, use `idempotency-key`, and return 2xx only when the delivery job has actually been accepted. In this first version, a 2xx changes status to `FULFILLMENT_PENDING`; admin completes the order after confirming delivery.

## Security / launch checklist

- Protect the admin API key and rotate it if exposed.
- Use a private repo or secret manager for sensitive business information.
- Add customer privacy/terms/refund pages and support contact before launch.
- Set real supplier prices and fulfilment policies; the current prices are demo seed values.
- Configure backups and monitoring for Neon/Render.
- Test on small amounts first. This version verifies native BTC and native ETH only; ERC-20 tokens and other networks are not supported.
