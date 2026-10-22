-- Apply requested storefront prices to the current database.
UPDATE "Product" SET "priceUsdCents" = 1300, "updatedAt" = NOW() WHERE "sku" = 'cpanel';
