import type { SortDirection } from "@/lib/table-sort";

export type TableSortPreset = {
  id: string;
  label: string;
  sort: string;
  sortDir: SortDirection;
};

export const RELEASE_TABLE_SORT_PRESETS: TableSortPreset[] = [
  { id: "newest", label: "Newest first", sort: "endDate", sortDir: "desc" },
  { id: "oldest", label: "Oldest first", sort: "endDate", sortDir: "asc" },
  { id: "cab-newest", label: "CAB date — newest", sort: "cabDate", sortDir: "desc" },
  { id: "priority-high", label: "Highest priority", sort: "priority", sortDir: "desc" },
  { id: "release-az", label: "Release ID (A → Z)", sort: "releaseCode", sortDir: "asc" },
  { id: "blockers-most", label: "Most blockers", sort: "blockers", sortDir: "desc" },
];

export const INCIDENT_SORT_PRESETS: TableSortPreset[] = [
  { id: "newest", label: "Newest first", sort: "timestamp", sortDir: "desc" },
  { id: "oldest", label: "Oldest first", sort: "timestamp", sortDir: "asc" },
  { id: "severity", label: "Severity", sort: "severity", sortDir: "asc" },
  { id: "status", label: "Status", sort: "status", sortDir: "asc" },
];

export const DRIFT_SORT_PRESETS: TableSortPreset[] = [
  { id: "newest", label: "Newest detected", sort: "detected", sortDir: "desc" },
  { id: "oldest", label: "Oldest detected", sort: "detected", sortDir: "asc" },
  { id: "severity", label: "Highest severity", sort: "severity", sortDir: "desc" },
];

export const APPLICATION_STATUS_SORT_PRESETS: TableSortPreset[] = [
  { id: "app-az", label: "Application (A → Z)", sort: "application", sortDir: "asc" },
  { id: "uptime-low", label: "Lowest uptime", sort: "uptimePercent", sortDir: "asc" },
  { id: "uptime-high", label: "Highest uptime", sort: "uptimePercent", sortDir: "desc" },
];

export const LEAVE_SORT_PRESETS: TableSortPreset[] = [
  { id: "staff-az", label: "Staff (A → Z)", sort: "staffMember", sortDir: "asc" },
  { id: "days-high", label: "Most days", sort: "days", sortDir: "desc" },
  { id: "risk-high", label: "Highest risk", sort: "risk", sortDir: "desc" },
];

export const APPROVAL_SORT_PRESETS: TableSortPreset[] = [
  { id: "submitted-new", label: "Recently submitted", sort: "submittedDate", sortDir: "desc" },
  { id: "submitted-old", label: "Oldest submitted", sort: "submittedDate", sortDir: "asc" },
  { id: "release-az", label: "Release ID (A → Z)", sort: "releaseId", sortDir: "asc" },
];

export const MAINTENANCE_SORT_PRESETS: TableSortPreset[] = [
  { id: "soonest", label: "Soonest scheduled", sort: "scheduledDate", sortDir: "asc" },
  { id: "latest", label: "Latest scheduled", sort: "scheduledDate", sortDir: "desc" },
  { id: "impact-high", label: "Highest impact", sort: "impact", sortDir: "desc" },
];

export const INTEGRATION_FLOW_SORT_PRESETS: TableSortPreset[] = [
  { id: "flow-az", label: "Flow ID (A → Z)", sort: "flowCode", sortDir: "asc" },
  { id: "source-az", label: "Source system", sort: "sourceSystem", sortDir: "asc" },
  { id: "frequency", label: "Frequency", sort: "frequency", sortDir: "asc" },
];

export const RISK_SORT_PRESETS: TableSortPreset[] = [
  { id: "score-high", label: "Highest risk score", sort: "riskScore", sortDir: "desc" },
  { id: "score-low", label: "Lowest risk score", sort: "riskScore", sortDir: "asc" },
  { id: "status", label: "Status", sort: "status", sortDir: "asc" },
];

export const ALERT_SORT_PRESETS: TableSortPreset[] = [
  { id: "newest", label: "Newest first", sort: "timestamp", sortDir: "desc" },
  { id: "oldest", label: "Oldest first", sort: "timestamp", sortDir: "asc" },
  { id: "severity", label: "Highest severity", sort: "severity", sortDir: "asc" },
];

export const DEPENDENCY_SORT_PRESETS: TableSortPreset[] = [
  { id: "dep-az", label: "Dep ID (A → Z)", sort: "depCode", sortDir: "asc" },
  { id: "release-az", label: "Release ID (A → Z)", sort: "releaseCode", sortDir: "asc" },
  { id: "status", label: "Status", sort: "status", sortDir: "asc" },
];

export const CONFLICT_SORT_PRESETS: TableSortPreset[] = [
  { id: "conflict-az", label: "Conflict ID (A → Z)", sort: "conflictCode", sortDir: "asc" },
  { id: "priority-high", label: "Highest priority", sort: "priority", sortDir: "desc" },
  { id: "status", label: "Status", sort: "status", sortDir: "asc" },
];

export const BLOCKER_SORT_PRESETS: TableSortPreset[] = [
  { id: "blocker-az", label: "Blocker ID (A → Z)", sort: "blockerCode", sortDir: "asc" },
  { id: "severity-high", label: "Highest severity", sort: "severity", sortDir: "desc" },
  { id: "days-open", label: "Longest open", sort: "daysOpen", sortDir: "desc" },
  { id: "status", label: "Status", sort: "status", sortDir: "asc" },
];

export const BOOKING_SORT_PRESETS: TableSortPreset[] = [
  { id: "prod-soon", label: "Soonest prod date", sort: "prodReleaseDate", sortDir: "asc" },
  { id: "prod-latest", label: "Latest prod date", sort: "prodReleaseDate", sortDir: "desc" },
  { id: "cab-soon", label: "Soonest CAB", sort: "cabDate", sortDir: "asc" },
];

export const CALENDAR_SORT_PRESETS: TableSortPreset[] = [
  { id: "date-asc", label: "Date — oldest first", sort: "date", sortDir: "asc" },
  { id: "date-desc", label: "Date — newest first", sort: "date", sortDir: "desc" },
  { id: "release-az", label: "Release ID (A → Z)", sort: "releaseCode", sortDir: "asc" },
  { id: "app-az", label: "Application (A → Z)", sort: "application", sortDir: "asc" },
];

export const DEPARTMENT_SORT_PRESETS: TableSortPreset[] = [
  { id: "name-az", label: "Name (A → Z)", sort: "name", sortDir: "asc" },
  { id: "name-za", label: "Name (Z → A)", sort: "name", sortDir: "desc" },
  { id: "apps-high", label: "Most applications", sort: "applicationCount", sortDir: "desc" },
];

export const APPLICATION_SORT_PRESETS: TableSortPreset[] = [
  { id: "name-az", label: "Name (A → Z)", sort: "name", sortDir: "asc" },
  { id: "criticality", label: "Highest criticality", sort: "criticality", sortDir: "desc" },
  { id: "dept-az", label: "Department (A → Z)", sort: "department", sortDir: "asc" },
];

export const USER_SORT_PRESETS: TableSortPreset[] = [
  { id: "name-az", label: "Name (A → Z)", sort: "name", sortDir: "asc" },
  { id: "role-az", label: "Role (A → Z)", sort: "role", sortDir: "asc" },
  { id: "login-new", label: "Recent login", sort: "lastLogin", sortDir: "desc" },
];

export const RISK_FACTOR_SORT_PRESETS: TableSortPreset[] = [
  { id: "category-az", label: "Category (A → Z)", sort: "category", sortDir: "asc" },
  { id: "weight-high", label: "Highest weight", sort: "weight", sortDir: "desc" },
];

export const REFERENCE_DATA_SORT_PRESETS: TableSortPreset[] = [
  { id: "value-az", label: "Value (A → Z)", sort: "value", sortDir: "asc" },
  { id: "order-asc", label: "Sort order", sort: "sortOrder", sortDir: "asc" },
];

export const ENVIRONMENT_SORT_PRESETS: TableSortPreset[] = [
  { id: "app-az", label: "Application (A → Z)", sort: "application", sortDir: "asc" },
  { id: "app-za", label: "Application (Z → A)", sort: "application", sortDir: "desc" },
  { id: "deploy-new", label: "Newest deploy", sort: "deployDate", sortDir: "desc" },
  { id: "deploy-old", label: "Oldest deploy", sort: "deployDate", sortDir: "asc" },
  { id: "env-az", label: "Environment (A → Z)", sort: "environment", sortDir: "asc" },
  { id: "status", label: "Status", sort: "status", sortDir: "asc" },
];
