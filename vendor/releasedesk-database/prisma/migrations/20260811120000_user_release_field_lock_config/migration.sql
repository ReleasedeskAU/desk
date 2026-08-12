-- Per-user Release field-lock matrix (live/latest config; clerkUserId-scoped).
CREATE TABLE IF NOT EXISTS "UserReleaseFieldLockConfig" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "fieldKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lockRuleRef" TEXT,
    "isConfigurable" BOOLEAN NOT NULL DEFAULT true,
    "statusRules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserReleaseFieldLockConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseFieldLockConfig_clerkUserId_fieldKey_key"
  ON "UserReleaseFieldLockConfig"("clerkUserId", "fieldKey");

CREATE INDEX IF NOT EXISTS "UserReleaseFieldLockConfig_clerkUserId_idx"
  ON "UserReleaseFieldLockConfig"("clerkUserId");

CREATE INDEX IF NOT EXISTS "UserReleaseFieldLockConfig_organizationId_idx"
  ON "UserReleaseFieldLockConfig"("organizationId");
