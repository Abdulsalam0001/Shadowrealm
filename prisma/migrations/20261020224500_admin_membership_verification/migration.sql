ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "membershipVerifiedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "membershipAdminNote" TEXT;
