-- Copilot Phase 1 Step 1 (P1-S1): Service graph + append-only ReleaseEvent foundation
-- organizationId is optional/unenforced on all four tables (EnvBooking pattern).

CREATE TABLE IF NOT EXISTS "Service" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT,
    "ownerTeam" TEXT,
    "criticality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Service_organizationId_name_key"
  ON "Service"("organizationId", "name");

CREATE TABLE IF NOT EXISTS "ServiceDependency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "sourceServiceId" TEXT NOT NULL,
    "targetServiceId" TEXT NOT NULL,
    "versionConstraint" TEXT,
    "criticality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceDependency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceDependency_sourceServiceId_targetServiceId_key"
  ON "ServiceDependency"("sourceServiceId", "targetServiceId");

CREATE TABLE IF NOT EXISTS "DeploymentBlocker" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "blockingReleaseId" TEXT NOT NULL,
    "blockedReleaseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "estimatedUnblockAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DeploymentBlocker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeploymentBlocker_blockingReleaseId_idx"
  ON "DeploymentBlocker"("blockingReleaseId");

CREATE INDEX IF NOT EXISTS "DeploymentBlocker_blockedReleaseId_idx"
  ON "DeploymentBlocker"("blockedReleaseId");

CREATE INDEX IF NOT EXISTS "DeploymentBlocker_status_idx"
  ON "DeploymentBlocker"("status");

CREATE TABLE IF NOT EXISTS "ReleaseEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "releaseId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "hash" TEXT,
    "knuctTxRef" TEXT,
    "anchoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReleaseEvent_organizationId_releaseId_createdAt_idx"
  ON "ReleaseEvent"("organizationId", "releaseId", "createdAt");

CREATE INDEX IF NOT EXISTS "ReleaseEvent_releaseId_createdAt_idx"
  ON "ReleaseEvent"("releaseId", "createdAt");
