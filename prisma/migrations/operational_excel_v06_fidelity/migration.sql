-- V0.6 operational workbook fidelity: source order and previously unpersisted sheets.

ALTER TABLE "EnvironmentVersion" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "EnvironmentVersion" ADD COLUMN IF NOT EXISTS "appCode" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "dependencyCode" TEXT;
ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "EnvBooking" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "SystemMappingEdge" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "Risk" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "Drift" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "MonitoringAlert" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "ApplicationStatus" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "PlannedMaintenance" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "IntegrationFlow" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "Approval" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "LeaveRecord" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "sourceOrder" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "ReleaseDependency_dependencyCode_key"
  ON "ReleaseDependency"("dependencyCode");

CREATE TABLE IF NOT EXISTS "EnvironmentConflict" (
  "id" TEXT NOT NULL,
  "conflictCode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "assignedTo" TEXT,
  "release1Code" TEXT NOT NULL,
  "release2Code" TEXT NOT NULL,
  "applicationName" TEXT NOT NULL,
  "departmentName" TEXT NOT NULL,
  "conflictingEnvironment" TEXT NOT NULL,
  "environmentConflictType" TEXT NOT NULL,
  "notes" TEXT,
  "sourceOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnvironmentConflict_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EnvironmentConflict_conflictCode_key"
  ON "EnvironmentConflict"("conflictCode");

CREATE TABLE IF NOT EXISTS "Blocker" (
  "id" TEXT NOT NULL,
  "blockerCode" TEXT NOT NULL,
  "releaseCode" TEXT NOT NULL,
  "releaseName" TEXT NOT NULL,
  "departmentName" TEXT NOT NULL,
  "applicationName" TEXT NOT NULL,
  "blockerType" TEXT NOT NULL,
  "blockerDescription" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "raisedDate" TIMESTAMP(3) NOT NULL,
  "raisedBy" TEXT NOT NULL,
  "assignedTo" TEXT,
  "status" TEXT NOT NULL,
  "targetResolutionDate" TIMESTAMP(3),
  "actualResolutionDate" TIMESTAMP(3),
  "daysOpen" INTEGER NOT NULL,
  "escalationLevel" TEXT NOT NULL,
  "rootCause" TEXT,
  "resolutionNotes" TEXT,
  "impactOnRelease" TEXT NOT NULL,
  "sourceOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Blocker_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Blocker_blockerCode_key" ON "Blocker"("blockerCode");

CREATE TABLE IF NOT EXISTS "SystemCoreRecord" (
  "id" TEXT NOT NULL,
  "system" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "integratesWith" TEXT NOT NULL,
  "dataFlow" TEXT NOT NULL,
  "keyDataExchanged" TEXT NOT NULL,
  "sourceOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemCoreRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemCoreRecord_system_sourceOrder_key"
  ON "SystemCoreRecord"("system", "sourceOrder");

CREATE TABLE IF NOT EXISTS "SystemMatrixRow" (
  "id" TEXT NOT NULL,
  "fromDepartment" TEXT NOT NULL,
  "finance" TEXT NOT NULL,
  "hr" TEXT NOT NULL,
  "it" TEXT NOT NULL,
  "crm" TEXT NOT NULL,
  "manufacturing" TEXT NOT NULL,
  "logistics" TEXT NOT NULL,
  "legal" TEXT NOT NULL,
  "security" TEXT NOT NULL,
  "sourceOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemMatrixRow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemMatrixRow_sourceOrder_key"
  ON "SystemMatrixRow"("sourceOrder");
