CREATE TABLE "BennyInquiry" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "alias" TEXT,
  "contact" TEXT,
  "service" TEXT NOT NULL,
  "budget" TEXT,
  "message" TEXT NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BennyInquiry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BennyInquiry_reference_key" ON "BennyInquiry"("reference");
CREATE INDEX "BennyInquiry_status_createdAt_idx" ON "BennyInquiry"("status", "createdAt");
