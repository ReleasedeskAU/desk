/**
 * URL-driven table filter utilities shared across list pages.
 * Release-family pages (releases, calendar) use ReleaseFiltersContext instead,
 * but reuse param names defined here where they overlap (dept/app/env).
 */

export type FilterFieldDef = {
  /** Internal key used in hook state */
  key: string;
  /** URL query parameter name */
  param: string;
};

export type FilterSchema = FilterFieldDef[];

export type FilterValues = Record<string, string>;

export function valuesFromSearchParams(sp: URLSearchParams, schema: FilterSchema): FilterValues {
  const values: FilterValues = {};
  if (!Array.isArray(schema)) return values;
  for (const field of schema) {
    values[field.key] = sp.get(field.param) ?? "";
  }
  // Support both ?dir= and legacy ?sortDir=
  if (!values.sortDir && sp.get("sortDir")) {
    values.sortDir = sp.get("sortDir") ?? "";
  }
  return values;
}

/** Merge filter values into URL params; only touches keys owned by schema. */
export function valuesToSearchParams(
  values: FilterValues,
  schema: FilterSchema,
  base?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? "");
  if (!Array.isArray(schema)) return params;
  for (const field of schema) {
    params.delete(field.param);
    const v = values[field.key]?.trim();
    if (v) params.set(field.param, v);
  }
  return params;
}

export function hasActiveFilterValues(values: FilterValues): boolean {
  return Object.entries(values).some(([k, v]) => v.trim() !== "" && k !== "sort" && k !== "sortDir" && k !== "dir");
}

export const TABLE_SORT_SCHEMA: FilterSchema = [
  { key: "sort", param: "sort" },
  { key: "sortDir", param: "dir" },
];

export function withTableSort(schema: FilterSchema): FilterSchema {
  const keys = new Set(schema.map((f) => f.key));
  const merged = [...schema];
  for (const field of TABLE_SORT_SCHEMA) {
    if (!keys.has(field.key)) merged.push(field);
  }
  return merged;
}

export function buildFilterQueryString(values: FilterValues, schema: FilterSchema): string {
  const params = valuesToSearchParams(values, schema);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function appendFilterValuesToUrl(url: string, values: FilterValues, schema: FilterSchema): string {
  const extra = valuesToSearchParams(values, schema);
  if (!extra.toString()) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${extra.toString()}`;
}

/** Shared param names — same as ReleaseFiltersContext */
export const SHARED_DEPT_PARAM = "dept";
export const SHARED_APP_PARAM = "app";
export const SHARED_ENV_PARAM = "env";

export const SELECT_CLASS =
  "h-9 rounded-lg border border-gray-300 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] px-3 py-1 text-sm text-gray-700 dark:text-white shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50";

// --- Per-page filter schemas (param names are the URL contract) ---

export const DEPENDENCIES_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "status", param: "status" },
  { key: "dependencyType", param: "type" },
  { key: "impact", param: "impact" },
  { key: "releaseCodeQ", param: "release" },
  { key: "dependsOnCodeQ", param: "dependsOn" },
  { key: "depCodeQ", param: "depCode" },
  { key: "releaseNameQ", param: "releaseName" },
  { key: "dependsOnNameQ", param: "dependsOnName" },
  { key: "notesQ", param: "notes" },
]);

export const CONFLICTS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "departmentId", param: "dept" },
  { key: "applicationId", param: "app" },
  { key: "status", param: "status" },
  { key: "priority", param: "priority" },
  { key: "assignedToQ", param: "assignedTo" },
  { key: "conflictCodeQ", param: "conflictId" },
  // Preserve links created before Conflict ID adopted the shared URL naming convention.
  { key: "legacyConflictCodeQ", param: "conflictCode" },
  { key: "release1CodeQ", param: "release1" },
  { key: "release2CodeQ", param: "release2" },
  { key: "conflictingEnvironmentQ", param: "conflictEnv" },
  { key: "environmentConflictType", param: "conflictType" },
  { key: "notesQ", param: "notes" },
]);

export const BLOCKERS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "status", param: "status" },
  { key: "severity", param: "severity" },
  { key: "blockerType", param: "type" },
  { key: "departmentId", param: "dept" },
  { key: "applicationId", param: "app" },
  { key: "assignedToQ", param: "assignedTo" },
  { key: "releaseCodeQ", param: "release" },
  { key: "blockerCodeQ", param: "blockerId" },
  { key: "releaseNameQ", param: "releaseName" },
  { key: "blockerDescriptionQ", param: "description" },
  { key: "raisedDateQ", param: "raised" },
  { key: "raisedByQ", param: "raisedBy" },
  { key: "targetResolutionDateQ", param: "targetResolution" },
  { key: "actualResolutionDateQ", param: "actualResolution" },
  { key: "daysOpenMin", param: "daysOpenMin" },
  { key: "daysOpenMax", param: "daysOpenMax" },
  { key: "escalationLevel", param: "escalation" },
  { key: "rootCauseQ", param: "rootCause" },
  { key: "resolutionNotesQ", param: "resolutionNotes" },
  { key: "impactOnReleaseQ", param: "impact" },
]);

export const BOOKING_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "departmentId", param: "dept" },
  { key: "applicationId", param: "app" },
  { key: "environmentId", param: "env" },
  { key: "conflictFlag", param: "conflict" },
  { key: "releaseCodeQ", param: "release" },
  { key: "releaseSize", param: "releaseSize" },
  { key: "bookingCodeQ", param: "bookingCode" },
  { key: "dependenciesQ", param: "dependencies" },
  { key: "prodReleaseDateQ", param: "prodDate" },
  { key: "cabDateQ", param: "cabDate" },
  { key: "testEnvCodeQ", param: "testEnv" },
  { key: "testStartQ", param: "testStart" },
  { key: "testEndQ", param: "testEnd" },
  { key: "testDaysMin", param: "testDaysMin" },
  { key: "testDaysMax", param: "testDaysMax" },
  { key: "uatEnvCodeQ", param: "uatEnv" },
  { key: "uatStartQ", param: "uatStart" },
  { key: "uatEndQ", param: "uatEnd" },
  { key: "uatDaysMin", param: "uatDaysMin" },
  { key: "uatDaysMax", param: "uatDaysMax" },
  { key: "preProdEnvCodeQ", param: "preProdEnv" },
  { key: "preProdStartQ", param: "preProdStart" },
  { key: "preProdEndQ", param: "preProdEnd" },
  { key: "preProdDaysMin", param: "preProdDaysMin" },
  { key: "preProdDaysMax", param: "preProdDaysMax" },
  { key: "notesQ", param: "notes" },
  { key: "environmentConflictIdQ", param: "envConflictId" },
]);

export const APPROVALS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "decision", param: "decision" },
  { key: "approvalType", param: "type" },
  { key: "approverQ", param: "approver" },
  { key: "releaseCodeQ", param: "release" },
  { key: "releaseNameQ", param: "releaseName" },
  { key: "approvalCodeQ", param: "approvalCode" },
  { key: "approverRole", param: "approverRole" },
  { key: "submittedDateQ", param: "submitted" },
  { key: "decisionDateQ", param: "decided" },
  { key: "commentsQ", param: "comments" },
  { key: "cabMeetingIdQ", param: "cab" },
  { key: "applicationQ", param: "application" },
  { key: "departmentQ", param: "department" },
]);

export const SIGNOFFS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "status", param: "status" },
  { key: "signoffType", param: "type" },
  { key: "required", param: "required" },
  { key: "releaseCodeQ", param: "release" },
  { key: "releaseNameQ", param: "releaseName" },
  { key: "signoffCodeQ", param: "signoffCode" },
  { key: "applicationQ", param: "application" },
  { key: "departmentQ", param: "department" },
  { key: "ownerQ", param: "owner" },
]);

export const LEAVES_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "leaveType", param: "type" },
  { key: "department", param: "dept" },
  { key: "riskLevel", param: "risk" },
  { key: "staffMemberQ", param: "staff" },
  { key: "affectedReleaseQ", param: "affectedRelease" },
  { key: "leaveCodeQ", param: "leaveCode" },
  { key: "datesQ", param: "dates" },
  { key: "daysMin", param: "daysMin" },
  { key: "daysMax", param: "daysMax" },
  { key: "userIdQ", param: "userId" },
  { key: "role", param: "role" },
  { key: "riskImpact", param: "riskImpact" },
  { key: "riskScoreMin", param: "riskScoreMin" },
  { key: "riskScoreMax", param: "riskScoreMax" },
]);

export const INCIDENTS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "severity", param: "severity" },
  { key: "status", param: "status" },
  { key: "applicationId", param: "app" },
  { key: "environmentName", param: "env" },
  { key: "assignedToQ", param: "assignedTo" },
  { key: "titleQ", param: "title" },
  { key: "incidentCodeQ", param: "incidentCode" },
  { key: "impact", param: "impact" },
  { key: "relatedReleaseQ", param: "relatedRelease" },
  { key: "timestampQ", param: "timestamp" },
  { key: "departmentQ", param: "department" },
]);

export const MONITORING_ALERTS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "severity", param: "severity" },
  { key: "status", param: "status" },
  { key: "applicationId", param: "app" },
  { key: "environmentName", param: "env" },
  { key: "alertType", param: "alertType" },
  { key: "assignedToQ", param: "assignedTo" },
  { key: "alertCodeQ", param: "alertCode" },
  { key: "metricQ", param: "metric" },
  { key: "thresholdQ", param: "threshold" },
  { key: "currentValueQ", param: "currentValue" },
  { key: "timestampQ", param: "timestamp" },
  { key: "departmentQ", param: "department" },
]);

export const APPLICATION_STATUS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "status", param: "status" },
  { key: "environmentName", param: "env" },
  { key: "applicationId", param: "app" },
  { key: "uptimeMin", param: "uptimeMin" },
  { key: "uptimeMax", param: "uptimeMax" },
  { key: "notesQ", param: "notes" },
  { key: "lastCheckQ", param: "lastCheck" },
  { key: "departmentQ", param: "department" },
]);

export const PLANNED_MAINTENANCE_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "type", param: "type" },
  { key: "approvalStatus", param: "approvalStatus" },
  { key: "applicationId", param: "app" },
  { key: "environmentName", param: "env" },
  { key: "impact", param: "impact" },
  { key: "requestorQ", param: "requestor" },
  { key: "scheduledQ", param: "scheduled" },
  { key: "notesQ", param: "notes" },
  { key: "maintenanceCodeQ", param: "maintenanceCode" },
  { key: "startTimeQ", param: "startTime" },
  { key: "endTimeQ", param: "endTime" },
  { key: "departmentQ", param: "department" },
]);

export const INTEGRATION_FLOWS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "integrationType", param: "type" },
  { key: "frequency", param: "frequency" },
  { key: "sourceSystemQ", param: "source" },
  { key: "targetSystemQ", param: "target" },
  { key: "dataElementsQ", param: "dataElements" },
  { key: "businessPurposeQ", param: "purpose" },
  { key: "flowCodeQ", param: "flowCode" },
]);

/** Server-supported filters for the System Mapping shared-environment inventory. */
export const SHARED_ENVIRONMENTS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "environmentCodeQ", param: "environmentCodeQ" },
  { key: "environmentType", param: "environmentType" },
  { key: "sharedByQ", param: "sharedByQ" },
  { key: "capacityQ", param: "capacityQ" },
  { key: "bookingRequirementQ", param: "bookingRequirementQ" },
  { key: "conflictRisk", param: "conflictRisk" },
]);

export const RISKS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "status", param: "status" },
  { key: "category", param: "category" },
  { key: "likelihood", param: "likelihood" },
  { key: "impact", param: "impact" },
  { key: "band", param: "band" },
  { key: "riskOwnerQ", param: "owner" },
  { key: "riskScoreMin", param: "scoreMin" },
  { key: "riskScoreMax", param: "scoreMax" },
  { key: "riskCodeQ", param: "riskCode" },
  { key: "releaseCodeQ", param: "release" },
  { key: "releaseNameQ", param: "releaseName" },
  { key: "applicationQ", param: "application" },
  { key: "departmentQ", param: "department" },
  { key: "prodDateQ", param: "prodDate" },
  { key: "daysOutMin", param: "daysOutMin" },
  { key: "daysOutMax", param: "daysOutMax" },
  { key: "descriptionQ", param: "description" },
  { key: "affectedAreaQ", param: "affectedArea" },
  { key: "mitigationStrategyQ", param: "mitigation" },
  { key: "notesQ", param: "notes" },
]);

export const DRIFTS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "driftType", param: "driftType" },
  { key: "severity", param: "severity" },
  { key: "status", param: "status" },
  { key: "applicationId", param: "app" },
  { key: "releaseCodeQ", param: "release" },
  { key: "driftCodeQ", param: "driftCode" },
  { key: "environmentName", param: "env" },
  { key: "detectedDateQ", param: "detected" },
  { key: "releaseNameQ", param: "releaseName" },
  { key: "departmentQ", param: "department" },
  { key: "category", param: "category" },
  { key: "descriptionQ", param: "description" },
  { key: "impactOnReleaseQ", param: "impact" },
  { key: "remediationActionQ", param: "remediation" },
  { key: "etaToFixQ", param: "eta" },
]);

export const RISK_FACTORS_FILTER_SCHEMA: FilterSchema = [
  { key: "q", param: "q" },
  { key: "category", param: "category" },
  { key: "active", param: "active" },
  { key: "factorNameQ", param: "factorName" },
  { key: "weightMin", param: "weightMin" },
  { key: "weightMax", param: "weightMax" },
  { key: "descriptionQ", param: "description" },
  { key: "sort", param: "sort" },
  { key: "sortDir", param: "sortDir" },
  { key: "page", param: "page" },
];

export const DEPARTMENTS_FILTER_SCHEMA: FilterSchema = [
  { key: "q", param: "q" },
  { key: "nameQ", param: "name" },
  { key: "headQ", param: "head" },
  { key: "appCountMin", param: "appMin" },
  { key: "appCountMax", param: "appMax" },
  { key: "sort", param: "sort" },
  { key: "sortDir", param: "sortDir" },
  { key: "page", param: "page" },
];

export const APPLICATIONS_FILTER_SCHEMA: FilterSchema = [
  { key: "q", param: "q" },
  { key: "departmentId", param: "dept" },
  { key: "criticality", param: "criticality" },
  { key: "type", param: "type" },
  { key: "productOwnerQ", param: "productOwner" },
  { key: "techLeadQ", param: "techLead" },
  { key: "nameQ", param: "name" },
  { key: "envCountMin", param: "envMin" },
  { key: "envCountMax", param: "envMax" },
  { key: "manageApp", param: "manageApp" },
  { key: "sort", param: "sort" },
  { key: "sortDir", param: "sortDir" },
  { key: "page", param: "page" },
];

export const USERS_FILTER_SCHEMA: FilterSchema = [
  { key: "q", param: "q" },
  { key: "department", param: "dept" },
  { key: "role", param: "role" },
  { key: "accessLevel", param: "access" },
  { key: "status", param: "status" },
  { key: "nameQ", param: "name" },
  { key: "emailQ", param: "email" },
  { key: "lastLoginQ", param: "lastLogin" },
  { key: "sort", param: "sort" },
  { key: "sortDir", param: "sortDir" },
  { key: "page", param: "page" },
];

export const ENVIRONMENTS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "applicationId", param: "app" },
  { key: "departmentId", param: "dept" },
  { key: "environmentName", param: "env" },
  { key: "status", param: "status" },
  { key: "versionQ", param: "version" },
  { key: "envOwnerQ", param: "envOwner" },
  { key: "buildNumberQ", param: "build" },
  { key: "deployDateQ", param: "deployDate" },
  { key: "deployedByQ", param: "deployedBy" },
  { key: "notesQ", param: "notes" },
]);

export const REFERENCE_DATA_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "category", param: "cat" },
  { key: "active", param: "active" },
  { key: "valueQ", param: "value" },
  { key: "sortOrderMin", param: "sortMin" },
  { key: "sortOrderMax", param: "sortMax" },
]);
