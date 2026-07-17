import type { Prisma } from "@releasedesk/database";
import {
  filtersFromSearchParams,
  type ReleaseListFilters,
} from "./release-filters";

export function sp(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

export function str(sp: URLSearchParams, key: string): string | undefined {
  const v = sp.get(key)?.trim();
  return v || undefined;
}

export function bool(sp: URLSearchParams, key: string): boolean | undefined {
  const v = sp.get(key);
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return undefined;
}

/** Optional numeric query param (allows 0). */
export function num(sp: URLSearchParams, key: string): number | undefined {
  const raw = sp.get(key)?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse free-text date query into a DateTime range for Prisma (YYYY / YYYY-MM / YYYY-MM-DD). */
export function dateTextRange(q: string | undefined): { gte: Date; lt: Date } | undefined {
  if (!q) return undefined;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q);
  if (day) {
    const start = new Date(`${day[1]}-${day[2]}-${day[3]}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start, lt: end };
  }
  const month = /^(\d{4})-(\d{2})$/.exec(q);
  if (month) {
    const start = new Date(`${month[1]}-${month[2]}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { gte: start, lt: end };
  }
  const year = /^(\d{4})$/.exec(q);
  if (year) {
    return {
      gte: new Date(`${year[1]}-01-01T00:00:00.000Z`),
      lt: new Date(`${Number(year[1]) + 1}-01-01T00:00:00.000Z`),
    };
  }
  return undefined;
}

export function intParam(sp: URLSearchParams, key: string, fallback: number): number {
  const v = parseInt(sp.get(key) ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// --- Release list (extends dept/app/env) ---

function numOrUndef(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Presence toggle: "1" = has value, "0" = empty/null. */
function presenceClause(
  flag: string,
  has: Prisma.ReleaseWhereInput,
  missing: Prisma.ReleaseWhereInput
): Prisma.ReleaseWhereInput | null {
  if (flag === "1") return has;
  if (flag === "0") return missing;
  return null;
}

export function releaseListWhere(sp: URLSearchParams): Prisma.ReleaseWhereInput {
  const filters = filtersFromSearchParams(sp);
  const parts: Prisma.ReleaseWhereInput[] = [];

  if (filters.departmentId) parts.push({ departmentId: filters.departmentId });
  if (filters.applicationId) {
    parts.push({ applications: { some: { applicationId: filters.applicationId } } });
  }
  if (filters.environmentId) {
    parts.push({
      OR: [
        { bookings: { some: { environmentId: filters.environmentId } } },
        {
          applications: {
            some: { application: { environments: { some: { id: filters.environmentId } } } },
          },
        },
      ],
    });
  }
  if (filters.status) parts.push({ status: filters.status });
  if (filters.priority) parts.push({ priority: filters.priority });
  if (filters.impact) parts.push({ impact: filters.impact });

  if (filters.approvalStatus) parts.push({ approvalStatus: filters.approvalStatus });
  if (filters.rollbackPlan) parts.push({ rollbackPlan: filters.rollbackPlan });
  if (filters.deploymentWindow) parts.push({ deploymentWindow: filters.deploymentWindow });
  if (filters.changeFreeze) parts.push({ changeFreeze: filters.changeFreeze });
  if (filters.regulatory) parts.push({ regulatory: filters.regulatory });
  if (filters.vendorMaintenance) parts.push({ vendorMaintenance: filters.vendorMaintenance });
  if (filters.releaseSize) parts.push({ releaseSize: filters.releaseSize });
  if (filters.releaseHealth) parts.push({ releaseHealth: filters.releaseHealth });
  if (filters.devSignoff) parts.push({ devSignoff: filters.devSignoff });
  if (filters.testSignoff) parts.push({ testSignoff: filters.testSignoff });
  if (filters.uatSignoff) parts.push({ uatSignoff: filters.uatSignoff });
  if (filters.securityClearance) parts.push({ securityClearance: filters.securityClearance });
  if (filters.dressRehearsal) parts.push({ dressRehearsal: filters.dressRehearsal });
  if (filters.hypercarePlan) parts.push({ hypercarePlan: filters.hypercarePlan });
  if (filters.commsPlan) parts.push({ commsPlan: filters.commsPlan });
  if (filters.trainingStatus) parts.push({ trainingStatus: filters.trainingStatus });
  if (filters.conflictType) {
    parts.push({ conflictType: { contains: filters.conflictType, mode: "insensitive" } });
  }

  const readinessMin = numOrUndef(filters.readinessMin);
  const readinessMax = numOrUndef(filters.readinessMax);
  if (readinessMin != null || readinessMax != null) {
    parts.push({
      readinessPercent: {
        ...(readinessMin != null ? { gte: readinessMin } : {}),
        ...(readinessMax != null ? { lte: readinessMax } : {}),
      },
    });
  }

  const goLiveMin = numOrUndef(filters.goLiveMin);
  const goLiveMax = numOrUndef(filters.goLiveMax);
  if (goLiveMin != null || goLiveMax != null) {
    parts.push({
      goLiveChecklistPercent: {
        ...(goLiveMin != null ? { gte: goLiveMin } : {}),
        ...(goLiveMax != null ? { lte: goLiveMax } : {}),
      },
    });
  }

  if (filters.conflictFlag === "1") parts.push({ conflictFlag: true });
  if (filters.conflictFlag === "0") parts.push({ conflictFlag: false });

  const blockersClause = presenceClause(
    filters.hasBlockers,
    { AND: [{ blockers: { not: null } }, { NOT: { blockers: "" } }] },
    { OR: [{ blockers: null }, { blockers: "" }] }
  );
  if (blockersClause) parts.push(blockersClause);

  const dependsClause = presenceClause(
    filters.hasDependsOn,
    { dependsOn: { some: {} } },
    { dependsOn: { none: {} } }
  );
  if (dependsClause) parts.push(dependsClause);

  if (filters.releaseCodeQ) {
    parts.push({ releaseCode: { contains: filters.releaseCodeQ, mode: "insensitive" } });
  }
  if (filters.nameQ) {
    parts.push({ name: { contains: filters.nameQ, mode: "insensitive" } });
  }
  if (filters.notesQ) {
    parts.push({ notes: { contains: filters.notesQ, mode: "insensitive" } });
  }
  if (filters.externalDependenciesQ) {
    parts.push({
      externalDependencies: { contains: filters.externalDependenciesQ, mode: "insensitive" },
    });
  }
  if (filters.conflictIdQ) {
    parts.push({ conflictId: { contains: filters.conflictIdQ, mode: "insensitive" } });
  }
  if (filters.conflictingReleaseQ) {
    parts.push({
      conflictingRelease: { contains: filters.conflictingReleaseQ, mode: "insensitive" },
    });
  }
  if (filters.conflictNotesQ) {
    parts.push({ conflictNotes: { contains: filters.conflictNotesQ, mode: "insensitive" } });
  }

  const cabDate = dateTextRange(filters.cabDateQ);
  if (cabDate) parts.push({ cabDate });
  const startDate = dateTextRange(filters.startDateQ);
  if (startDate) parts.push({ startDate });
  // UI "End Date" = releaseDate
  const endDate = dateTextRange(filters.endDateQ);
  if (endDate) parts.push({ releaseDate: endDate });

  if (filters.testEnvRequiredQ) {
    parts.push({ testEnvRequired: { contains: filters.testEnvRequiredQ, mode: "insensitive" } });
  }
  if (filters.uatEnvRequiredQ) {
    parts.push({ uatEnvRequired: { contains: filters.uatEnvRequiredQ, mode: "insensitive" } });
  }

  // Owner / Stakeholder: free-text name search against live User rows (not a fixed ID list).
  if (filters.releaseOwnerId) {
    const q = filters.releaseOwnerId.trim();
    parts.push({
      OR: [
        { releaseOwner: { name: { contains: q, mode: "insensitive" } } },
        // Denormalized owner display name on Release (legacy / seed rows)
        { owner: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (filters.stakeholderId) {
    const q = filters.stakeholderId.trim();
    parts.push({
      stakeholders: {
        some: { user: { name: { contains: q, mode: "insensitive" } } },
      },
    });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function releaseListOrderBy(sp: URLSearchParams): Prisma.ReleaseOrderByWithRelationInput {
  const sort = str(sp, "sort") ?? "sourceOrder";
  const dir = (str(sp, "dir") ?? str(sp, "sortDir")) === "desc" ? "desc" : "asc";
  switch (sort) {
    case "releaseId":
    case "releaseCode":
      return { releaseCode: dir };
    case "date":
    case "releaseDate":
    case "endDate":
      return { releaseDate: dir };
    case "cabDate":
      return { cabDate: dir };
    case "startDate":
      return { startDate: dir };
    case "status":
      return { status: dir };
    case "priority":
      return { priority: dir };
    case "name":
      return { name: dir };
    case "impact":
      return { impact: dir };
    case "sourceOrder":
      return { sourceOrder: dir };
    default:
      return { sourceOrder: dir };
  }
}

/** Versions & Config — EnvironmentVersion list sort from ?sort=&dir=. */
export function environmentVersionOrderBy(
  sp: URLSearchParams
): Prisma.EnvironmentVersionOrderByWithRelationInput[] {
  const sort = str(sp, "sort") ?? "sourceOrder";
  const dir = (str(sp, "dir") ?? str(sp, "sortDir")) === "desc" ? "desc" : "asc";
  switch (sort) {
    case "appId":
    case "application":
      return [{ application: { name: dir } }, { environment: { name: "asc" } }];
    case "department":
      return [{ application: { department: { name: dir } } }, { application: { name: "asc" } }];
    case "environment":
      return [{ environment: { name: dir } }, { application: { name: "asc" } }];
    case "envOwner":
      return [{ environment: { owner: dir } }];
    case "version":
      return [{ version: dir }];
    case "buildNumber":
      return [{ buildNumber: dir }];
    case "deployDate":
      return [{ deployDate: dir }];
    case "deployedBy":
      return [{ updatedBy: dir }];
    case "status":
      return [{ status: dir }];
    case "notes":
      return [{ notes: dir }];
    case "sourceOrder":
      return [{ sourceOrder: dir }];
    default:
      return [{ sourceOrder: dir }];
  }
}

// --- Bookings (live EnvBooking rows) ---

function daysRange(field: "testDays" | "uatDays" | "preProdDays", min?: number, max?: number): Prisma.EnvBookingWhereInput | null {
  if (min === undefined && max === undefined) return null;
  const range: { gte?: number; lte?: number } = {};
  if (min !== undefined) range.gte = min;
  if (max !== undefined) range.lte = max;
  return { [field]: range } as Prisma.EnvBookingWhereInput;
}

export function bookingWhere(sp: URLSearchParams): Prisma.EnvBookingWhereInput {
  const parts: Prisma.EnvBookingWhereInput[] = [];
  const dept = str(sp, "dept");
  const app = str(sp, "app");
  const env = str(sp, "env");
  const conflict = bool(sp, "conflict");
  const release = str(sp, "release");
  const releaseSize = str(sp, "releaseSize");
  const bookingCode = str(sp, "bookingCode");
  const dependencies = str(sp, "dependencies");
  const notes = str(sp, "notes");
  const testEnv = str(sp, "testEnv");
  const uatEnv = str(sp, "uatEnv");
  const preProdEnv = str(sp, "preProdEnv");

  if (dept) parts.push({ application: { departmentId: dept } });
  if (app) parts.push({ applicationId: app });
  if (env) {
    parts.push({
      OR: [
        { environmentId: env },
        { environment: { id: env } },
      ],
    });
  }
  if (conflict !== undefined) parts.push({ conflictFlag: conflict });
  if (release) {
    parts.push({
      OR: [
        { release: { releaseCode: { contains: release, mode: "insensitive" } } },
        { releaseId: release },
      ],
    });
  }
  if (releaseSize) parts.push({ releaseSize });
  if (bookingCode) parts.push({ bookingCode: { contains: bookingCode, mode: "insensitive" } });
  if (dependencies) parts.push({ dependencies: { contains: dependencies, mode: "insensitive" } });
  if (notes) parts.push({ purpose: { contains: notes, mode: "insensitive" } });
  if (testEnv) parts.push({ testEnvCode: { contains: testEnv, mode: "insensitive" } });
  if (uatEnv) parts.push({ uatEnvCode: { contains: uatEnv, mode: "insensitive" } });
  if (preProdEnv) parts.push({ preProdEnvCode: { contains: preProdEnv, mode: "insensitive" } });
  const envConflictId = str(sp, "envConflictId");
  if (envConflictId) {
    parts.push({ environmentConflictId: { contains: envConflictId, mode: "insensitive" } });
  }

  for (const [param, field] of [
    ["prodDate", "prodReleaseDate"],
    ["cabDate", "cabDate"],
    ["testStart", "testStart"],
    ["testEnd", "testEnd"],
    ["uatStart", "uatStart"],
    ["uatEnd", "uatEnd"],
    ["preProdStart", "preProdStart"],
    ["preProdEnd", "preProdEnd"],
  ] as const) {
    const range = dateTextRange(str(sp, param));
    if (range) parts.push({ [field]: range } as Prisma.EnvBookingWhereInput);
  }

  const testDays = daysRange("testDays", num(sp, "testDaysMin"), num(sp, "testDaysMax"));
  if (testDays) parts.push(testDays);
  const uatDays = daysRange("uatDays", num(sp, "uatDaysMin"), num(sp, "uatDaysMax"));
  if (uatDays) parts.push(uatDays);
  const preProdDays = daysRange("preProdDays", num(sp, "preProdDaysMin"), num(sp, "preProdDaysMax"));
  if (preProdDays) parts.push(preProdDays);

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

/** Map a live EnvBooking (+ relations) to the Env Booking table row shape. */
export function mapDbEnvBookingRow(b: {
  id: string;
  bookingCode: string | null;
  departmentName: string | null;
  dependencies: string | null;
  releaseSize: string | null;
  prodReleaseDate: Date | null;
  cabDate: Date | null;
  testEnvCode: string | null;
  testStart: Date | null;
  testEnd: Date | null;
  testDays: number | null;
  uatEnvCode: string | null;
  uatStart: Date | null;
  uatEnd: Date | null;
  uatDays: number | null;
  preProdEnvCode: string | null;
  preProdStart: Date | null;
  preProdEnd: Date | null;
  preProdDays: number | null;
  conflictFlag: boolean;
  environmentConflictId: string | null;
  purpose: string | null;
  application: { id: string; name: string; department?: { name: string } | null };
  release?: { id: string; releaseCode: string } | null;
}) {
  return {
    id: b.id,
    bookingCode: b.bookingCode,
    application: {
      id: b.application.id,
      name: b.application.name,
      department: b.application.department ? { name: b.application.department.name } : undefined,
    },
    release: b.release ? { id: b.release.id, releaseCode: b.release.releaseCode } : null,
    departmentName: b.departmentName ?? b.application.department?.name ?? null,
    dependencies: b.dependencies ?? "NA",
    releaseSize: b.releaseSize,
    prodReleaseDate: b.prodReleaseDate?.toISOString() ?? null,
    cabDate: b.cabDate?.toISOString() ?? null,
    testEnvCode: b.testEnvCode,
    testStart: b.testStart?.toISOString() ?? null,
    testEnd: b.testEnd?.toISOString() ?? null,
    testDays: b.testDays,
    uatEnvCode: b.uatEnvCode,
    uatStart: b.uatStart?.toISOString() ?? null,
    uatEnd: b.uatEnd?.toISOString() ?? null,
    uatDays: b.uatDays,
    preProdEnvCode: b.preProdEnvCode,
    preProdStart: b.preProdStart?.toISOString() ?? null,
    preProdEnd: b.preProdEnd?.toISOString() ?? null,
    preProdDays: b.preProdDays,
    conflictFlag: b.conflictFlag,
    purpose: b.purpose,
    environmentConflictId: b.environmentConflictId,
  };
}

// --- Dependencies ---

export function dependencyWhere(sp: URLSearchParams): Prisma.ReleaseDependencyWhereInput {
  const parts: Prisma.ReleaseDependencyWhereInput[] = [];
  const status = str(sp, "status");
  const type = str(sp, "type");
  if (status) parts.push({ status });
  if (type) parts.push({ dependencyType: type });
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Conflicts ---

export function conflictReleaseWhere(sp: URLSearchParams): Prisma.ReleaseWhereInput {
  const parts: Prisma.ReleaseWhereInput[] = [{ conflictFlag: true }];
  const dept = str(sp, "dept");
  const app = str(sp, "app");
  if (dept) parts.push({ departmentId: dept });
  if (app) parts.push({ applications: { some: { applicationId: app } } });
  return { AND: parts };
}

export function conflictBookingWhere(sp: URLSearchParams): Prisma.EnvBookingWhereInput {
  const parts: Prisma.EnvBookingWhereInput[] = [{ conflictFlag: true }];
  const dept = str(sp, "dept");
  const app = str(sp, "app");
  if (dept) parts.push({ application: { departmentId: dept } });
  if (app) parts.push({ applicationId: app });
  return { AND: parts };
}

// --- Approvals ---

export function approvalWhere(sp: URLSearchParams): Prisma.ApprovalWhereInput {
  const parts: Prisma.ApprovalWhereInput[] = [];
  const decision = str(sp, "decision");
  const type = str(sp, "type");
  const approver = str(sp, "approver");
  const release = str(sp, "release");
  const releaseName = str(sp, "releaseName");
  const approvalCode = str(sp, "approvalCode");
  const approverRole = str(sp, "approverRole");
  const comments = str(sp, "comments");
  const cab = str(sp, "cab");
  const submitted = dateTextRange(str(sp, "submitted"));
  const decided = dateTextRange(str(sp, "decided"));

  if (decision) parts.push({ decision });
  if (type) parts.push({ approvalType: type });
  if (approver) {
    parts.push({
      OR: [
        { approver: { name: { contains: approver, mode: "insensitive" } } },
        { approver: { userId: { contains: approver, mode: "insensitive" } } },
        { approverId: approver },
      ],
    });
  }
  if (release) {
    parts.push({
      OR: [
        { release: { releaseCode: { contains: release, mode: "insensitive" } } },
        { releaseId: release },
      ],
    });
  }
  if (releaseName) parts.push({ release: { name: { contains: releaseName, mode: "insensitive" } } });
  if (approvalCode) parts.push({ approvalCode: { contains: approvalCode, mode: "insensitive" } });
  if (approverRole) parts.push({ approver: { role: approverRole } });
  if (comments) parts.push({ comments: { contains: comments, mode: "insensitive" } });
  if (cab) parts.push({ cabMeetingId: { contains: cab, mode: "insensitive" } });
  if (submitted) parts.push({ submittedDate: submitted });
  if (decided) parts.push({ decisionDate: decided });
  const application = str(sp, "application");
  const department = str(sp, "department");
  if (application) {
    parts.push({ applicationName: { contains: application, mode: "insensitive" } });
  }
  if (department) {
    parts.push({ departmentName: { contains: department, mode: "insensitive" } });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Leaves ---

export function leaveWhere(sp: URLSearchParams): Prisma.LeaveRecordWhereInput {
  const parts: Prisma.LeaveRecordWhereInput[] = [];
  const type = str(sp, "type");
  const dept = str(sp, "dept");
  const risk = str(sp, "risk");
  const staff = str(sp, "staff");
  const affectedRelease = str(sp, "affectedRelease");
  const leaveCode = str(sp, "leaveCode");
  const dates = dateTextRange(str(sp, "dates"));
  const daysMin = num(sp, "daysMin");
  const daysMax = num(sp, "daysMax");

  if (type) parts.push({ leaveType: type });
  if (dept) parts.push({ user: { department: { contains: dept, mode: "insensitive" } } });
  if (risk === "low") parts.push({ riskScore: { lte: 3 } });
  if (risk === "medium") parts.push({ riskScore: { gt: 3, lte: 6 } });
  if (risk === "high") parts.push({ riskScore: { gt: 6 } });
  if (staff) {
    parts.push({
      OR: [
        { user: { name: { contains: staff, mode: "insensitive" } } },
        { user: { userId: { contains: staff, mode: "insensitive" } } },
      ],
    });
  }
  if (affectedRelease) {
    parts.push({
      affectedReleases: {
        some: {
          release: { releaseCode: { contains: affectedRelease, mode: "insensitive" } },
        },
      },
    });
  }
  if (leaveCode) parts.push({ leaveCode: { contains: leaveCode, mode: "insensitive" } });
  if (dates) {
    // Overlap: leave window intersects the queried day/month/year range
    parts.push({ leaveStart: { lt: dates.lt }, leaveEnd: { gte: dates.gte } });
  }
  if (daysMin !== undefined || daysMax !== undefined) {
    const range: { gte?: number; lte?: number } = {};
    if (daysMin !== undefined) range.gte = daysMin;
    if (daysMax !== undefined) range.lte = daysMax;
    parts.push({ days: range });
  }
  const userId = str(sp, "userId");
  const role = str(sp, "role");
  const riskImpact = str(sp, "riskImpact");
  const riskScoreMin = num(sp, "riskScoreMin");
  const riskScoreMax = num(sp, "riskScoreMax");
  if (userId) {
    parts.push({
      OR: [
        { user: { userId: { contains: userId, mode: "insensitive" } } },
        { userId },
      ],
    });
  }
  if (role) parts.push({ user: { role } });
  if (riskImpact) parts.push({ riskImpact: { equals: riskImpact, mode: "insensitive" } });
  if (riskScoreMin !== undefined || riskScoreMax !== undefined) {
    const range: { gte?: number; lte?: number } = {};
    if (riskScoreMin !== undefined) range.gte = riskScoreMin;
    if (riskScoreMax !== undefined) range.lte = riskScoreMax;
    parts.push({ riskScore: range });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Incidents ---

export function incidentWhere(sp: URLSearchParams): Prisma.IncidentWhereInput {
  const parts: Prisma.IncidentWhereInput[] = [];
  const severity = str(sp, "severity");
  const status = str(sp, "status");
  const app = str(sp, "app");
  const env = str(sp, "env");
  const assignedTo = str(sp, "assignedTo");
  const title = str(sp, "title");
  const incidentCode = str(sp, "incidentCode");
  const impact = str(sp, "impact");
  const relatedRelease = str(sp, "relatedRelease");
  const timestamp = dateTextRange(str(sp, "timestamp"));

  if (severity) parts.push({ severity });
  if (status) parts.push({ status });
  if (app) parts.push({ applicationId: app });
  if (env) parts.push({ environmentName: env });
  if (assignedTo) parts.push({ assignedTo: { contains: assignedTo, mode: "insensitive" } });
  if (title) parts.push({ title: { contains: title, mode: "insensitive" } });
  if (incidentCode) parts.push({ incidentCode: { contains: incidentCode, mode: "insensitive" } });
  if (impact) parts.push({ impact });
  if (relatedRelease) {
    parts.push({ relatedReleaseCode: { contains: relatedRelease, mode: "insensitive" } });
  }
  if (timestamp) parts.push({ timestamp });
  const department = str(sp, "department");
  if (department) {
    parts.push({ departmentName: { contains: department, mode: "insensitive" } });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Monitoring alerts ---

export function monitoringAlertWhere(sp: URLSearchParams): Prisma.MonitoringAlertWhereInput {
  const parts: Prisma.MonitoringAlertWhereInput[] = [];
  const severity = str(sp, "severity");
  const status = str(sp, "status");
  const app = str(sp, "app");
  const env = str(sp, "env");
  const alertType = str(sp, "alertType");
  const assignedTo = str(sp, "assignedTo");
  const alertCode = str(sp, "alertCode");
  const metric = str(sp, "metric");
  const threshold = str(sp, "threshold");
  const timestamp = dateTextRange(str(sp, "timestamp"));

  if (severity) parts.push({ severity });
  if (status) parts.push({ status });
  if (app) parts.push({ applicationId: app });
  if (env) parts.push({ environmentName: env });
  if (alertType) parts.push({ alertType });
  if (assignedTo) parts.push({ assignedTo: { contains: assignedTo, mode: "insensitive" } });
  if (alertCode) parts.push({ alertCode: { contains: alertCode, mode: "insensitive" } });
  if (metric) parts.push({ metric: { contains: metric, mode: "insensitive" } });
  if (threshold) {
    parts.push({ threshold: { contains: threshold, mode: "insensitive" } });
  }
  const currentValue = str(sp, "currentValue");
  if (currentValue) {
    parts.push({ currentValue: { contains: currentValue, mode: "insensitive" } });
  }
  if (timestamp) parts.push({ timestamp });
  const department = str(sp, "department");
  if (department) {
    parts.push({ departmentName: { contains: department, mode: "insensitive" } });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Application status ---

export function applicationStatusWhere(sp: URLSearchParams): Prisma.ApplicationStatusWhereInput {
  const parts: Prisma.ApplicationStatusWhereInput[] = [];
  const status = str(sp, "status");
  const env = str(sp, "env");
  const app = str(sp, "app");
  const notes = str(sp, "notes");
  const lastCheck = dateTextRange(str(sp, "lastCheck"));
  // UI stores uptime as 0–1 float; filter inputs are percent (0–100).
  const uptimeMinPct = num(sp, "uptimeMin");
  const uptimeMaxPct = num(sp, "uptimeMax");

  if (status) parts.push({ status });
  if (env) parts.push({ environmentName: env });
  if (app) parts.push({ applicationId: app });
  if (notes) parts.push({ notes: { contains: notes, mode: "insensitive" } });
  if (lastCheck) parts.push({ lastCheck });
  const department = str(sp, "department");
  if (department) {
    parts.push({
      application: { department: { name: { contains: department, mode: "insensitive" } } },
    });
  }
  if (uptimeMinPct !== undefined || uptimeMaxPct !== undefined) {
    const range: { gte?: number; lte?: number } = {};
    if (uptimeMinPct !== undefined) range.gte = uptimeMinPct / 100;
    if (uptimeMaxPct !== undefined) range.lte = uptimeMaxPct / 100;
    parts.push({ uptimePercent: range });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Planned maintenance ---

export function plannedMaintenanceWhere(sp: URLSearchParams): Prisma.PlannedMaintenanceWhereInput {
  const parts: Prisma.PlannedMaintenanceWhereInput[] = [];
  const type = str(sp, "type");
  const approvalStatus = str(sp, "approvalStatus");
  const app = str(sp, "app");
  const env = str(sp, "env");
  const impact = str(sp, "impact");
  const requestor = str(sp, "requestor");
  const scheduled = dateTextRange(str(sp, "scheduled"));
  const notes = str(sp, "notes");

  if (type) parts.push({ type });
  if (approvalStatus) parts.push({ approvalStatus });
  if (app) parts.push({ applicationId: app });
  if (env) parts.push({ environmentName: env });
  if (impact) parts.push({ impact });
  if (requestor) parts.push({ requestor: { contains: requestor, mode: "insensitive" } });
  if (scheduled) parts.push({ scheduledDate: scheduled });
  if (notes) parts.push({ notes: { contains: notes, mode: "insensitive" } });
  const maintenanceCode = str(sp, "maintenanceCode");
  const startTime = str(sp, "startTime");
  const endTime = str(sp, "endTime");
  const department = str(sp, "department");
  if (maintenanceCode) {
    parts.push({ maintenanceCode: { contains: maintenanceCode, mode: "insensitive" } });
  }
  if (startTime) parts.push({ startTime: { contains: startTime, mode: "insensitive" } });
  if (endTime) parts.push({ endTime: { contains: endTime, mode: "insensitive" } });
  if (department) {
    parts.push({ departmentName: { contains: department, mode: "insensitive" } });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Integration flows ---

export function integrationFlowWhere(sp: URLSearchParams): Prisma.IntegrationFlowWhereInput {
  const parts: Prisma.IntegrationFlowWhereInput[] = [];
  const integrationType = str(sp, "type");
  const frequency = str(sp, "frequency");
  const source = str(sp, "source");
  const target = str(sp, "target");
  const dataElements = str(sp, "dataElements");
  const purpose = str(sp, "purpose");
  const flowCode = str(sp, "flowCode");

  if (integrationType) parts.push({ integrationType });
  if (frequency) parts.push({ frequency });
  if (source) parts.push({ sourceSystem: { contains: source, mode: "insensitive" } });
  if (target) parts.push({ targetSystem: { contains: target, mode: "insensitive" } });
  if (dataElements) parts.push({ dataElements: { contains: dataElements, mode: "insensitive" } });
  if (purpose) parts.push({ businessPurpose: { contains: purpose, mode: "insensitive" } });
  if (flowCode) parts.push({ flowCode: { contains: flowCode, mode: "insensitive" } });

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Risks ---

export function riskWhere(sp: URLSearchParams): Prisma.RiskWhereInput {
  const parts: Prisma.RiskWhereInput[] = [];
  const status = str(sp, "status");
  const category = str(sp, "category");
  const owner = str(sp, "owner");
  const release = str(sp, "release");
  const releaseName = str(sp, "releaseName");
  const application = str(sp, "application");
  const department = str(sp, "department");
  const prodDate = dateTextRange(str(sp, "prodDate"));
  const daysOutMin = num(sp, "daysOutMin");
  const daysOutMax = num(sp, "daysOutMax");
  const likelihoodRaw = str(sp, "likelihood");
  const impactRaw = str(sp, "impact");
  const scoreMin = num(sp, "scoreMin");
  const scoreMax = num(sp, "scoreMax");
  const riskCode = str(sp, "riskCode");
  const description = str(sp, "description");
  const affectedArea = str(sp, "affectedArea");
  const mitigation = str(sp, "mitigation");
  const notes = str(sp, "notes");

  if (status) parts.push({ status });
  if (category) parts.push({ category });
  if (owner) {
    // Text name search against live User — also accept exact cuid for heatmap deep-links.
    parts.push({
      OR: [
        { riskOwner: { name: { contains: owner, mode: "insensitive" } } },
        { riskOwner: { userId: { contains: owner, mode: "insensitive" } } },
        { riskOwnerId: owner },
      ],
    });
  }
  if (release) {
    parts.push({
      OR: [
        { release: { releaseCode: { contains: release, mode: "insensitive" } } },
        { releaseId: release },
      ],
    });
  }
  if (releaseName) {
    parts.push({ release: { name: { contains: releaseName, mode: "insensitive" } } });
  }
  if (application) {
    parts.push({ applicationName: { contains: application, mode: "insensitive" } });
  }
  if (department) {
    parts.push({ departmentName: { contains: department, mode: "insensitive" } });
  }
  if (prodDate) {
    // UI prod date = startDate ?? releaseDate — match either field.
    parts.push({
      OR: [{ release: { startDate: prodDate } }, { release: { releaseDate: prodDate } }],
    });
  }
  if (daysOutMin !== undefined || daysOutMax !== undefined) {
    // daysOut = calendar days from today to prod date → translate to absolute date bounds.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateRange: { gte?: Date; lt?: Date } = {};
    if (daysOutMin !== undefined) {
      const gte = new Date(today);
      gte.setUTCDate(gte.getUTCDate() + daysOutMin);
      dateRange.gte = gte;
    }
    if (daysOutMax !== undefined) {
      const lt = new Date(today);
      lt.setUTCDate(lt.getUTCDate() + daysOutMax + 1);
      dateRange.lt = lt;
    }
    parts.push({
      OR: [
        { release: { startDate: dateRange } },
        {
          AND: [{ release: { startDate: null } }, { release: { releaseDate: dateRange } }],
        },
      ],
    });
  }
  if (likelihoodRaw) {
    const likelihood = parseInt(likelihoodRaw, 10);
    if (Number.isFinite(likelihood) && likelihood >= 1 && likelihood <= 5) {
      parts.push({ likelihood });
    }
  }
  if (impactRaw) {
    const impact = parseInt(impactRaw, 10);
    if (Number.isFinite(impact) && impact >= 1 && impact <= 5) {
      parts.push({ impact });
    }
  }
  if (scoreMin !== undefined || scoreMax !== undefined) {
    const range: { gte?: number; lte?: number } = {};
    if (scoreMin !== undefined) range.gte = scoreMin;
    if (scoreMax !== undefined) range.lte = scoreMax;
    parts.push({ riskScore: range });
  }
  if (riskCode) parts.push({ riskCode: { contains: riskCode, mode: "insensitive" } });
  if (description) parts.push({ description: { contains: description, mode: "insensitive" } });
  if (affectedArea) parts.push({ affectedArea: { contains: affectedArea, mode: "insensitive" } });
  if (mitigation) parts.push({ mitigationStrategy: { contains: mitigation, mode: "insensitive" } });
  if (notes) parts.push({ notes: { contains: notes, mode: "insensitive" } });

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Drifts ---

export function driftWhere(sp: URLSearchParams): Prisma.DriftWhereInput {
  const parts: Prisma.DriftWhereInput[] = [];
  const driftType = str(sp, "driftType");
  const severity = str(sp, "severity");
  const status = str(sp, "status");
  const app = str(sp, "app");
  const release = str(sp, "release");
  const driftCode = str(sp, "driftCode");
  const env = str(sp, "env");
  const detected = dateTextRange(str(sp, "detected"));

  if (driftType) parts.push({ driftType });
  if (severity) parts.push({ severity });
  if (status) parts.push({ status });
  if (app) parts.push({ applicationId: app });
  if (release) {
    parts.push({
      OR: [
        { release: { releaseCode: { contains: release, mode: "insensitive" } } },
        { releaseId: release },
      ],
    });
  }
  if (driftCode) parts.push({ driftCode: { contains: driftCode, mode: "insensitive" } });
  if (env) parts.push({ environmentName: { contains: env, mode: "insensitive" } });
  if (detected) parts.push({ detectedDate: detected });
  const releaseName = str(sp, "releaseName");
  const department = str(sp, "department");
  const category = str(sp, "category");
  const description = str(sp, "description");
  const impact = str(sp, "impact");
  const remediation = str(sp, "remediation");
  const eta = dateTextRange(str(sp, "eta"));
  if (releaseName) {
    parts.push({ release: { name: { contains: releaseName, mode: "insensitive" } } });
  }
  if (department) {
    parts.push({ departmentName: { contains: department, mode: "insensitive" } });
  }
  if (category) parts.push({ driftCategory: category });
  if (description) parts.push({ description: { contains: description, mode: "insensitive" } });
  if (impact) parts.push({ impactOnRelease: { contains: impact, mode: "insensitive" } });
  if (remediation) {
    parts.push({ remediationAction: { contains: remediation, mode: "insensitive" } });
  }
  if (eta) parts.push({ etaToFix: eta });

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Blockers ---

export function blockerWhere(sp: URLSearchParams): Prisma.BlockerWhereInput {
  const parts: Prisma.BlockerWhereInput[] = [];
  const status = str(sp, "status");
  const severity = str(sp, "severity");
  const blockerType = str(sp, "type");
  const assignedTo = str(sp, "assignedTo");
  const release = str(sp, "release");
  const blockerId = str(sp, "blockerId");
  const releaseName = str(sp, "releaseName");
  const description = str(sp, "description");
  const raised = dateTextRange(str(sp, "raised"));
  const raisedBy = str(sp, "raisedBy");
  const targetResolution = dateTextRange(str(sp, "targetResolution"));
  const actualResolution = dateTextRange(str(sp, "actualResolution"));
  const daysOpenMin = num(sp, "daysOpenMin");
  const daysOpenMax = num(sp, "daysOpenMax");
  const escalation = str(sp, "escalation");
  const rootCause = str(sp, "rootCause");
  const resolutionNotes = str(sp, "resolutionNotes");
  const impact = str(sp, "impact");
  const departmentName = str(sp, "departmentName");
  const applicationName = str(sp, "applicationName");

  if (status) parts.push({ status });
  if (severity) parts.push({ severity });
  if (blockerType) parts.push({ blockerType });
  if (assignedTo) parts.push({ assignedTo: { contains: assignedTo, mode: "insensitive" } });
  if (release) {
    // Exact match for full release codes (release detail); contains for partial list search.
    if (/^REL-\d+$/i.test(release.trim())) {
      parts.push({ releaseCode: { equals: release.trim(), mode: "insensitive" } });
    } else {
      parts.push({ releaseCode: { contains: release, mode: "insensitive" } });
    }
  }
  if (blockerId) parts.push({ blockerCode: { contains: blockerId, mode: "insensitive" } });
  if (releaseName) parts.push({ releaseName: { contains: releaseName, mode: "insensitive" } });
  if (description) parts.push({ blockerDescription: { contains: description, mode: "insensitive" } });
  if (raised) parts.push({ raisedDate: raised });
  if (raisedBy) parts.push({ raisedBy: { contains: raisedBy, mode: "insensitive" } });
  if (targetResolution) parts.push({ targetResolutionDate: targetResolution });
  if (actualResolution) parts.push({ actualResolutionDate: actualResolution });
  if (escalation) parts.push({ escalationLevel: escalation });
  if (rootCause) parts.push({ rootCause: { contains: rootCause, mode: "insensitive" } });
  if (resolutionNotes) parts.push({ resolutionNotes: { contains: resolutionNotes, mode: "insensitive" } });
  if (impact) parts.push({ impactOnRelease: { contains: impact, mode: "insensitive" } });
  if (departmentName) parts.push({ departmentName: { equals: departmentName, mode: "insensitive" } });
  if (applicationName) parts.push({ applicationName: { equals: applicationName, mode: "insensitive" } });

  if (daysOpenMin != null || daysOpenMax != null) {
    parts.push({
      daysOpen: {
        ...(daysOpenMin != null ? { gte: daysOpenMin } : {}),
        ...(daysOpenMax != null ? { lte: daysOpenMax } : {}),
      },
    });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

// --- Master data: departments ---

export function departmentWhere(sp: URLSearchParams): Prisma.DepartmentWhereInput {
  const parts: Prisma.DepartmentWhereInput[] = [];
  const q = str(sp, "q");
  const name = str(sp, "name");
  const head = str(sp, "head");
  // appMin/appMax applied in /api/departments after _count (relation count).
  if (name) parts.push({ name: { contains: name, mode: "insensitive" } });
  if (head) parts.push({ head: { contains: head, mode: "insensitive" } });
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { head: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function departmentOrderBy(sp: URLSearchParams): Prisma.DepartmentOrderByWithRelationInput {
  const sort = str(sp, "sort") ?? "name";
  const dir = str(sp, "sortDir") === "desc" ? "desc" : "asc";
  if (sort === "head") return { head: dir };
  return { name: dir };
}

// --- Master data: applications ---

export function applicationWhere(sp: URLSearchParams): Prisma.ApplicationWhereInput {
  const parts: Prisma.ApplicationWhereInput[] = [];
  const q = str(sp, "q");
  const dept = str(sp, "dept");
  const criticality = str(sp, "criticality");
  const type = str(sp, "type");
  const productOwner = str(sp, "productOwner");
  const techLead = str(sp, "techLead");
  const name = str(sp, "name");
  const envMin = num(sp, "envMin");
  const envMax = num(sp, "envMax");

  if (dept) parts.push({ departmentId: dept });
  if (criticality) parts.push({ criticality });
  if (type) parts.push({ type });
  if (productOwner) parts.push({ productOwner: { contains: productOwner, mode: "insensitive" } });
  if (techLead) parts.push({ techLead: { contains: techLead, mode: "insensitive" } });
  if (name) parts.push({ name: { contains: name, mode: "insensitive" } });
  // Relation-count bounds: Prisma where supports none/some; exact ranges applied in /api/applications.
  if (envMax === 0) parts.push({ environments: { none: {} } });
  else if (envMin !== undefined && envMin >= 1) parts.push({ environments: { some: {} } });
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { type: { contains: q, mode: "insensitive" } },
        { productOwner: { contains: q, mode: "insensitive" } },
        { techLead: { contains: q, mode: "insensitive" } },
        { department: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function applicationOrderBy(sp: URLSearchParams): Prisma.ApplicationOrderByWithRelationInput {
  const sort = str(sp, "sort") ?? "name";
  const dir = str(sp, "sortDir") === "desc" ? "desc" : "asc";
  if (sort === "criticality") return { criticality: dir };
  if (sort === "type") return { type: dir };
  return { name: dir };
}

// --- Master data: users ---

export function userWhere(sp: URLSearchParams): Prisma.UserWhereInput {
  const parts: Prisma.UserWhereInput[] = [];
  const q = str(sp, "q");
  const dept = str(sp, "dept");
  const role = str(sp, "role");
  const access = str(sp, "access");
  const status = str(sp, "status");
  const name = str(sp, "name");
  const email = str(sp, "email");
  const lastLogin = dateTextRange(str(sp, "lastLogin"));

  if (dept) parts.push({ department: { contains: dept, mode: "insensitive" } });
  if (role) parts.push({ role });
  if (access) parts.push({ accessLevel: access });
  if (status) parts.push({ status });
  if (name) parts.push({ name: { contains: name, mode: "insensitive" } });
  if (email) parts.push({ email: { contains: email, mode: "insensitive" } });
  if (lastLogin) parts.push({ lastLogin });
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { role: { contains: q, mode: "insensitive" } },
        { department: { contains: q, mode: "insensitive" } },
        { accessLevel: { contains: q, mode: "insensitive" } },
        { status: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function userOrderBy(sp: URLSearchParams): Prisma.UserOrderByWithRelationInput {
  const sort = str(sp, "sort") ?? "name";
  const dir = str(sp, "sortDir") === "desc" ? "desc" : "asc";
  if (sort === "email") return { email: dir };
  if (sort === "role") return { role: dir };
  if (sort === "department") return { department: dir };
  return { name: dir };
}

// --- Risk factors ---

export function riskFactorWhere(sp: URLSearchParams): Prisma.RiskFactorWhereInput {
  const parts: Prisma.RiskFactorWhereInput[] = [];
  const q = str(sp, "q");
  const category = str(sp, "category");
  const active = bool(sp, "active");
  const factorName = str(sp, "factorName");
  const description = str(sp, "description");
  const weightMin = num(sp, "weightMin");
  const weightMax = num(sp, "weightMax");

  if (category) parts.push({ category });
  if (active !== undefined) parts.push({ active });
  if (factorName) parts.push({ factorName: { contains: factorName, mode: "insensitive" } });
  if (description) parts.push({ description: { contains: description, mode: "insensitive" } });
  if (weightMin !== undefined || weightMax !== undefined) {
    const range: { gte?: number; lte?: number } = {};
    if (weightMin !== undefined) range.gte = weightMin;
    if (weightMax !== undefined) range.lte = weightMax;
    parts.push({ weight: range });
  }
  if (q) {
    parts.push({
      OR: [
        { category: { contains: q, mode: "insensitive" } },
        { factorName: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function riskFactorOrderBy(sp: URLSearchParams): Prisma.RiskFactorOrderByWithRelationInput[] {
  const sort = str(sp, "sort") ?? "category";
  const dir = str(sp, "sortDir") === "desc" ? "desc" : "asc";
  if (sort === "factorName") return [{ factorName: dir }];
  if (sort === "weight") return [{ weight: dir }];
  return [{ category: dir }, { factorName: dir }];
}

// --- Calendar events ---

export function calendarEventWhere(sp: URLSearchParams): Prisma.CalendarEventWhereInput {
  const filters = filtersFromSearchParams(sp);
  const parts: Prisma.CalendarEventWhereInput[] = [];
  // Include org-wide events with no Release ID (CHANGE FREEZE, department "ALL")
  // alongside release-linked matches — otherwise Prisma's release relation filter
  // silently drops every null-releaseId row.
  if (filters.departmentId) {
    parts.push({
      OR: [
        { release: { departmentId: filters.departmentId } },
        {
          AND: [
            { releaseId: null },
            { departmentName: { equals: "ALL", mode: "insensitive" } },
          ],
        },
      ],
    });
  }
  if (filters.applicationId) {
    parts.push({
      OR: [
        { release: { applications: { some: { applicationId: filters.applicationId } } } },
        {
          AND: [
            { releaseId: null },
            { departmentName: { equals: "ALL", mode: "insensitive" } },
          ],
        },
      ],
    });
  }
  if (filters.environmentId) {
    // Org-wide events have no env link — exclude them when an environment filter is set
    // (matches prior client filterCalendarEvents behavior).
    parts.push({
      OR: [
        { release: { bookings: { some: { environmentId: filters.environmentId } } } },
        {
          release: {
            applications: {
              some: { application: { environments: { some: { id: filters.environmentId } } } },
            },
          },
        },
      ],
    });
  }
  if (filters.status) parts.push({ release: { status: filters.status } });
  if (filters.priority) parts.push({ release: { priority: filters.priority } });
  if (filters.impact) parts.push({ release: { impact: filters.impact } });

  const eventType = filters.eventType || str(sp, "eventType");
  if (eventType) parts.push({ eventType });
  if (filters.sizeImpact) parts.push({ sizeImpact: filters.sizeImpact });

  if (filters.releaseCodeQ) {
    parts.push({
      release: { releaseCode: { contains: filters.releaseCodeQ, mode: "insensitive" } },
    });
  }
  if (filters.nameQ) {
    parts.push({ title: { contains: filters.nameQ, mode: "insensitive" } });
  }
  if (filters.notesQ) {
    parts.push({ notes: { contains: filters.notesQ, mode: "insensitive" } });
  }

  const dateRange: { gte?: Date; lte?: Date } = {};
  if (filters.dateFrom) {
    const from = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) dateRange.gte = from;
  }
  if (filters.dateTo) {
    const to = new Date(`${filters.dateTo}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) dateRange.lte = to;
  }
  if (dateRange.gte || dateRange.lte) parts.push({ date: dateRange });

  // Day-of-week is applied client-side (derived display field; same pattern as period).
  const releaseStatus = str(sp, "releaseStatus");
  if (releaseStatus) parts.push({ release: { status: releaseStatus } });
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export function referenceDataWhere(sp: URLSearchParams): Prisma.ReferenceDataWhereInput {
  const parts: Prisma.ReferenceDataWhereInput[] = [];
  const category = str(sp, "cat") ?? str(sp, "category");
  const active = bool(sp, "active");
  const includeInactive = sp.get("includeInactive") === "1";
  const value = str(sp, "value");
  const sortMin = num(sp, "sortMin");
  const sortMax = num(sp, "sortMax");

  if (category) parts.push({ category });
  if (active !== undefined) parts.push({ active });
  else if (!includeInactive) parts.push({ active: true });
  if (value) parts.push({ value: { contains: value, mode: "insensitive" } });
  if (sortMin !== undefined || sortMax !== undefined) {
    const range: { gte?: number; lte?: number } = {};
    if (sortMin !== undefined) range.gte = sortMin;
    if (sortMax !== undefined) range.lte = sortMax;
    parts.push({ sortOrder: range });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

export type { ReleaseListFilters };
