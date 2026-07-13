import type { ColumnDef, FilterFieldDef } from "@/lib/table-column-types";

/** Stable page keys and column definitions for per-user column visibility. */

export const RELEASE_COLUMNS: ColumnDef[] = [
  { key: "releaseCode", label: "Release ID" },
  { key: "name", label: "Release Name" },
  { key: "department", label: "Department" },
  { key: "application", label: "Application" },
  { key: "externalDependencies", label: "External Dependencies " },
  { key: "releaseSize", label: "Release Size" },
  { key: "impact", label: "Impact" },
  { key: "priority", label: "Priority" },
  { key: "cabDate", label: "CAB Date" },
  { key: "startDate", label: "Start Date" },
  { key: "endDate", label: "End Date" },
  { key: "testEnvRequired", label: "Test Env Required" },
  { key: "uatEnvRequired", label: "UAT Env Required" },
  { key: "status", label: "Status" },
  { key: "releaseHealth", label: "Release Health" },
  { key: "conflictFlag", label: "Conflict Flag" },
  { key: "conflictId", label: "Conflict ID" },
  { key: "conflictingRelease", label: "Conflicting Release" },
  { key: "conflictType", label: "Conflict Type" },
  { key: "conflictNotes", label: "Conflict Notes" },
  { key: "blockers", label: "Blockers" },
  { key: "changeFreeze", label: "Change Freeze" },
  { key: "vendorMaintenance", label: "Vendor Maintenance" },
  { key: "rollbackPlan", label: "Rollback Plan" },
  { key: "readinessPercent", label: "Readiness %" },
  { key: "goLiveChecklistPercent", label: "Go-Live Checklist %" },
  { key: "releaseOwnerId", label: "Release Owner ID" },
  { key: "approvalStatus", label: "Approval Status" },
  { key: "stakeholderIds", label: "Stakeholder IDs" },
  { key: "dependsOn", label: "Depends On Other releases" },
  { key: "regulatory", label: "Regulatory" },
  { key: "deploymentWindow", label: "Deployment Window" },
  { key: "devSignoff", label: "Dev Signoff" },
  { key: "testSignoff", label: "Test Sign-off" },
  { key: "uatSignoff", label: "UAT Sign-off" },
  { key: "securityClearance", label: "Security Clearance" },
  { key: "dressRehearsal", label: "Dress Rehearsal" },
  { key: "hypercarePlan", label: "Hypercare Plan" },
  { key: "commsPlan", label: "Comms Plan" },
  { key: "trainingStatus", label: "Training Status" },
];

/** Core release-desk columns — visible by default; extended governance/sign-off columns stay hidden until enabled. */
export const RELEASE_DEFAULT_VISIBLE_COLUMN_KEYS = [
  "releaseCode",
  "name",
  "department",
  "application",
  "releaseSize",
  "impact",
  "priority",
  "cabDate",
  "startDate",
  "endDate",
  "status",
  "regulatory",
  "deploymentWindow",
] as const;

export const RELEASE_DEFAULT_HIDDEN_COLUMN_KEYS: string[] = RELEASE_COLUMNS.map((c) => c.key).filter(
  (k) => !(RELEASE_DEFAULT_VISIBLE_COLUMN_KEYS as readonly string[]).includes(k)
);

export const DRIFT_COLUMNS: ColumnDef[] = [
  { key: "driftCode", label: "Drift ID" },
  { key: "release", label: "Release ID" },
  { key: "releaseName", label: "Release Name" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "environment", label: "Environment" },
  { key: "type", label: "Drift Type:" },
  { key: "category", label: "Drift Category" },
  { key: "detected", label: "Detected Date" },
  { key: "severity", label: "Severity" },
  { key: "description", label: "Description" },
  { key: "impactOnRelease", label: "Impact on Release" },
  { key: "remediationAction", label: "Remediation Action" },
  { key: "status", label: "Status" },
  { key: "etaToFix", label: "ETA to Fix" },
];

export const INCIDENT_COLUMNS: ColumnDef[] = [
  { key: "incidentCode", label: "Incident ID" },
  { key: "timestamp", label: "Timestamp" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "severity", label: "Severity" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "impact", label: "Impact" },
  { key: "relatedRelease", label: "Related Release" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "environment", label: "Environment" },
];

export const APPLICATION_STATUS_COLUMNS: ColumnDef[] = [
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "environment", label: "Environment" },
  { key: "status", label: "Status" },
  { key: "lastCheck", label: "Last Check" },
  { key: "uptimePercent", label: "Uptime %" },
  { key: "notes", label: "Notes" },
];

export const ENVIRONMENT_COLUMNS: ColumnDef[] = [
  { key: "appId", label: "App ID" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "environment", label: "Environment" },
  { key: "version", label: "Version" },
  { key: "buildNumber", label: "Build Number" },
  { key: "deployDate", label: "Deploy Date" },
  { key: "deployedBy", label: "Deployed By" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

export const REFERENCE_DATA_COLUMNS: ColumnDef[] = [
  { key: "value", label: "Value" },
  { key: "sortOrder", label: "Sort Order" },
  { key: "active", label: "Active" },
];

export const RISK_COLUMNS: ColumnDef[] = [
  { key: "riskCode", label: "Risk ID" },
  { key: "releaseCode", label: "Release ID" },
  { key: "releaseName", label: "Release Name" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "prodDate", label: "Prod Date" },
  { key: "daysOut", label: "Days Out" },
  { key: "category", label: "Risk Category" },
  { key: "description", label: "Risk Description" },
  { key: "likelihood", label: "Likelihood" },
  { key: "impact", label: "Impact" },
  { key: "riskScore", label: "Risk Score" },
  { key: "affectedArea", label: "Affected Area" },
  { key: "mitigationStrategy", label: "Mitigation Strategy" },
  { key: "riskOwner", label: "Risk Owner" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
  { key: "riskOwnerId", label: "Risk Owner ID" },
];

export const RISK_FACTOR_COLUMNS: ColumnDef[] = [
  { key: "category", label: "Category" },
  { key: "factorName", label: "Factor Name" },
  { key: "weight", label: "Weight" },
  { key: "description", label: "Description" },
  { key: "active", label: "Active" },
];

export const APPROVAL_COLUMNS: ColumnDef[] = [
  { key: "approvalCode", label: "Approval ID" },
  { key: "releaseId", label: "Release ID" },
  { key: "releaseName", label: "Release Name" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "approvalType", label: "Approval Type" },
  { key: "approverId", label: "Approver ID" },
  { key: "approverName", label: "Approver Name" },
  { key: "approverRole", label: "Approver Role" },
  { key: "submittedDate", label: "Submitted Date" },
  { key: "decisionDate", label: "Decision Date" },
  { key: "decision", label: "Decision" },
  { key: "comments", label: "Comments" },
  { key: "cabMeetingId", label: "CAB Meeting ID" },
];

export const LEAVE_COLUMNS: ColumnDef[] = [
  { key: "leaveCode", label: "Leave ID" },
  { key: "userId", label: "User ID" },
  { key: "staffMember", label: "User Name" },
  { key: "department", label: "Department" },
  { key: "role", label: "Role" },
  { key: "leaveStart", label: "Leave Start" },
  { key: "leaveEnd", label: "Leave End" },
  { key: "type", label: "Leave Type" },
  { key: "days", label: "Days" },
  { key: "affectedReleases", label: "Affected Release" },
  { key: "riskImpact", label: "Risk Impact" },
  { key: "riskScore", label: "Risk Score" },
];

export const MONITORING_ALERT_COLUMNS: ColumnDef[] = [
  { key: "alertCode", label: "Alert ID" },
  { key: "timestamp", label: "Timestamp" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "alertType", label: "Alert Type" },
  { key: "severity", label: "Severity" },
  { key: "metric", label: "Metric" },
  { key: "threshold", label: "Threshold" },
  { key: "currentValue", label: "Current Value" },
  { key: "status", label: "Status" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "environment", label: "Environment" },
];

export const PLANNED_MAINTENANCE_COLUMNS: ColumnDef[] = [
  { key: "maintenanceCode", label: "Maintenance ID" },
  { key: "scheduledDate", label: "Scheduled Date" },
  { key: "startTime", label: "Start Time" },
  { key: "endTime", label: "End Time" },
  { key: "type", label: "Type" },
  { key: "application", label: "Application(s)" },
  { key: "environment", label: "Environment(s)" },
  { key: "department", label: "Department" },
  { key: "impact", label: "Impact" },
  { key: "requestor", label: "Requestor" },
  { key: "approval", label: "Approval Status" },
  { key: "notes", label: "Notes" },
];

export const INTEGRATION_FLOW_COLUMNS: ColumnDef[] = [
  { key: "flowCode", label: "Flow ID" },
  { key: "sourceSystem", label: "Source System" },
  { key: "targetSystem", label: "Target System" },
  { key: "integrationType", label: "Integration Type" },
  { key: "frequency", label: "Frequency" },
  { key: "dataElements", label: "Data Elements" },
  { key: "businessPurpose", label: "Business Purpose" },
];

export const DEPARTMENT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Department" },
  { key: "head", label: "Head" },
  { key: "applicationCount", label: "Applications" },
];

export const APPLICATION_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Application" },
  { key: "department", label: "Department" },
  { key: "type", label: "Type" },
  { key: "criticality", label: "Criticality" },
  { key: "productOwner", label: "Product Owner" },
  { key: "techLead", label: "Tech Lead" },
  { key: "envCount", label: "Environments" },
];

export const USER_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "department", label: "Department" },
  { key: "accessLevel", label: "Access Level" },
  { key: "status", label: "Status" },
  { key: "lastLogin", label: "Last Login" },
];

/** Date is first so DataTable sticky-first-col sticks the row identifier (rule #8). */
export const CALENDAR_TABLE_COLUMNS: ColumnDef[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "date", label: "Date" },
  { key: "day", label: "Day" },
  { key: "eventType", label: "Event Type" },
  { key: "releaseCode", label: "Release ID" },
  { key: "releaseName", label: "Release Name" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "sizeImpact", label: "Size/Impact" },
  { key: "notes", label: "Notes" },
];

export const CONFLICT_COLUMNS: ColumnDef[] = [
  { key: "conflictCode", label: "Conflict ID" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "release1Code", label: "Release 1" },
  { key: "release2Code", label: "Release 2" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "conflictingEnvironment", label: "Conflicting Environment" },
  { key: "environmentConflictType", label: "Environment Conflict Type" },
  { key: "notes", label: "Notes" },
];

/** Blockers sheet — exact V0.6 Excel headers / left-to-right order. */
export const BLOCKER_COLUMNS: ColumnDef[] = [
  { key: "blockerCode", label: "Blocker ID" },
  { key: "releaseCode", label: "Release ID" },
  { key: "releaseName", label: "Release Name" },
  { key: "department", label: "Department" },
  { key: "application", label: "Application" },
  { key: "blockerType", label: "Blocker Type" },
  { key: "blockerDescription", label: "Blocker Description" },
  { key: "severity", label: "Severity" },
  { key: "raisedDate", label: "Raised Date" },
  { key: "raisedBy", label: "Raised By" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "status", label: "Status" },
  { key: "targetResolutionDate", label: "Target Resolution Date" },
  { key: "actualResolutionDate", label: "Actual Resolution Date" },
  { key: "daysOpen", label: "Days Open" },
  { key: "escalationLevel", label: "Escalation Level" },
  { key: "rootCause", label: "Root Cause" },
  { key: "resolutionNotes", label: "Resolution Notes" },
  { key: "impactOnRelease", label: "Impact on Release" },
];

export const DEPENDENCY_COLUMNS: ColumnDef[] = [
  { key: "depCode", label: "Dep ID" },
  { key: "releaseCode", label: "Release ID" },
  { key: "releaseName", label: "Release Name" },
  { key: "dependsOnCode", label: "Depends On Release" },
  { key: "dependsOnName", label: "Depends On Name" },
  { key: "dependencyType", label: "Dependency Type" },
  { key: "status", label: "Status" },
  { key: "impactIfBlocked", label: "Impact if Blocked" },
  { key: "notes", label: "Notes" },
];

export const BOOKING_COLUMNS: ColumnDef[] = [
  { key: "bookingCode", label: "Booking ID" },
  { key: "releaseId", label: "Release ID" },
  { key: "application", label: "Application" },
  { key: "department", label: "Department" },
  { key: "dependencies", label: "Dependencies" },
  { key: "releaseSize", label: "Release Size" },
  { key: "prodReleaseDate", label: "Prod Release Date" },
  { key: "cabDate", label: "CAB Date" },
  { key: "testEnvCode", label: "Test Env" },
  { key: "testStart", label: "Test Start" },
  { key: "testEnd", label: "Test End" },
  { key: "testDays", label: "Test Days" },
  { key: "uatEnvCode", label: "UAT Env" },
  { key: "uatStart", label: "UAT Start" },
  { key: "uatEnd", label: "UAT End" },
  { key: "uatDays", label: "UAT Days" },
  { key: "preProdEnvCode", label: "Pre-Prod Env" },
  { key: "preProdStart", label: "Pre-Prod Start" },
  { key: "preProdEnd", label: "Pre-Prod End" },
  { key: "preProdDays", label: "Pre-Prod Days" },
  { key: "conflictFlag", label: "Conflict Flag" },
  { key: "notes", label: "Notes" },
  { key: "environmentConflictId", label: "Environment Conflict ID" },
];

/** All page keys that support per-user column visibility (used for prefetch). */
export const TABLE_PAGE_KEYS = [
  "releases",
  "env-booking",
  "dependencies",
  "conflicts",
  "blockers",
  "environments",
  "risks",
  "drifts",
  "approvals",
  "leaves",
  "monitoring-alerts",
  "incidents",
  "application-status",
  "planned-maintenance",
  "integration-flows",
  "departments",
  "applications",
  "users",
  "risk-factors",
  "reference-data",
  "calendar-table",
] as const;

/**
 * Incidents — own schema only (columns only; departmentName dropped — not a table column).
 * Default-visible: severity / status / application / environment / assigned to / title.
 */
export const INCIDENT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "severity", label: "Severity" },
  { key: "status", label: "Status" },
  { key: "applicationId", label: "Application" },
  { key: "environmentName", label: "Environment" },
  { key: "assignedToQ", label: "Assigned To" },
  { key: "titleQ", label: "Title" },
  { key: "incidentCodeQ", label: "Incident" },
  { key: "impact", label: "Impact" },
  { key: "relatedReleaseQ", label: "Related Release" },
  { key: "timestampQ", label: "Timestamp" },
];

export const INCIDENT_DEFAULT_HIDDEN_FILTER_KEYS: string[] = INCIDENT_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      ![
        "severity",
        "status",
        "applicationId",
        "environmentName",
        "assignedToQ",
        "titleQ",
      ].includes(k)
  );

/**
 * Drift — own schema only.
 * Default-visible: type / severity / status / application / release.
 * Orphan `releaseId` registry key is replaced by releaseCodeQ (wired in UI).
 */
export const DRIFT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "driftType", label: "Drift type" },
  { key: "severity", label: "Severity" },
  { key: "status", label: "Status" },
  { key: "applicationId", label: "Application" },
  { key: "releaseCodeQ", label: "Release" },
  { key: "driftCodeQ", label: "Drift" },
  { key: "environmentName", label: "Env" },
  { key: "detectedDateQ", label: "Detected" },
];

export const DRIFT_DEFAULT_HIDDEN_FILTER_KEYS: string[] = DRIFT_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["driftType", "severity", "status", "applicationId", "releaseCodeQ"].includes(k)
  );

/**
 * Monitoring Alerts — own schema only.
 * Default-visible: severity / status / application / alert type / environment / assigned to.
 * Orphan `departmentName` removed (not a table column; was never wired in UI).
 */
export const MONITORING_ALERTS_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "severity", label: "Severity" },
  { key: "status", label: "Status" },
  { key: "applicationId", label: "Application" },
  { key: "alertType", label: "Alert type" },
  { key: "environmentName", label: "Environment" },
  { key: "assignedToQ", label: "Assigned To" },
  { key: "alertCodeQ", label: "Alert" },
  { key: "metricQ", label: "Metric" },
  { key: "thresholdQ", label: "Threshold vs Current" },
  { key: "timestampQ", label: "Timestamp" },
];

export const MONITORING_ALERTS_DEFAULT_HIDDEN_FILTER_KEYS: string[] = MONITORING_ALERTS_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      ![
        "severity",
        "status",
        "applicationId",
        "alertType",
        "environmentName",
        "assignedToQ",
      ].includes(k)
  );

/**
 * Application Status — own schema only (6 table columns).
 * Default-visible: status / application / environment / uptime % / notes.
 * Orphan `departmentName` removed (not a table column; was never wired in UI).
 */
export const APPLICATION_STATUS_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "status", label: "Status" },
  { key: "applicationId", label: "Application" },
  { key: "environmentName", label: "Environment" },
  { key: "uptimePercent", label: "Uptime %" },
  { key: "notesQ", label: "Notes" },
  { key: "lastCheckQ", label: "Last Check" },
];

export const APPLICATION_STATUS_DEFAULT_HIDDEN_FILTER_KEYS: string[] = APPLICATION_STATUS_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["status", "applicationId", "environmentName", "uptimePercent", "notesQ"].includes(k)
  );

/**
 * Approvals — own schema only.
 * Default-visible: decision / type / approver (text) / release ID / release name.
 * Orphan `releaseId` is wired as releaseCodeQ; approver is text (not ID dropdown).
 */
export const APPROVALS_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "decision", label: "Decision" },
  { key: "approvalType", label: "Approval type" },
  /** Single text field covers Approver Name + Approver ID (table-standard #2 person rule). */
  { key: "approverQ", label: "Approver" },
  { key: "releaseCodeQ", label: "Release ID" },
  { key: "releaseNameQ", label: "Release Name" },
  { key: "approvalCodeQ", label: "Approval ID" },
  { key: "approverRole", label: "Approver Role" },
  { key: "submittedDateQ", label: "Submitted Date" },
  { key: "decisionDateQ", label: "Decision Date" },
  { key: "commentsQ", label: "Comments" },
  { key: "cabMeetingIdQ", label: "CAB Meeting ID" },
];

export const APPROVALS_DEFAULT_HIDDEN_FILTER_KEYS: string[] = APPROVALS_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["decision", "approvalType", "approverQ", "releaseCodeQ", "releaseNameQ"].includes(k)
  );

/**
 * Manage Filters registry for Releases.
 * Default-visible: the original 6. Everything else defaults to hidden
 * (see RELEASE_DEFAULT_HIDDEN_FILTER_KEYS / useFilterPreferences).
 * Dependencies column is intentionally omitted — seed/DB values are always "NA".
 *
 * IMPORTANT: Do not reuse this full list on Calendar/Inbox. Those pages share
 * ReleaseFiltersBar but must pass their own scoped field list (see CALENDAR_FILTER_FIELDS).
 */
export const RELEASE_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "departmentId", label: "Department" },
  { key: "applicationId", label: "Application" },
  { key: "environmentId", label: "Environment" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "impact", label: "Impact" },
  // Low-cardinality
  { key: "approvalStatus", label: "Approval Status" },
  { key: "rollbackPlan", label: "Rollback Plan" },
  { key: "deploymentWindow", label: "Deployment Window" },
  { key: "changeFreeze", label: "Change Freeze" },
  { key: "regulatory", label: "Regulatory" },
  { key: "vendorMaintenance", label: "Vendor Maintenance" },
  { key: "releaseSize", label: "Release Size" },
  { key: "releaseHealth", label: "Release Health" },
  // Sign-off & readiness gates
  { key: "devSignoff", label: "Dev Signoff" },
  { key: "testSignoff", label: "Test Sign-off" },
  { key: "uatSignoff", label: "UAT Sign-off" },
  { key: "securityClearance", label: "Security Clearance" },
  { key: "dressRehearsal", label: "Dress Rehearsal" },
  { key: "hypercarePlan", label: "Hypercare Plan" },
  { key: "commsPlan", label: "Comms Plan" },
  { key: "trainingStatus", label: "Training Status" },
  // Numeric ranges
  { key: "readinessPercent", label: "Readiness %" },
  { key: "goLiveChecklistPercent", label: "Go-Live Checklist %" },
  // Boolean / presence
  { key: "conflictFlag", label: "Conflict Flag" },
  { key: "hasBlockers", label: "Blockers" },
  { key: "hasDependsOn", label: "Depends On Other releases" },
  // Conflict detail
  { key: "conflictIdQ", label: "Conflict ID" },
  { key: "conflictingReleaseQ", label: "Conflicting Release" },
  { key: "conflictType", label: "Conflict Type" },
  { key: "conflictNotesQ", label: "Conflict Notes" },
  // Dates (YYYY / YYYY-MM / YYYY-MM-DD) + env-flag text
  { key: "cabDateQ", label: "CAB Date" },
  { key: "startDateQ", label: "Start Date" },
  { key: "endDateQ", label: "End Date" },
  { key: "testEnvRequiredQ", label: "Test Env Required" },
  { key: "uatEnvRequiredQ", label: "UAT Env Required" },
  // Free-text
  { key: "releaseCodeQ", label: "Release ID" },
  { key: "nameQ", label: "Release Name" },
  { key: "externalDependenciesQ", label: "External Dependencies" },
  { key: "notesQ", label: "Notes" },
  // Free-text name search against live User records (not a fixed dropdown)
  { key: "releaseOwnerId", label: "Release Owner" },
  { key: "stakeholderId", label: "Stakeholders" },
];

/** New Releases filters — hidden until the user enables them in Manage Filters. */
export const RELEASE_DEFAULT_HIDDEN_FILTER_KEYS: string[] = RELEASE_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      ![
        "departmentId",
        "applicationId",
        "environmentId",
        "status",
        "priority",
        "impact",
      ].includes(k)
  );

/**
 * Calendar shares ReleaseFiltersBar + ReleaseFiltersContext, but must NOT inherit
 * Releases-only columns (Rollback Plan, Go-Live %, Owner text search, etc.).
 * Scoped to Calendar table columns + existing release-family scope filters.
 * Month/Week are intentionally omitted — period navigator is the single time control.
 */
export const CALENDAR_FILTER_FIELDS: FilterFieldDef[] = [
  // Existing defaults (keep visible)
  { key: "departmentId", label: "Department" },
  { key: "applicationId", label: "Application" },
  { key: "environmentId", label: "Environment" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "impact", label: "Impact" },
  // Calendar column filters (Event Type was already always-on in the bar)
  { key: "eventType", label: "Event Type" },
  { key: "releaseCodeQ", label: "Release ID" },
  { key: "nameQ", label: "Release Name" },
  { key: "sizeImpact", label: "Size/Impact" },
  { key: "notesQ", label: "Notes" },
  { key: "dateRange", label: "Date" },
  { key: "day", label: "Day" },
];

/** New Calendar column filters — hidden until enabled in Manage Filters.
 *  eventType stays default-visible (was always shown before this expansion). */
export const CALENDAR_DEFAULT_HIDDEN_FILTER_KEYS: string[] = [
  "releaseCodeQ",
  "nameQ",
  "sizeImpact",
  "notesQ",
  "dateRange",
  "day",
];

/**
 * Leave Calendar — own schema only.
 * Default-visible: leave type / department / risk / staff member / affected releases.
 */
export const LEAVE_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "leaveType", label: "Leave type" },
  { key: "department", label: "Department" },
  { key: "riskLevel", label: "Risk level" },
  { key: "staffMemberQ", label: "Staff Member" },
  { key: "affectedReleaseQ", label: "Affected Releases" },
  { key: "leaveCodeQ", label: "Leave ID" },
  { key: "datesQ", label: "Dates" },
  { key: "days", label: "Days" },
];

export const LEAVE_DEFAULT_HIDDEN_FILTER_KEYS: string[] = LEAVE_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["leaveType", "department", "riskLevel", "staffMemberQ", "affectedReleaseQ"].includes(k)
  );

/**
 * Risk Register — own schema only.
 * Default-visible: status / category / likelihood / impact / risk owner / risk score.
 * application / department / prod date / days out / release name default hidden.
 */
export const RISK_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "status", label: "Status" },
  { key: "category", label: "Category" },
  { key: "likelihood", label: "Likelihood" },
  { key: "impact", label: "Impact" },
  { key: "riskOwnerQ", label: "Risk Owner" },
  { key: "riskScore", label: "Risk Score" },
  { key: "riskCodeQ", label: "Risk ID" },
  { key: "releaseCodeQ", label: "Release ID" },
  { key: "releaseNameQ", label: "Release Name" },
  { key: "applicationQ", label: "Application" },
  { key: "departmentQ", label: "Department" },
  { key: "prodDateQ", label: "Prod Date" },
  { key: "daysOut", label: "Days Out" },
  { key: "descriptionQ", label: "Description" },
  { key: "affectedAreaQ", label: "Affected Area" },
  { key: "mitigationStrategyQ", label: "Mitigation Strategy" },
  { key: "notesQ", label: "Notes" },
];

export const RISK_DEFAULT_HIDDEN_FILTER_KEYS: string[] = RISK_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["status", "category", "likelihood", "impact", "riskOwnerQ", "riskScore"].includes(k)
  );

/**
 * Conflicts — own schema only.
 * Default-visible: status / priority / department / application / assigned to.
 */
export const CONFLICT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "departmentId", label: "Department" },
  { key: "applicationId", label: "Application" },
  { key: "assignedToQ", label: "Assigned To" },
  { key: "conflictCodeQ", label: "Conflict ID" },
  { key: "release1CodeQ", label: "Release 1" },
  { key: "release2CodeQ", label: "Release 2" },
  { key: "conflictingEnvironmentQ", label: "Conflicting Environment" },
  { key: "environmentConflictType", label: "Environment Conflict Type" },
  { key: "notesQ", label: "Notes" },
];

export const CONFLICT_DEFAULT_HIDDEN_FILTER_KEYS: string[] = CONFLICT_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["status", "priority", "departmentId", "applicationId", "assignedToQ"].includes(k)
  );

/**
 * Blockers — own schema only (19 Excel columns).
 * Default-visible: status / severity / type / department / assigned to / release ID.
 */
export const BLOCKER_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "status", label: "Status" },
  { key: "severity", label: "Severity" },
  { key: "blockerType", label: "Blocker Type" },
  { key: "departmentId", label: "Department" },
  { key: "assignedToQ", label: "Assigned To" },
  { key: "releaseCodeQ", label: "Release ID" },
  { key: "applicationId", label: "Application" },
  { key: "blockerCodeQ", label: "Blocker ID" },
  { key: "releaseNameQ", label: "Release Name" },
  { key: "blockerDescriptionQ", label: "Blocker Description" },
  { key: "raisedDateQ", label: "Raised Date" },
  { key: "raisedByQ", label: "Raised By" },
  { key: "targetResolutionDateQ", label: "Target Resolution Date" },
  { key: "actualResolutionDateQ", label: "Actual Resolution Date" },
  { key: "daysOpen", label: "Days Open" },
  { key: "escalationLevel", label: "Escalation Level" },
  { key: "rootCauseQ", label: "Root Cause" },
  { key: "resolutionNotesQ", label: "Resolution Notes" },
  { key: "impactOnReleaseQ", label: "Impact on Release" },
];

export const BLOCKER_DEFAULT_HIDDEN_FILTER_KEYS: string[] = BLOCKER_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["status", "severity", "blockerType", "departmentId", "assignedToQ", "releaseCodeQ"].includes(k)
  );

/**
 * Dependencies — own schema only.
 * Default-visible: status / type / impact / release ID / depends-on release.
 */
export const DEPENDENCY_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "status", label: "Status" },
  { key: "dependencyType", label: "Dependency Type" },
  { key: "impact", label: "Impact if Blocked" },
  { key: "releaseCodeQ", label: "Release ID" },
  { key: "dependsOnCodeQ", label: "Depends On Release" },
  { key: "depCodeQ", label: "Dep ID" },
  { key: "releaseNameQ", label: "Release Name" },
  { key: "dependsOnNameQ", label: "Depends On Name" },
  { key: "notesQ", label: "Notes" },
];

export const DEPENDENCY_DEFAULT_HIDDEN_FILTER_KEYS: string[] = DEPENDENCY_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["status", "dependencyType", "impact", "releaseCodeQ", "dependsOnCodeQ"].includes(k)
  );

/**
 * Env Booking — own schema only (never reuse Releases/Calendar fields).
 * Default-visible: dept / app / env / conflict / release ID / release size.
 */
export const BOOKING_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "departmentId", label: "Department" },
  { key: "applicationId", label: "Application" },
  { key: "environmentId", label: "Environment" },
  { key: "conflictFlag", label: "Conflict Flag" },
  { key: "releaseCodeQ", label: "Release ID" },
  { key: "releaseSize", label: "Release Size" },
  { key: "bookingCodeQ", label: "Booking ID" },
  { key: "dependenciesQ", label: "Dependencies" },
  { key: "prodReleaseDateQ", label: "Prod Release Date" },
  { key: "cabDateQ", label: "CAB Date" },
  { key: "testEnvCodeQ", label: "Test Env" },
  { key: "testStartQ", label: "Test Start" },
  { key: "testEndQ", label: "Test End" },
  { key: "testDays", label: "Test Days" },
  { key: "uatEnvCodeQ", label: "UAT Env" },
  { key: "uatStartQ", label: "UAT Start" },
  { key: "uatEndQ", label: "UAT End" },
  { key: "uatDays", label: "UAT Days" },
  { key: "preProdEnvCodeQ", label: "Pre-Prod Env" },
  { key: "preProdStartQ", label: "Pre-Prod Start" },
  { key: "preProdEndQ", label: "Pre-Prod End" },
  { key: "preProdDays", label: "Pre-Prod Days" },
  { key: "notesQ", label: "Notes" },
];

export const BOOKING_DEFAULT_HIDDEN_FILTER_KEYS: string[] = BOOKING_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      ![
        "departmentId",
        "applicationId",
        "environmentId",
        "conflictFlag",
        "releaseCodeQ",
        "releaseSize",
      ].includes(k)
  );

/**
 * Versions & Config (Environments) — own schema only.
 * Default-visible: application / department / environment / status / version / env owner.
 * App ID column is a display-only sequential label — filter via Application instead.
 */
export const ENVIRONMENT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "applicationId", label: "Application" },
  { key: "departmentId", label: "Department" },
  { key: "environmentName", label: "Environment" },
  { key: "status", label: "Status" },
  { key: "versionQ", label: "Version" },
  { key: "envOwnerQ", label: "Env Owner" },
  { key: "buildNumberQ", label: "Build Number" },
  { key: "deployDateQ", label: "Deploy Date" },
  { key: "deployedByQ", label: "Deployed By" },
  { key: "notesQ", label: "Notes" },
];

export const ENVIRONMENT_DEFAULT_HIDDEN_FILTER_KEYS: string[] = ENVIRONMENT_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      ![
        "applicationId",
        "departmentId",
        "environmentName",
        "status",
        "versionQ",
        "envOwnerQ",
      ].includes(k)
  );

/**
 * Planned Maintenance — own schema only.
 * Default-visible: type / approval / application / environment / impact / requestor.
 * `departmentName` dropped from Manage Filters (not a table column).
 */
export const PLANNED_MAINTENANCE_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "type", label: "Type" },
  { key: "approvalStatus", label: "Approval status" },
  { key: "applicationId", label: "Application" },
  { key: "environmentName", label: "Environment" },
  { key: "impact", label: "Impact" },
  { key: "requestorQ", label: "Requestor" },
  { key: "scheduledQ", label: "Scheduled" },
  { key: "notesQ", label: "Notes" },
];

export const PLANNED_MAINTENANCE_DEFAULT_HIDDEN_FILTER_KEYS: string[] = PLANNED_MAINTENANCE_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      ![
        "type",
        "approvalStatus",
        "applicationId",
        "environmentName",
        "impact",
        "requestorQ",
      ].includes(k)
  );

/**
 * Integration Flows — own schema only.
 * Default-visible: integration type / frequency / source / target / business purpose.
 */
export const INTEGRATION_FLOW_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "integrationType", label: "Integration Type" },
  { key: "frequency", label: "Frequency" },
  { key: "sourceSystemQ", label: "Source System" },
  { key: "targetSystemQ", label: "Target System" },
  { key: "businessPurposeQ", label: "Business Purpose" },
  { key: "dataElementsQ", label: "Data Elements" },
  { key: "flowCodeQ", label: "Flow ID" },
];

export const INTEGRATION_FLOW_DEFAULT_HIDDEN_FILTER_KEYS: string[] = INTEGRATION_FLOW_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      ![
        "integrationType",
        "frequency",
        "sourceSystemQ",
        "targetSystemQ",
        "businessPurposeQ",
      ].includes(k)
  );

/**
 * Applications (master data) — own schema only.
 * Default-visible: department / type / criticality / product owner / tech lead.
 * Toolbar `q` remains for quick search; dedicated owner fields are text → live data.
 */
export const APPLICATION_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "departmentId", label: "Department" },
  { key: "type", label: "Type" },
  { key: "criticality", label: "Criticality" },
  { key: "productOwnerQ", label: "Product Owner" },
  { key: "techLeadQ", label: "Tech Lead" },
  { key: "nameQ", label: "Application" },
  { key: "envCount", label: "Environments" },
];

export const APPLICATION_DEFAULT_HIDDEN_FILTER_KEYS: string[] = APPLICATION_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) =>
      !["departmentId", "type", "criticality", "productOwnerQ", "techLeadQ"].includes(k)
  );

/**
 * Users — own schema only.
 * Default-visible: department / role / access / status / name.
 */
export const USER_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "department", label: "Department" },
  { key: "role", label: "Role" },
  { key: "accessLevel", label: "Access level" },
  { key: "status", label: "Status" },
  { key: "nameQ", label: "Name" },
  { key: "emailQ", label: "Email" },
  { key: "lastLoginQ", label: "Last Login" },
];

export const USER_DEFAULT_HIDDEN_FILTER_KEYS: string[] = USER_FILTER_FIELDS
  .map((f) => f.key)
  .filter(
    (k) => !["department", "role", "accessLevel", "status", "nameQ"].includes(k)
  );

/**
 * Risk Factors — own schema only (5 columns).
 * Default-visible: category / active / factor name / weight.
 */
export const RISK_FACTOR_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "category", label: "Category" },
  { key: "active", label: "Active" },
  { key: "factorNameQ", label: "Factor Name" },
  { key: "weight", label: "Weight" },
  { key: "descriptionQ", label: "Description" },
];

export const RISK_FACTOR_DEFAULT_HIDDEN_FILTER_KEYS: string[] = RISK_FACTOR_FILTER_FIELDS
  .map((f) => f.key)
  .filter((k) => !["category", "active", "factorNameQ", "weight"].includes(k));

/**
 * Reference Data — own schema only (3 columns + category sidebar).
 * Default-visible: all three (small page).
 */
export const REFERENCE_DATA_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "active", label: "Active" },
  { key: "valueQ", label: "Value" },
  { key: "sortOrder", label: "Sort Order" },
];

export const REFERENCE_DATA_DEFAULT_HIDDEN_FILTER_KEYS: string[] = [];

/**
 * Departments — own schema only (3 columns).
 * Default-visible: all three.
 */
export const DEPARTMENT_FILTER_FIELDS: FilterFieldDef[] = [
  { key: "nameQ", label: "Department" },
  { key: "headQ", label: "Head" },
  { key: "applicationCount", label: "Applications" },
];

export const DEPARTMENT_DEFAULT_HIDDEN_FILTER_KEYS: string[] = [];

export const CALENDAR_TABLE_FILTER_FIELDS: FilterFieldDef[] = [];
