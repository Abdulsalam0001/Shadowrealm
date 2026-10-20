-- Switch customer-facing catalogue and checkout totals to USD cents.
-- Keep legacy NGN columns for compatibility with historical orders.
ALTER TABLE "Product" ADD COLUMN "priceUsdCents" INTEGER NOT NULL DEFAULT 500;
UPDATE "Product" SET "priceUsdCents" = CASE "sku"
  WHEN 'toolkit' THEN 850
  WHEN 'rdp' THEN 1200
  WHEN 'cpanel' THEN 1800
  WHEN 'smtp' THEN 950
  WHEN 'automation' THEN 600
  WHEN 'rdppro' THEN 2800
  WHEN 'cpanelbiz' THEN 4200
  WHEN 'smtpgrowth' THEN 2400
  ELSE 500
END;
ALTER TABLE "Order" ADD COLUMN "totalUsdCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "unitPriceUsdCents" INTEGER NOT NULL DEFAULT 0;
