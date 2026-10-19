CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'CONFIRMING', 'PAID', 'PAYMENT_REVIEW', 'FULFILLMENT_PENDING', 'FULFILLED');
CREATE TYPE "PaymentAsset" AS ENUM ('BTC', 'ETH');
CREATE TYPE "PaymentStatus" AS ENUM ('AWAITING_PAYMENT', 'SUBMITTED', 'CONFIRMING', 'PAID', 'REVIEW', 'FULFILLED');
CREATE TYPE "FulfillmentMode" AS ENUM ('MANUAL', 'AUTO');

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priceNgn" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerToken" TEXT NOT NULL,
  "totalNgn" INTEGER NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "fulfillmentNote" TEXT,
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productSku" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceNgn" INTEGER NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CryptoPayment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "asset" "PaymentAsset" NOT NULL,
  "address" TEXT NOT NULL,
  "expectedAtomic" TEXT NOT NULL,
  "expectedAmount" TEXT NOT NULL,
  "txHash" TEXT,
  "paidAtomic" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "confirmations" INTEGER NOT NULL DEFAULT 0,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_customerToken_key" ON "Order"("customerToken");
CREATE UNIQUE INDEX "CryptoPayment_orderId_key" ON "CryptoPayment"("orderId");
CREATE UNIQUE INDEX "CryptoPayment_txHash_key" ON "CryptoPayment"("txHash");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "CryptoPayment_status_idx" ON "CryptoPayment"("status");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
