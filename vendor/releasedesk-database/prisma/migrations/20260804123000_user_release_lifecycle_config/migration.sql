-- Per-user configurable Release lifecycle graph.
-- organizationId is reserved for a future org-scoped cutover and is unused today.
-- This migration intentionally does not alter Release.status or approvalStatus data.

CREATE TABLE IF NOT EXISTS "UserReleaseLifecycleStatus" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL DEFAULT 'mainline',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserReleaseLifecycleStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserReleaseLifecycleTransition" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "fromStatusId" TEXT NOT NULL,
    "toStatusId" TEXT,
    "targetKey" TEXT NOT NULL,
    "isPreviousStatus" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enforcement" TEXT NOT NULL DEFAULT 'flexible',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserReleaseLifecycleTransition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserReleaseLifecycleTransition_fromStatusId_fkey"
      FOREIGN KEY ("fromStatusId") REFERENCES "UserReleaseLifecycleStatus"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserReleaseLifecycleTransition_toStatusId_fkey"
      FOREIGN KEY ("toStatusId") REFERENCES "UserReleaseLifecycleStatus"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "UserReleaseLifecycleGate" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "transitionId" TEXT NOT NULL,
    "gateType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enforcement" TEXT NOT NULL DEFAULT 'inherit',
    "params" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserReleaseLifecycleGate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserReleaseLifecycleGate_transitionId_fkey"
      FOREIGN KEY ("transitionId") REFERENCES "UserReleaseLifecycleTransition"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_clerkUserId_key_key"
  ON "UserReleaseLifecycleStatus"("clerkUserId", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_clerkUserId_label_key"
  ON "UserReleaseLifecycleStatus"("clerkUserId", "label");
CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_clerkUserId_enabled_sortOrder_idx"
  ON "UserReleaseLifecycleStatus"("clerkUserId", "enabled", "sortOrder");
CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleStatus_organizationId_idx"
  ON "UserReleaseLifecycleStatus"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleTransition_clerkUserId_fromStatusId_targetKey_key"
  ON "UserReleaseLifecycleTransition"("clerkUserId", "fromStatusId", "targetKey");
CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleTransition_clerkUserId_fromStatusId_enabled_idx"
  ON "UserReleaseLifecycleTransition"("clerkUserId", "fromStatusId", "enabled");
CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleTransition_organizationId_idx"
  ON "UserReleaseLifecycleTransition"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserReleaseLifecycleGate_transitionId_gateType_key"
  ON "UserReleaseLifecycleGate"("transitionId", "gateType");
CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleGate_clerkUserId_idx"
  ON "UserReleaseLifecycleGate"("clerkUserId");
CREATE INDEX IF NOT EXISTS "UserReleaseLifecycleGate_organizationId_idx"
  ON "UserReleaseLifecycleGate"("organizationId");
