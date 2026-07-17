-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productOwner" TEXT NOT NULL,
    "techLead" TEXT NOT NULL,
    "support" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "lastDbRefresh" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentVersion" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "updatedBy" TEXT,
    "buildNumber" TEXT,
    "deployDate" TIMESTAMP(3),
    "status" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseAuditEvent" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "releaseCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programProject" TEXT,
    "owner" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "notes" TEXT,
    "decision" TEXT,
    "releaseSize" TEXT,
    "cabDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "testEnvRequired" TEXT,
    "uatEnvRequired" TEXT,
    "conflictFlag" BOOLEAN NOT NULL DEFAULT false,
    "readinessPercent" DOUBLE PRECISION,
    "blockers" TEXT,
    "vendorMaintenance" TEXT,
    "changeFreeze" TEXT,
    "regulatory" TEXT,
    "approvalStatus" TEXT,
    "rollbackPlan" TEXT,
    "goLiveChecklistPercent" DOUBLE PRECISION,
    "deploymentWindow" TEXT,
    "releaseOwnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseApplication" (
    "releaseId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,

    CONSTRAINT "ReleaseApplication_pkey" PRIMARY KEY ("releaseId","applicationId")
);

-- CreateTable
CREATE TABLE "ReleaseDependency" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "dependsOnReleaseId" TEXT NOT NULL,
    "dependencyType" TEXT,
    "status" TEXT,
    "impactIfBlocked" TEXT,
    "notes" TEXT,

    CONSTRAINT "ReleaseDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvBooking" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "environmentId" TEXT,
    "bookedBy" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "departmentName" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "releaseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "releaseSize" TEXT,
    "prodReleaseDate" TIMESTAMP(3),
    "cabDate" TIMESTAMP(3),
    "testEnvCode" TEXT,
    "testStart" TIMESTAMP(3),
    "testEnd" TIMESTAMP(3),
    "testDays" INTEGER,
    "uatEnvCode" TEXT,
    "uatStart" TIMESTAMP(3),
    "uatEnd" TIMESTAMP(3),
    "uatDays" INTEGER,
    "preProdEnvCode" TEXT,
    "preProdStart" TIMESTAMP(3),
    "preProdEnd" TIMESTAMP(3),
    "preProdDays" INTEGER,
    "conflictFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemMappingGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "sourceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMappingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemMappingEdge" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "sourceAppId" TEXT NOT NULL,
    "sourceEnvId" TEXT NOT NULL,
    "targetAppId" TEXT NOT NULL,
    "targetEnvId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMappingEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "baseUrl" TEXT,
    "credentials" TEXT NOT NULL,
    "config" JSONB,
    "pollInterval" INTEGER NOT NULL DEFAULT 15,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSyncLog" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsSynced" INTEGER DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ConnectorSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "P1Issue" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "application" TEXT,
    "releaseCode" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'P1',
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "connectorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "P1Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "releaseCode" TEXT,
    "status" TEXT NOT NULL,
    "assignee" TEXT,
    "priority" TEXT,
    "blockedBy" TEXT,
    "source" TEXT NOT NULL DEFAULT 'Jira',
    "connectorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseDecisionState" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "decision" TEXT,
    "rationale" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseDecisionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentState" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "rollbackNarrative" TEXT,
    "rollbackReason" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseHistoryEvent" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agent" TEXT,

    CONSTRAINT "ReleaseHistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotificationRow" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "releaseId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL,

    CONSTRAINT "AppNotificationRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPauseState" (
    "agentId" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPauseState_pkey" PRIMARY KEY ("agentId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "manager" TEXT,
    "accessLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseStakeholder" (
    "releaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ReleaseStakeholder_pkey" PRIMARY KEY ("releaseId","userId")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "riskCode" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "affectedArea" TEXT,
    "mitigationStrategy" TEXT,
    "riskOwnerId" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drift" (
    "id" TEXT NOT NULL,
    "driftCode" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "environmentName" TEXT NOT NULL,
    "driftType" TEXT NOT NULL,
    "driftCategory" TEXT,
    "detectedDate" TIMESTAMP(3) NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impactOnRelease" TEXT,
    "remediationAction" TEXT,
    "status" TEXT NOT NULL,
    "etaToFix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "approvalCode" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "approvalType" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "submittedDate" TIMESTAMP(3) NOT NULL,
    "decisionDate" TIMESTAMP(3),
    "decision" TEXT NOT NULL DEFAULT 'Pending',
    "comments" TEXT,
    "cabMeetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRecord" (
    "id" TEXT NOT NULL,
    "leaveCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveStart" TIMESTAMP(3) NOT NULL,
    "leaveEnd" TIMESTAMP(3) NOT NULL,
    "leaveType" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "riskImpact" TEXT,
    "riskScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRecordRelease" (
    "leaveRecordId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,

    CONSTRAINT "LeaveRecordRelease_pkey" PRIMARY KEY ("leaveRecordId","releaseId")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "releaseId" TEXT,
    "title" TEXT NOT NULL,
    "departmentName" TEXT,
    "sizeImpact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Application_name_departmentId_key" ON "Application"("name", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_applicationId_name_key" ON "Environment"("applicationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentVersion_applicationId_environmentId_key" ON "EnvironmentVersion"("applicationId", "environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Release_releaseCode_key" ON "Release"("releaseCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseDependency_releaseId_dependsOnReleaseId_key" ON "ReleaseDependency"("releaseId", "dependsOnReleaseId");

-- CreateIndex
CREATE INDEX "ConnectorSyncLog_connectorId_idx" ON "ConnectorSyncLog"("connectorId");

-- CreateIndex
CREATE UNIQUE INDEX "P1Issue_externalId_key" ON "P1Issue"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_externalId_key" ON "WorkItem"("externalId");

-- CreateIndex
CREATE INDEX "WorkItem_releaseCode_idx" ON "WorkItem"("releaseCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseDecisionState_releaseId_key" ON "ReleaseDecisionState"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentState_releaseId_key" ON "DeploymentState"("releaseId");

-- CreateIndex
CREATE INDEX "ReleaseHistoryEvent_releaseId_idx" ON "ReleaseHistoryEvent"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_riskCode_key" ON "Risk"("riskCode");

-- CreateIndex
CREATE INDEX "Risk_releaseId_idx" ON "Risk"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Drift_driftCode_key" ON "Drift"("driftCode");

-- CreateIndex
CREATE INDEX "Drift_releaseId_idx" ON "Drift"("releaseId");

-- CreateIndex
CREATE INDEX "Drift_applicationId_idx" ON "Drift"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_approvalCode_key" ON "Approval"("approvalCode");

-- CreateIndex
CREATE INDEX "Approval_releaseId_idx" ON "Approval"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRecord_leaveCode_key" ON "LeaveRecord"("leaveCode");

-- CreateIndex
CREATE INDEX "LeaveRecord_userId_idx" ON "LeaveRecord"("userId");

-- CreateIndex
CREATE INDEX "CalendarEvent_releaseId_idx" ON "CalendarEvent"("releaseId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentVersion" ADD CONSTRAINT "EnvironmentVersion_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentVersion" ADD CONSTRAINT "EnvironmentVersion_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseAuditEvent" ADD CONSTRAINT "ReleaseAuditEvent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_releaseOwnerId_fkey" FOREIGN KEY ("releaseOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseApplication" ADD CONSTRAINT "ReleaseApplication_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseApplication" ADD CONSTRAINT "ReleaseApplication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseDependency" ADD CONSTRAINT "ReleaseDependency_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseDependency" ADD CONSTRAINT "ReleaseDependency_dependsOnReleaseId_fkey" FOREIGN KEY ("dependsOnReleaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvBooking" ADD CONSTRAINT "EnvBooking_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvBooking" ADD CONSTRAINT "EnvBooking_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvBooking" ADD CONSTRAINT "EnvBooking_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemMappingEdge" ADD CONSTRAINT "SystemMappingEdge_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SystemMappingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemMappingEdge" ADD CONSTRAINT "SystemMappingEdge_sourceAppId_fkey" FOREIGN KEY ("sourceAppId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemMappingEdge" ADD CONSTRAINT "SystemMappingEdge_sourceEnvId_fkey" FOREIGN KEY ("sourceEnvId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemMappingEdge" ADD CONSTRAINT "SystemMappingEdge_targetAppId_fkey" FOREIGN KEY ("targetAppId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemMappingEdge" ADD CONSTRAINT "SystemMappingEdge_targetEnvId_fkey" FOREIGN KEY ("targetEnvId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncLog" ADD CONSTRAINT "ConnectorSyncLog_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P1Issue" ADD CONSTRAINT "P1Issue_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseStakeholder" ADD CONSTRAINT "ReleaseStakeholder_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseStakeholder" ADD CONSTRAINT "ReleaseStakeholder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_riskOwnerId_fkey" FOREIGN KEY ("riskOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drift" ADD CONSTRAINT "Drift_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drift" ADD CONSTRAINT "Drift_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRecord" ADD CONSTRAINT "LeaveRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRecordRelease" ADD CONSTRAINT "LeaveRecordRelease_leaveRecordId_fkey" FOREIGN KEY ("leaveRecordId") REFERENCES "LeaveRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRecordRelease" ADD CONSTRAINT "LeaveRecordRelease_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

