-- Additive System Mapping redesign tables.
-- Existing SystemMappingGroup/SystemMappingEdge and IntegrationFlow data are unchanged.

CREATE TABLE IF NOT EXISTS "SystemSharedEnvironment" (
    "id" TEXT NOT NULL,
    "environmentCode" TEXT NOT NULL,
    "environmentType" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "capacity" TEXT NOT NULL,
    "bookingRequirement" TEXT NOT NULL,
    "conflictRisk" TEXT NOT NULL,
    "sourceOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemSharedEnvironment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SystemCriticalPath" (
    "id" TEXT NOT NULL,
    "pathCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "upstreamSystems" TEXT NOT NULL,
    "downstreamSystems" TEXT NOT NULL,
    "coordinationRequirement" TEXT NOT NULL,
    "blackoutWindows" TEXT NOT NULL,
    "releaseManagerNotes" TEXT NOT NULL,
    "sourceOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemCriticalPath_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SystemReleaseManagerNote" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemReleaseManagerNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemSharedEnvironment_environmentCode_key"
    ON "SystemSharedEnvironment"("environmentCode");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemSharedEnvironment_sourceOrder_key"
    ON "SystemSharedEnvironment"("sourceOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemCriticalPath_pathCode_key"
    ON "SystemCriticalPath"("pathCode");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemCriticalPath_sourceOrder_key"
    ON "SystemCriticalPath"("sourceOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemReleaseManagerNote_sourceOrder_key"
    ON "SystemReleaseManagerNote"("sourceOrder");
