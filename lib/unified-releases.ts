import { releases as demoReleases } from "@/lib/dummy-data";
import { inPeriod, periodRange, type Period } from "@/lib/period-range";
import type { SearchResult } from "@/lib/dummy-data";

export type DataSource = "database" | "demo";

export type UnifiedRelease = {
  id: string;
  code: string;
  name: string;
  status: string;
  owner: string;
  group: string;
  date: string;
  source: DataSource;
  href: string;
  priority?: string;
  impact?: string;
  departmentName?: string;
  applicationName?: string;
  environmentName?: string;
  programProject?: string;
  dependsOnLabel?: string;
  externalDependencies?: string | null;
  releaseSize?: string | null;
  cabDate?: string | Date | null;
  startDate?: string | Date | null;
  testEnvRequired?: string | null;
  uatEnvRequired?: string | null;
  releaseHealth?: string | null;
  conflictFlag?: boolean;
  conflictId?: string | null;
  conflictingRelease?: string | null;
  conflictType?: string | null;
  conflictNotes?: string | null;
  readinessPercent?: number | null;
  blockers?: string | null;
  vendorMaintenance?: string | null;
  changeFreeze?: string | null;
  regulatory?: string | null;
  releaseOwnerId?: string | null;
  approvalStatus?: string | null;
  rollbackPlan?: string | null;
  goLiveChecklistPercent?: number | null;
  deploymentWindow?: string | null;
  stakeholderIds?: string;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
  dressRehearsal?: string | null;
  hypercarePlan?: string | null;
  commsPlan?: string | null;
  trainingStatus?: string | null;
};

type DbRelease = {
  id: string;
  releaseCode: string;
  name: string;
  programProject?: string | null;
  status: string;
  owner: string;
  releaseDate: string | Date;
  priority: string;
  impact: string;
  department: { name: string };
  applications?: { application: { name: string } }[];
  bookings?: { environment?: { name: string } | null; application?: { name: string } }[];
  dependsOn?: { dependsOnRelease: { releaseCode: string; name: string } }[];
  stakeholders?: { user: { userId: string } }[];
  releaseOwner?: { userId: string } | null;
  externalDependencies?: string | null;
  releaseSize?: string | null;
  cabDate?: string | Date | null;
  startDate?: string | Date | null;
  testEnvRequired?: string | null;
  uatEnvRequired?: string | null;
  releaseHealth?: string | null;
  conflictFlag?: boolean;
  conflictId?: string | null;
  conflictingRelease?: string | null;
  conflictType?: string | null;
  conflictNotes?: string | null;
  readinessPercent?: number | null;
  blockers?: string | null;
  vendorMaintenance?: string | null;
  changeFreeze?: string | null;
  regulatory?: string | null;
  releaseOwnerId?: string | null;
  approvalStatus?: string | null;
  rollbackPlan?: string | null;
  goLiveChecklistPercent?: number | null;
  deploymentWindow?: string | null;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
  dressRehearsal?: string | null;
  hypercarePlan?: string | null;
  commsPlan?: string | null;
  trainingStatus?: string | null;
};

/** Maps synthetic demo teams to Release Desk department names. */
export const DEMO_TEAM_DEPARTMENT: Record<string, string> = {
  Platform: "Platform",
  Billing: "FIN",
  Search: "CRM",
  Payments: "Platform",
  Core: "Platform",
  Identity: "Security",
  Mobile: "CRM",
  Data: "Operations",
};

/** Primary applications touched by each demo team (for app/env filters). */
export const DEMO_TEAM_APPLICATIONS: Record<string, string[]> = {
  Platform: ["SAP"],
  Billing: ["FIN"],
  Search: ["CRM"],
  Payments: ["SAP"],
  Core: ["SAP"],
  Identity: ["SAP"],
  Mobile: ["CRM"],
  Data: ["Oracle"],
};

export function demoToUnified(r: (typeof demoReleases)[0]): UnifiedRelease {
  const apps = DEMO_TEAM_APPLICATIONS[r.team] ?? [];
  const idx = parseInt(r.id.replace(/\D/g, ""), 10) || 0;
  const levels = ["High", "Medium", "Low"] as const;
  return {
    id: r.id,
    code: r.version,
    name: r.name,
    status: r.status,
    owner: r.owner,
    group: r.team,
    date: r.targetDate,
    source: "demo",
    href: `/releases/${r.id}`,
    departmentName: DEMO_TEAM_DEPARTMENT[r.team] ?? r.team,
    applicationName: apps.join(", ") || "—",
    environmentName: "PROD",
    programProject: idx % 4 === 0 ? "N/A" : `${r.team} Program`,
    priority: levels[idx % 3],
    impact: levels[(idx + 1) % 3],
    dependsOnLabel: r.dependsOnServices?.length ? r.dependsOnServices.join(", ") : "—",
  };
}

export function dbToUnified(r: DbRelease): UnifiedRelease {
  const appNames =
    r.applications?.map((a) => a.application.name).filter(Boolean) ?? [];
  const bookingEnv = r.bookings?.find((b) => b.environment?.name)?.environment?.name;
  const deps =
    r.dependsOn?.map((d) => d.dependsOnRelease.releaseCode).filter(Boolean) ?? [];

  return {
    id: r.id,
    code: r.releaseCode,
    name: r.name,
    status: r.status,
    owner: r.owner,
    group: r.department.name,
    date: typeof r.releaseDate === "string" ? r.releaseDate : r.releaseDate.toISOString(),
    source: "database",
    href: `/releases/${r.id}`,
    priority: r.priority,
    impact: r.impact,
    programProject: r.programProject ?? "—",
    departmentName: r.department.name,
    applicationName: appNames.length ? appNames.join(", ") : "—",
    environmentName: bookingEnv ?? "—",
    dependsOnLabel: deps.length ? deps.join(", ") : "—",
    externalDependencies: r.externalDependencies ?? null,
    releaseSize: r.releaseSize,
    cabDate: r.cabDate,
    startDate: r.startDate,
    testEnvRequired: r.testEnvRequired,
    uatEnvRequired: r.uatEnvRequired,
    releaseHealth: r.releaseHealth ?? null,
    conflictFlag: r.conflictFlag,
    conflictId: r.conflictId ?? null,
    conflictingRelease: r.conflictingRelease ?? null,
    conflictType: r.conflictType ?? null,
    conflictNotes: r.conflictNotes ?? null,
    readinessPercent: r.readinessPercent,
    blockers: r.blockers,
    vendorMaintenance: r.vendorMaintenance,
    changeFreeze: r.changeFreeze,
    regulatory: r.regulatory,
    releaseOwnerId: r.releaseOwner?.userId ?? null,
    approvalStatus: r.approvalStatus,
    rollbackPlan: r.rollbackPlan,
    goLiveChecklistPercent: r.goLiveChecklistPercent,
    deploymentWindow: r.deploymentWindow,
    stakeholderIds: r.stakeholders?.map((s) => s.user.userId).join(",") ?? "—",
    devSignoff: r.devSignoff ?? null,
    testSignoff: r.testSignoff ?? null,
    uatSignoff: r.uatSignoff ?? null,
    securityClearance: r.securityClearance ?? null,
    dressRehearsal: r.dressRehearsal ?? null,
    hypercarePlan: r.hypercarePlan ?? null,
    commsPlan: r.commsPlan ?? null,
    trainingStatus: r.trainingStatus ?? null,
  };
}

export function getDemoReleasesInPeriod(period: Period, anchor = new Date()): UnifiedRelease[] {
  return demoReleases
    .filter((r) => inPeriod(r.targetDate, period, anchor))
    .map(demoToUnified)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function mergeReleases(db: UnifiedRelease[], demo: UnifiedRelease[]): UnifiedRelease[] {
  const seen = new Set<string>();
  const merged: UnifiedRelease[] = [];
  for (const r of [...db, ...demo].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    const key = `${r.source}:${r.code.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
  return merged;
}

type StatusBucket = "planned" | "inProgress" | "blocked" | "atRisk" | "shipped";

/** Maps demo + workbook release statuses into dashboard tile buckets. */
export function bucketReleaseStatus(status: string): StatusBucket {
  switch (status) {
    case "Blocked":
      return "blocked";
    case "At Risk":
      return "atRisk";
    case "Draft":
    case "Planning":
    case "Planned":
    case "Scheduled":
      return "planned";
    case "Approved":
    case "Pending CAB":
    case "Testing":
    case "In Progress":
    case "Ready":
      return "inProgress";
    case "Shipped":
    case "Complete":
    case "Completed":
      return "shipped";
    default:
      return "planned";
  }
}

export function countByStatus(rows: Array<{ status: string }>) {
  const counts = {
    planned: 0,
    inProgress: 0,
    blocked: 0,
    atRisk: 0,
    shipped: 0,
    total: rows.length,
  };
  for (const r of rows) {
    counts[bucketReleaseStatus(r.status)]++;
  }
  return counts;
}

export function dbReleaseToSearchResult(r: {
  id: string;
  releaseCode: string;
  name: string;
  status: string;
  department: { name: string };
}): SearchResult {
  return {
    id: `db-rel-${r.id}`,
    type: "release",
    label: `${r.releaseCode} — ${r.name}`,
    sublabel: `${r.department.name} · ${r.status} · Database`,
    href: `/releases/${r.id}`,
  };
}

export function demoReleaseMatchesQuery(r: (typeof demoReleases)[0], q: string) {
  const lower = q.toLowerCase();
  return (
    r.version.toLowerCase().includes(lower) ||
    r.name.toLowerCase().includes(lower) ||
    r.team.toLowerCase().includes(lower) ||
    r.owner.toLowerCase().includes(lower) ||
    r.id.toLowerCase().includes(lower)
  );
}

export type ReleaseListFilters = {
  departmentId?: string;
  applicationId?: string;
  environmentId?: string;
};

export function demoReleaseMatchesFilters(
  r: (typeof demoReleases)[0],
  filters: ReleaseListFilters,
  departments: { id: string; name: string }[],
  applications: { id: string; name: string }[],
  environments: { id: string; application: { name: string } }[]
): boolean {
  if (filters.departmentId) {
    const dept = departments.find((d) => d.id === filters.departmentId);
    if (!dept) return false;
    const mapped = DEMO_TEAM_DEPARTMENT[r.team] ?? r.team;
    if (mapped !== dept.name && r.team !== dept.name) return false;
  }
  if (filters.applicationId) {
    const app = applications.find((a) => a.id === filters.applicationId);
    if (!app) return false;
    const names = DEMO_TEAM_APPLICATIONS[r.team] ?? [];
    if (!names.includes(app.name)) return false;
  }
  if (filters.environmentId) {
    const env = environments.find((e) => e.id === filters.environmentId);
    if (!env) return false;
    const names = DEMO_TEAM_APPLICATIONS[r.team] ?? [];
    if (!names.includes(env.application.name)) return false;
  }
  return true;
}

export { periodRange, type Period };
