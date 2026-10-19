CREATE TYPE "OrderType" AS ENUM ('PRODUCT', 'MEMBERSHIP');

ALTER TABLE "Customer" ADD COLUMN "membershipPaidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "type" "OrderType" NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;

CREATE INDEX "Order_customerId_type_status_idx" ON "Order"("customerId", "type", "status");
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
