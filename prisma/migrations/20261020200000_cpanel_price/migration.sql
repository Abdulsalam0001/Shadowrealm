-- Apply the requested cPanel price to existing products without overwriting other admin-managed prices.
UPDATE "Product" SET "priceUsdCents" = 1300, "updatedAt" = NOW() WHERE "sku" = 'cpanel';
