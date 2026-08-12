-- Tranche 3: Release Fields gap columns + CAB scope snapshot + PIR flag (VR-34).
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "releaseType" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "backupOwner" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "technicalLead" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "businessOwner" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "scopeDescription" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "changeDescription" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "justification" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "businessSignoff" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "opsSignoff" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "lastModifiedBy" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "goLiveDate" TIMESTAMP(3);
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "deployDate" TIMESTAMP(3);
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "postImplementationReviewCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "cabScopeSnapshot" JSONB;
