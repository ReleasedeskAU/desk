-- Additive migration: Monitoring Alerts, Incidents, Application Status, Planned Maintenance.
-- No destructive changes; safe to run against the existing Neon DB.

CREATE TABLE IF NOT EXISTS "MonitoringAlert" (
    "id" TEXT NOT NULL,
    "alertCode" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "departmentName" TEXT,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "assignedTo" TEXT,
    "environmentName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonitoringAlert_alertCode_key" ON "MonitoringAlert"("alertCode");
CREATE INDEX IF NOT EXISTS "MonitoringAlert_applicationId_idx" ON "MonitoringAlert"("applicationId");

DO $$ BEGIN
    ALTER TABLE "MonitoringAlert"
        ADD CONSTRAINT "MonitoringAlert_applicationId_fkey"
        FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Incident" (
    "id" TEXT NOT NULL,
    "incidentCode" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "departmentName" TEXT,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "assignedTo" TEXT,
    "relatedReleaseCode" TEXT,
    "environmentName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Incident_incidentCode_key" ON "Incident"("incidentCode");
CREATE INDEX IF NOT EXISTS "Incident_applicationId_idx" ON "Incident"("applicationId");
CREATE INDEX IF NOT EXISTS "Incident_relatedReleaseCode_idx" ON "Incident"("relatedReleaseCode");

DO $$ BEGIN
    ALTER TABLE "Incident"
        ADD CONSTRAINT "Incident_applicationId_fkey"
        FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ApplicationStatus" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "environmentName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastCheck" TIMESTAMP(3) NOT NULL,
    "uptimePercent" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApplicationStatus_applicationId_environmentName_key"
    ON "ApplicationStatus"("applicationId", "environmentName");

DO $$ BEGIN
    ALTER TABLE "ApplicationStatus"
        ADD CONSTRAINT "ApplicationStatus_applicationId_fkey"
        FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PlannedMaintenance" (
    "id" TEXT NOT NULL,
    "maintenanceCode" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "applicationId" TEXT,
    "environmentName" TEXT NOT NULL,
    "departmentName" TEXT,
    "impact" TEXT NOT NULL,
    "requestor" TEXT,
    "approvalStatus" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedMaintenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlannedMaintenance_maintenanceCode_key" ON "PlannedMaintenance"("maintenanceCode");

DO $$ BEGIN
    ALTER TABLE "PlannedMaintenance"
        ADD CONSTRAINT "PlannedMaintenance_applicationId_fkey"
        FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
