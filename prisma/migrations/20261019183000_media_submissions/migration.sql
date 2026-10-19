CREATE TYPE "MediaSubmissionStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED');

CREATE TABLE "MediaSubmission" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "journalistName" TEXT NOT NULL,
  "journalistEmail" TEXT NOT NULL,
  "journalistPhone" TEXT,
  "role" TEXT NOT NULL,
  "publicationName" TEXT NOT NULL,
  "articleUrl" TEXT NOT NULL,
  "package" TEXT NOT NULL,
  "timing" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "budget" TEXT,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "status" "MediaSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaSubmission_reference_key" ON "MediaSubmission"("reference");
CREATE INDEX "MediaSubmission_status_createdAt_idx" ON "MediaSubmission"("status", "createdAt");
CREATE INDEX "MediaSubmission_journalistEmail_createdAt_idx" ON "MediaSubmission"("journalistEmail", "createdAt");
