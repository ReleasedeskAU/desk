import { releases as demoReleases } from "./dummy-data";
import {
  DEMO_TEAM_APPLICATIONS,
  DEMO_TEAM_DEPARTMENT,
  demoReleaseMatchesFilters,
  type UnifiedRelease,
} from "./unified-releases";

/** Filters that ship visible by default (existing Releases UX). */
export const RELEASE_DEFAULT_VISIBLE_FILTER_KEYS = [
  "departmentId",
  "applicationId",
  "environmentId",
  "status",
  "priority",
  "impact",
] as const;

export type ReleaseListFilters = {
  departmentId: string;
  applicationId: string;
  environmentId: string;
  status: string;
  priority: string;
  impact: string;
  // Low-cardinality enums
  approvalStatus: string;
  rollbackPlan: string;
  deploymentWindow: string;
  changeFreeze: string;
  regulatory: string;
  vendorMaintenance: string;
  releaseSize: string;
  releaseHealth: string;
  devSignoff: string;
  testSignoff: string;
  uatSignoff: string;
  securityClearance: string;
  dressRehearsal: string;
  hypercarePlan: string;
  commsPlan: string;
  trainingStatus: string;
  conflictType: string;
  // Numeric ranges (empty = unset)
  readinessMin: string;
  readinessMax: string;
  goLiveMin: string;
  goLiveMax: string;
  // Boolean / presence: "" | "1" | "0"
  conflictFlag: string;
  hasBlockers: string;
  hasDependsOn: string;
  // Free-text contains
  releaseCodeQ: string;
  nameQ: string;
  externalDependenciesQ: string;
  notesQ: string;
  conflictIdQ: string;
  conflictingReleaseQ: string;
  conflictNotesQ: string;
  // Dates (YYYY / YYYY-MM / YYYY-MM-DD) + env-flag text
  cabDateQ: string;
  startDateQ: string;
  endDateQ: string;
  testEnvRequiredQ: string;
  uatEnvRequiredQ: string;
  // High-cardinality linked
  releaseOwnerId: string;
  stakeholderId: string;
  // Calendar-only column filters (URL-backed; Calendar Manage Filters only)
  eventType: string;
  sizeImpact: string;
  day: string;
  dateFrom: string;
  dateTo: string;
  // Sort / calendar (unchanged)
  sort: string;
  sortDir: string;
  period: string;
  anchor: string;
  tab: string;
};

export const EMPTY_RELEASE_FILTERS: ReleaseListFilters = {
  departmentId: "",
  applicationId: "",
  environmentId: "",
  status: "",
  priority: "",
  impact: "",
  approvalStatus: "",
  rollbackPlan: "",
  deploymentWindow: "",
  changeFreeze: "",
  regulatory: "",
  vendorMaintenance: "",
  releaseSize: "",
  releaseHealth: "",
  devSignoff: "",
  testSignoff: "",
  uatSignoff: "",
  securityClearance: "",
  dressRehearsal: "",
  hypercarePlan: "",
  commsPlan: "",
  trainingStatus: "",
  conflictType: "",
  readinessMin: "",
  readinessMax: "",
  goLiveMin: "",
  goLiveMax: "",
  conflictFlag: "",
  hasBlockers: "",
  hasDependsOn: "",
  releaseCodeQ: "",
  nameQ: "",
  externalDependenciesQ: "",
  notesQ: "",
  conflictIdQ: "",
  conflictingReleaseQ: "",
  conflictNotesQ: "",
  cabDateQ: "",
  startDateQ: "",
  endDateQ: "",
  testEnvRequiredQ: "",
  uatEnvRequiredQ: "",
  releaseOwnerId: "",
  stakeholderId: "",
  eventType: "",
  sizeImpact: "",
  day: "",
  dateFrom: "",
  dateTo: "",
  sort: "",
  sortDir: "",
  period: "",
  anchor: "",
  tab: "",
};

/** URL param ↔ filter key (excludes sort/period which are not Manage Filters fields). */
export const RELEASE_FILTER_URL_MAP: { key: keyof ReleaseListFilters; param: string }[] = [
  { key: "departmentId", param: "dept" },
  { key: "applicationId", param: "app" },
  { key: "environmentId", param: "env" },
  { key: "status", param: "status" },
  { key: "priority", param: "priority" },
  { key: "impact", param: "impact" },
  { key: "approvalStatus", param: "approvalStatus" },
  { key: "rollbackPlan", param: "rollbackPlan" },
  { key: "deploymentWindow", param: "deploymentWindow" },
  { key: "changeFreeze", param: "changeFreeze" },
  { key: "regulatory", param: "regulatory" },
  { key: "vendorMaintenance", param: "vendorMaintenance" },
  { key: "releaseSize", param: "releaseSize" },
  { key: "releaseHealth", param: "releaseHealth" },
  { key: "devSignoff", param: "devSignoff" },
  { key: "testSignoff", param: "testSignoff" },
  { key: "uatSignoff", param: "uatSignoff" },
  { key: "securityClearance", param: "securityClearance" },
  { key: "dressRehearsal", param: "dressRehearsal" },
  { key: "hypercarePlan", param: "hypercarePlan" },
  { key: "commsPlan", param: "commsPlan" },
  { key: "trainingStatus", param: "trainingStatus" },
  { key: "conflictType", param: "conflictType" },
  { key: "readinessMin", param: "readinessMin" },
  { key: "readinessMax", param: "readinessMax" },
  { key: "goLiveMin", param: "goLiveMin" },
  { key: "goLiveMax", param: "goLiveMax" },
  { key: "conflictFlag", param: "conflict" },
  { key: "hasBlockers", param: "hasBlockers" },
  { key: "hasDependsOn", param: "hasDependsOn" },
  { key: "releaseCodeQ", param: "releaseCode" },
  { key: "nameQ", param: "name" },
  { key: "externalDependenciesQ", param: "externalDependencies" },
  { key: "notesQ", param: "notes" },
  { key: "conflictIdQ", param: "conflictId" },
  { key: "conflictingReleaseQ", param: "conflictingRelease" },
  { key: "conflictNotesQ", param: "conflictNotes" },
  { key: "cabDateQ", param: "cabDate" },
  { key: "startDateQ", param: "startDate" },
  { key: "endDateQ", param: "endDate" },
  { key: "testEnvRequiredQ", param: "testEnvRequired" },
  { key: "uatEnvRequiredQ", param: "uatEnvRequired" },
  { key: "releaseOwnerId", param: "owner" },
  { key: "stakeholderId", param: "stakeholder" },
  { key: "eventType", param: "eventType" },
  { key: "sizeImpact", param: "sizeImpact" },
  { key: "day", param: "day" },
  { key: "dateFrom", param: "dateFrom" },
  { key: "dateTo", param: "dateTo" },
];

const META_PARAMS = ["sort", "dir", "sortDir", "period", "anchor", "tab"] as const;

export function filtersFromSearchParams(sp: URLSearchParams): ReleaseListFilters {
  const base = { ...EMPTY_RELEASE_FILTERS };
  for (const { key, param } of RELEASE_FILTER_URL_MAP) {
    base[key] = sp.get(param) ?? "";
  }
  base.sort = sp.get("sort") ?? "";
  base.sortDir = sp.get("dir") ?? sp.get("sortDir") ?? "";
  base.period = sp.get("period") ?? "";
  base.anchor = sp.get("anchor") ?? "";
  base.tab = sp.get("tab") ?? "";
  return base;
}

export function filtersToSearchParams(
  filters: ReleaseListFilters,
  base?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? "");
  for (const { param } of RELEASE_FILTER_URL_MAP) params.delete(param);
  for (const key of META_PARAMS) params.delete(key);

  for (const { key, param } of RELEASE_FILTER_URL_MAP) {
    const v = filters[key]?.trim();
    if (v) params.set(param, v);
  }
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.sortDir) params.set("dir", filters.sortDir);
  if (filters.period) params.set("period", filters.period);
  if (filters.anchor) params.set("anchor", filters.anchor);
  if (filters.tab) params.set("tab", filters.tab);
  return params;
}

export function filtersQueryString(filters: ReleaseListFilters, leading = "?"): string {
  const params = filtersToSearchParams(filters);
  const s = params.toString();
  if (!s) return "";
  return leading === "?" ? `?${s}` : `&${s}`;
}

export function appendFilterQuery(url: string, filters: ReleaseListFilters): string {
  const hasQuery = url.includes("?");
  const extra = filtersToSearchParams(filters);
  if (!extra.toString()) return url;
  const sep = hasQuery ? "&" : "?";
  return `${url}${sep}${extra.toString()}`;
}

const REFINEMENT_KEYS: (keyof ReleaseListFilters)[] = [
  "departmentId",
  "applicationId",
  "environmentId",
  "status",
  "priority",
  "impact",
  "approvalStatus",
  "rollbackPlan",
  "deploymentWindow",
  "changeFreeze",
  "regulatory",
  "vendorMaintenance",
  "releaseSize",
  "releaseHealth",
  "devSignoff",
  "testSignoff",
  "uatSignoff",
  "securityClearance",
  "dressRehearsal",
  "hypercarePlan",
  "commsPlan",
  "trainingStatus",
  "conflictType",
  "readinessMin",
  "readinessMax",
  "goLiveMin",
  "goLiveMax",
  "conflictFlag",
  "hasBlockers",
  "hasDependsOn",
  "releaseCodeQ",
  "nameQ",
  "externalDependenciesQ",
  "notesQ",
  "conflictIdQ",
  "conflictingReleaseQ",
  "conflictNotesQ",
  "cabDateQ",
  "startDateQ",
  "endDateQ",
  "testEnvRequiredQ",
  "uatEnvRequiredQ",
  "releaseOwnerId",
  "stakeholderId",
  "eventType",
  "sizeImpact",
  "day",
  "dateFrom",
  "dateTo",
  "period",
  "anchor",
  "tab",
];

export function hasActiveFilters(filters: ReleaseListFilters): boolean {
  return REFINEMENT_KEYS.some((k) => !!filters[k]?.trim());
}

export type DbReleaseFilterRow = {
  id: string;
  releaseCode: string;
  name: string;
  releaseDate: string;
  status: string;
  departmentId: string;
  applications: { application: { id: string; name: string } }[];
};

export type EnvFilterRow = {
  id: string;
  name: string;
  applicationId: string;
  application: { id: string; name: string };
};

export type BookingFilterRow = {
  releaseId: string | null;
  environmentId: string | null;
  applicationId: string;
};

export function dbReleaseMatchesFilters(
  row: DbReleaseFilterRow,
  filters: ReleaseListFilters,
  bookings: BookingFilterRow[],
  environments: EnvFilterRow[]
): boolean {
  if (filters.departmentId && row.departmentId !== filters.departmentId) return false;

  const appIds = row.applications.map((a) => a.application.id);

  if (filters.applicationId && !appIds.includes(filters.applicationId)) return false;

  if (filters.environmentId) {
    const env = environments.find((e) => e.id === filters.environmentId);
    if (!env) return false;
    const booked = bookings.some(
      (b) => b.releaseId === row.id && b.environmentId === filters.environmentId
    );
    const linkedToApp = appIds.includes(env.applicationId);
    if (!booked && !linkedToApp) return false;
  }

  return true;
}

export function filterDemoReleases(
  filters: ReleaseListFilters,
  departments: { id: string; name: string }[],
  applications: { id: string; name: string }[],
  environments: EnvFilterRow[]
) {
  return demoReleases.filter((r) =>
    demoReleaseMatchesFilters(r, filters, departments, applications, environments)
  );
}

export function filterUnifiedReleases(
  rows: UnifiedRelease[],
  filters: ReleaseListFilters,
  dbRows: DbReleaseFilterRow[],
  bookings: BookingFilterRow[],
  environments: EnvFilterRow[],
  departments: { id: string; name: string }[],
  applications: { id: string; name: string }[]
): UnifiedRelease[] {
  if (!hasActiveFilters(filters)) return rows;

  return rows.filter((r) => {
    if (r.source === "database") {
      const db = dbRows.find((d) => d.id === r.id);
      return db ? dbReleaseMatchesFilters(db, filters, bookings, environments) : false;
    }
    const demo = demoReleases.find((d) => d.id === r.id);
    return demo
      ? demoReleaseMatchesFilters(demo, filters, departments, applications, environments)
      : false;
  });
}

export function filterLabel(
  filters: ReleaseListFilters,
  departments: { id: string; name: string }[],
  applications: { id: string; name: string }[],
  environments: EnvFilterRow[]
): string | null {
  if (!hasActiveFilters(filters)) return null;
  const parts: string[] = [];
  if (filters.departmentId) {
    parts.push(departments.find((d) => d.id === filters.departmentId)?.name ?? "Department");
  }
  if (filters.applicationId) {
    parts.push(applications.find((a) => a.id === filters.applicationId)?.name ?? "Application");
  }
  if (filters.environmentId) {
    const env = environments.find((e) => e.id === filters.environmentId);
    parts.push(env ? `${env.application.name} — ${env.name}` : "Environment");
  }
  if (filters.status) parts.push(filters.status);
  if (filters.priority) parts.push(filters.priority);
  if (filters.impact) parts.push(`Impact: ${filters.impact}`);
  if (filters.approvalStatus) parts.push(filters.approvalStatus);
  if (filters.conflictFlag === "1") parts.push("Conflicts");
  if (filters.conflictFlag === "0") parts.push("No conflicts");
  if (filters.hasBlockers === "1") parts.push("Has blockers");
  if (filters.hasDependsOn === "1") parts.push("Has depends-on");
  if (filters.releaseCodeQ) parts.push(`ID: ${filters.releaseCodeQ}`);
  if (filters.nameQ) parts.push(`Name: ${filters.nameQ}`);
  return parts.join(" · ") || null;
}

export { DEMO_TEAM_DEPARTMENT, DEMO_TEAM_APPLICATIONS };
