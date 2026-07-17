import {
  bookingOverlapFilter,
  buildTimeBuckets,
  countInBuckets,
  dashboardPeriodRange,
  leaveOverlapFilter,
  parseDashboardPeriod,
  periodContextLabel,
  releaseDateFilter,
  submittedDateFilter,
  timestampFilter,
  type DashboardPeriod,
} from "@/lib/dashboard-period";
import { prisma } from "@/lib/prisma";
import { getRiskLevel, type RiskLevel } from "@/lib/risk-level";

const DAY_MS = 24 * 60 * 60 * 1000;

type TopIssueIcon = "Ban" | "ShieldAlert" | "Clock" | "Server" | "Users";
type TopIssueSeverity = "rose" | "amber" | "sky";

type TopIssue = {
  severity: TopIssueSeverity;
  title: string;
  reason: string;
  meta: string;
  href: string;
  icon: TopIssueIcon;
};

function buildBriefing(
  params: {
    blocked: number;
    p1: number;
    appsDown: number;
    blockedRelease?: { code: string } | null;
    pendingCab?: { code: string; days: number } | null;
  },
  period: DashboardPeriod
): string {
  const ctx = periodContextLabel(period);
  const attention: string[] = [];
  if (params.blocked > 0) attention.push(`${params.blocked} blocked release${params.blocked === 1 ? "" : "s"}`);
  if (params.p1 > 0) attention.push(`${params.p1} P1 incident${params.p1 === 1 ? "" : "s"}`);
  if (params.appsDown > 0) attention.push(`${params.appsDown} app${params.appsDown === 1 ? "" : "s"} down in Prod`);

  if (attention.length === 0) {
    return `No critical blockers ${ctx} — review the pipeline, upcoming CAB windows, and environment bookings.`;
  }

  let sentence = `${attention.join(", ")} need attention ${ctx}.`;
  const drivers: string[] = [];
  if (params.blockedRelease) drivers.push(`blockers on ${params.blockedRelease.code}`);
  if (params.pendingCab && params.pendingCab.days > 0) {
    drivers.push(`CAB approval pending ${params.pendingCab.days} day${params.pendingCab.days === 1 ? "" : "s"} on ${params.pendingCab.code}`);
  }
  if (drivers.length > 0) sentence += ` Driven mostly by ${drivers.join(" and ")}.`;
  else sentence += " Open the ranked items below for context and next actions.";
  return sentence;
}

/**
 * Builds Command Dashboard aggregates for period=today|week|month|all.
 * @param periodParam - Raw period query value (validated via parseDashboardPeriod).
 * @returns Plain JSON-serializable dashboard payload.
 * @throws Prisma/DB errors to the caller.
 */
export async function buildDashboardPayload(periodParam: string | null) {
  const period = parseDashboardPeriod(periodParam);
  const now = new Date();
  const range = dashboardPeriodRange(period, now);
  const releaseWhere = releaseDateFilter(range);

  // --- 1. Hero ---
  const [blockedReleases, activeP1Incidents, appsDownProd] = await Promise.all([
    prisma.release.count({ where: { status: "Blocked", ...releaseWhere } }),
    prisma.incident.count({
      where: {
        severity: "P1",
        status: { notIn: ["Resolved"] },
        ...timestampFilter(range),
      },
    }),
    prisma.applicationStatus.count({
      where: {
        status: "Down",
        environmentName: "Prod",
      },
    }),
  ]);

  // --- 2. Release Pipeline ---
  const [totalReleases, releaseStatusCounts] = await Promise.all([
    prisma.release.count({ where: releaseWhere }),
    prisma.release.groupBy({ by: ["status"], where: releaseWhere, _count: true }),
  ]);
  const countByStatus = (status: string) =>
    releaseStatusCounts.find((r) => r.status === status)?._count ?? 0;

  const pipeline = [
    { label: "Total Releases", value: totalReleases, delta: null, href: `/releases?period=${period}`, tone: "indigo" as const },
    { label: "Blocked", value: countByStatus("Blocked"), delta: null, href: "/releases?status=Blocked", tone: "rose" as const },
    { label: "Pending CAB", value: countByStatus("Pending CAB"), delta: null, href: "/releases?status=Pending+CAB", tone: "violet" as const },
    { label: "In Testing", value: countByStatus("Testing"), delta: null, href: "/releases?status=Testing", tone: "sky" as const },
    { label: "Approved", value: countByStatus("Approved"), delta: null, href: "/releases?status=Approved", tone: "emerald" as const },
    { label: "Planning", value: countByStatus("Planning"), delta: null, href: "/releases?status=Planning", tone: "amber" as const },
  ];

  // --- 3. Operations ---
  const [
    incidentSeverityCounts,
    criticalAlertsActive,
    totalAlertsActive,
    envConflictBookings,
    totalBookings,
    blockedDeps,
    totalDeps,
    pendingApprovals,
    nextCab,
    staffOnLeave,
  ] = await Promise.all([
    prisma.incident.groupBy({
      by: ["severity"],
      where: { status: { notIn: ["Resolved"] }, ...timestampFilter(range) },
      _count: true,
    }),
    prisma.monitoringAlert.count({
      where: { severity: "Critical", status: "Active", ...timestampFilter(range) },
    }),
    prisma.monitoringAlert.count({
      where: { status: "Active", ...timestampFilter(range) },
    }),
    prisma.envBooking.count({
      where: { conflictFlag: true, ...bookingOverlapFilter(range) },
    }),
    prisma.envBooking.count({ where: bookingOverlapFilter(range) }),
    prisma.releaseDependency.count({
      where: { status: "Blocked", ...(range ? { release: releaseWhere } : {}) },
    }),
    prisma.releaseDependency.count({
      where: range ? { release: releaseWhere } : {},
    }),
    prisma.approval.count({
      where: { decision: "Pending", ...submittedDateFilter(range) },
    }),
    prisma.release.findFirst({
      where: {
        cabDate: range ? { gte: range.start, lte: range.end } : { gte: now },
      },
      orderBy: { cabDate: "asc" },
      select: { cabDate: true },
    }),
    prisma.leaveRecord.count({ where: leaveOverlapFilter(range) }),
  ]);

  const activeIncidentsTotal = incidentSeverityCounts.reduce((sum, r) => sum + r._count, 0);
  const p1Active = incidentSeverityCounts.find((r) => r.severity === "P1")?._count ?? 0;
  const p2Active = incidentSeverityCounts.find((r) => r.severity === "P2")?._count ?? 0;
  const p3Active = incidentSeverityCounts.find((r) => r.severity === "P3")?._count ?? 0;
  const daysToNextCab = nextCab?.cabDate
    ? Math.round((nextCab.cabDate.getTime() - now.getTime()) / DAY_MS)
    : null;

  const ops = [
    {
      label: "Active Incidents",
      value: activeIncidentsTotal,
      sub: `${p1Active} P1 · ${p2Active} P2 · ${p3Active} P3`,
      delta: null,
      href: "/incidents",
      tone: "rose" as const,
    },
    {
      label: "Critical Alerts",
      value: criticalAlertsActive,
      sub: `${totalAlertsActive} active total`,
      delta: null,
      href: "/monitoring-alerts?severity=Critical&status=Active",
      tone: "amber" as const,
    },
    {
      label: "Env Conflicts",
      value: envConflictBookings,
      sub: `${totalBookings} bookings`,
      delta: null,
      href: "/conflicts",
      tone: "violet" as const,
    },
    {
      label: "Blocked Deps",
      value: blockedDeps,
      sub: `of ${totalDeps} total`,
      delta: null,
      href: "/dependencies?status=Blocked",
      tone: "sky" as const,
    },
    {
      label: "Pending Approvals",
      value: pendingApprovals,
      sub: daysToNextCab !== null ? `CAB in ${daysToNextCab} day${daysToNextCab === 1 ? "" : "s"}` : "No CAB scheduled",
      delta: null,
      href: "/approvals",
      tone: "indigo" as const,
    },
    {
      label: "Staff on Leave",
      value: staffOnLeave,
      sub: period === "today" ? "today" : period === "week" ? "this week" : period === "month" ? "this month" : "all time",
      delta: null,
      href: "/leaves",
      tone: "emerald" as const,
    },
  ];

  // --- Needs Your Decision ---
  const releaseIssueWhere = { ...releaseWhere, status: "Blocked" as const };
  const [blockedList, severeRelease, pendingCabRelease, oldestPendingApproval, downProdApp] = await Promise.all([
    prisma.release.findMany({
      where: releaseIssueWhere,
      include: { department: true },
      orderBy: { releaseDate: "asc" },
      take: 2,
    }),
    prisma.release.findFirst({
      where: { weightedRiskScore: { not: null, gte: 3.5 }, ...releaseWhere },
      include: { department: true },
      orderBy: { weightedRiskScore: "desc" },
    }),
    prisma.release.findFirst({
      where: { status: "Pending CAB", ...releaseWhere },
      include: { department: true },
      orderBy: { cabDate: "asc" },
    }),
    prisma.approval.findFirst({
      where: { decision: "Pending", ...submittedDateFilter(range) },
      include: {
        release: { include: { department: true } },
        approver: true,
      },
      orderBy: { submittedDate: "asc" },
    }),
    prisma.applicationStatus.findFirst({
      where: {
        status: "Down",
        environmentName: "Prod",
      },
      include: { application: { include: { department: true } } },
      orderBy: { lastCheck: "desc" },
    }),
  ]);

  const topIssues: TopIssue[] = [];
  const seenHrefs = new Set<string>();

  for (const r of blockedList) {
    const href = `/releases/${r.id}`;
    if (seenHrefs.has(href)) continue;
    seenHrefs.add(href);
    topIssues.push({
      severity: "rose",
      title: `${r.releaseCode} · ${r.name}`,
      reason:
        r.blockers?.trim() ||
        (r.conflictFlag
          ? "Blocked — environment conflict flagged on this release"
          : "Blocked — review dependencies and environment bookings"),
      meta: `${r.department?.name ?? "—"} · Owner: ${r.owner || "—"}`,
      href,
      icon: "Ban",
    });
  }

  if (severeRelease) {
    const href = `/releases/${severeRelease.id}`;
    if (!seenHrefs.has(href)) {
      seenHrefs.add(href);
      const score = severeRelease.weightedRiskScore?.toFixed(2) ?? "—";
      topIssues.push({
        severity: "rose",
        title: `${severeRelease.releaseCode} · ${severeRelease.name}`,
        reason: `${severeRelease.weightedRiskLevel ?? "High"} weighted risk (${score})${
          severeRelease.blockers?.trim() ? ` — ${severeRelease.blockers.trim()}` : ""
        }`,
        meta: `${severeRelease.department?.name ?? "—"} · Owner: ${severeRelease.owner || "—"}`,
        href,
        icon: "ShieldAlert",
      });
    }
  }

  if (pendingCabRelease && topIssues.length < 5) {
    const href = `/releases/${pendingCabRelease.id}`;
    if (!seenHrefs.has(href)) {
      seenHrefs.add(href);
      const daysPending =
        pendingCabRelease.cabDate && pendingCabRelease.cabDate < now
          ? Math.round((now.getTime() - pendingCabRelease.cabDate.getTime()) / DAY_MS)
          : 0;
      topIssues.push({
        severity: "amber",
        title: pendingCabRelease.releaseCode,
        reason:
          daysPending > 0
            ? `CAB approval pending ${daysPending} day${daysPending === 1 ? "" : "s"}`
            : "Pending CAB — awaiting board decision",
        meta: pendingCabRelease.department?.name ?? "Awaiting CAB",
        href,
        icon: "Clock",
      });
    }
  } else if (oldestPendingApproval && topIssues.length < 5) {
    const r = oldestPendingApproval.release;
    const href = `/releases/${r.id}`;
    if (!seenHrefs.has(href)) {
      seenHrefs.add(href);
      const days = Math.max(0, Math.round((now.getTime() - oldestPendingApproval.submittedDate.getTime()) / DAY_MS));
      topIssues.push({
        severity: "amber",
        title: r.releaseCode,
        reason: `${oldestPendingApproval.approvalType} approval pending ${days} day${days === 1 ? "" : "s"}`,
        meta: `Awaiting: ${oldestPendingApproval.approver?.name ?? "approver"}`,
        href,
        icon: "Clock",
      });
    }
  }

  if (downProdApp && topIssues.length < 5) {
    topIssues.push({
      severity: "amber",
      title: `${downProdApp.application.name} — Production`,
      reason: "Application down in Production environment",
      meta: `${downProdApp.application.department?.name ?? "—"} · Env: Prod`,
      href: "/application-status?status=Down&env=Prod",
      icon: "Server",
    });
  }

  if (staffOnLeave > 0 && topIssues.length < 5) {
    topIssues.push({
      severity: "sky",
      title: `${staffOnLeave} staff on leave ${periodContextLabel(period)}`,
      reason: "Overlaps with releases requiring their sign-off — check coverage",
      meta: "Resourcing",
      href: "/leaves",
      icon: "Users",
    });
  }

  const pendingCabDays =
    pendingCabRelease?.cabDate && pendingCabRelease.cabDate < now
      ? Math.round((now.getTime() - pendingCabRelease.cabDate.getTime()) / DAY_MS)
      : 0;

  const briefing = buildBriefing(
    {
      blocked: blockedReleases,
      p1: activeP1Incidents,
      appsDown: appsDownProd,
      blockedRelease: blockedList[0] ? { code: blockedList[0].releaseCode } : null,
      pendingCab:
        pendingCabRelease && pendingCabDays > 0
          ? { code: pendingCabRelease.releaseCode, days: pendingCabDays }
          : null,
    },
    period
  );

  // --- Application Availability ---
  const [appStatusCounts, appStatusProd] = await Promise.all([
    prisma.applicationStatus.groupBy({ by: ["status"], _count: true }),
    prisma.applicationStatus.groupBy({
      by: ["status"],
      where: { environmentName: "Prod" },
      _count: true,
    }),
  ]);
  const healthyCount = appStatusCounts.find((r) => r.status === "Healthy")?._count ?? 0;
  const degradedCount = appStatusCounts.find((r) => r.status === "Degraded")?._count ?? 0;
  const downCount = appStatusCounts.find((r) => r.status === "Down")?._count ?? 0;
  const totalAppStatus = healthyCount + degradedCount + downCount;
  const prodHealthy = appStatusProd.find((r) => r.status === "Healthy")?._count ?? 0;
  const prodTotal = appStatusProd.reduce((sum, r) => sum + r._count, 0);

  const availability = {
    counts: [
      { name: "Healthy", value: healthyCount, color: "#10b981" },
      { name: "Degraded", value: degradedCount, color: "#f59e0b" },
      { name: "Down", value: downCount, color: "#f43f5e" },
    ],
    percentHealthy: totalAppStatus > 0 ? Math.round((healthyCount / totalAppStatus) * 100) : 0,
    prod: { healthy: prodHealthy, total: prodTotal },
    total: totalAppStatus,
  };

  // --- Incident Trend ---
  const trendRange = range ?? { start: new Date(now.getTime() - 84 * DAY_MS), end: now };
  const incidentsInWindow = await prisma.incident.findMany({
    where: { timestamp: { gte: trendRange.start, lte: trendRange.end } },
    select: { timestamp: true },
  });
  const incidentBuckets = buildTimeBuckets(period, range, now);
  const incidentTrend = countInBuckets(
    incidentBuckets,
    incidentsInWindow.map((r) => ({ at: r.timestamp })),
    period
  ).map((b) => ({ date: b.date, count: b.count }));

  // --- Risk Distribution ---
  const risks = await prisma.risk.findMany({
    where: range ? { release: releaseWhere } : undefined,
    select: { riskScore: true },
  });
  const riskBandCounts: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const r of risks) riskBandCounts[getRiskLevel(r.riskScore)]++;
  const riskDistribution = [
    { name: "Low", value: riskBandCounts.LOW, color: "#10b981", href: "/risks?band=Low" },
    { name: "Medium", value: riskBandCounts.MEDIUM, color: "#f59e0b", href: "/risks?band=Medium" },
    { name: "High", value: riskBandCounts.HIGH, color: "#fb923c", href: "/risks?band=High" },
    { name: "Critical", value: riskBandCounts.CRITICAL, color: "#f43f5e", href: "/risks?band=Critical" },
  ];

  // --- Release Trend ---
  const releaseTrendRange =
    range ??
    ({ start: now, end: new Date(now.getTime() + 28 * DAY_MS) } as { start: Date; end: Date });
  const releasesInTrend = await prisma.release.findMany({
    where: { releaseDate: { gte: releaseTrendRange.start, lte: releaseTrendRange.end } },
    select: { releaseDate: true },
  });

  let releaseTrend: { week: string; count: number }[] = [];
  if (period === "today") {
    releaseTrend = [{ week: "Today", count: releasesInTrend.length }];
  } else if (period === "week") {
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date((range?.start ?? now).getTime() + i * DAY_MS);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const count = releasesInTrend.filter((r) => r.releaseDate >= dayStart && r.releaseDate < dayEnd).length;
      releaseTrend.push({
        week: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayStart.getUTCDay()],
        count,
      });
    }
  } else if (period === "month") {
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date((range?.start ?? now).getTime() + w * 7 * DAY_MS);
      const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
      const count = releasesInTrend.filter((r) => r.releaseDate >= weekStart && r.releaseDate < weekEnd).length;
      releaseTrend.push({ week: `W${w + 1}`, count });
    }
  } else {
    for (let w = 0; w < 4; w++) {
      const weekStart = new Date(now.getTime() + w * 7 * DAY_MS);
      const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
      const count = releasesInTrend.filter((r) => r.releaseDate >= weekStart && r.releaseDate < weekEnd).length;
      releaseTrend.push({ week: `W${w + 1}`, count });
    }
  }

  // --- Planned Maintenance ---
  const maintRange = range ?? { start: now, end: new Date(now.getTime() + 30 * DAY_MS) };
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + DAY_MS);
  const [scheduledToday, dbRefresh, vendorMaint, fullOutage] = await Promise.all([
    prisma.plannedMaintenance.count({
      where: { scheduledDate: { gte: period === "today" ? todayStart : maintRange.start, lte: period === "today" ? todayEnd : maintRange.end } },
    }),
    prisma.plannedMaintenance.count({
      where: { type: "DB Refresh", scheduledDate: { gte: maintRange.start, lte: maintRange.end } },
    }),
    prisma.plannedMaintenance.count({
      where: { type: "Vendor Maintenance", scheduledDate: { gte: maintRange.start, lte: maintRange.end } },
    }),
    prisma.plannedMaintenance.count({
      where: { impact: "Full Outage", scheduledDate: { gte: maintRange.start, lte: maintRange.end } },
    }),
  ]);
  const maintenance = [
    { label: period === "today" ? "Scheduled today" : "Scheduled in period", value: scheduledToday, href: "/planned-maintenance" },
    { label: "DB refreshes", value: dbRefresh, href: "/planned-maintenance?type=DB+Refresh" },
    { label: "Vendor windows", value: vendorMaint, href: "/planned-maintenance?type=Vendor+Maintenance" },
    { label: "Full outages", value: fullOutage, href: "/planned-maintenance" },
  ];
  const maintenanceTotal = scheduledToday + dbRefresh + vendorMaint + fullOutage;
  const maintenanceChart = [
    { name: period === "today" ? "Today" : "Scheduled", value: scheduledToday, color: "#6366f1", href: "/planned-maintenance" },
    { name: "DB refresh", value: dbRefresh, color: "#0ea5e9", href: "/planned-maintenance?type=DB+Refresh" },
    { name: "Vendor", value: vendorMaint, color: "#8b5cf6", href: "/planned-maintenance?type=Vendor+Maintenance" },
    { name: "Outages", value: fullOutage, color: "#f43f5e", href: "/planned-maintenance" },
  ];

  // --- Extended dashboard sections ---
  const activeConflicts = await prisma.release.count({
    where: { conflictFlag: true, ...releaseWhere },
  });

  const [priorityCounts, alertSeverityCounts, alertAcknowledged, alertResolved24h, incidentStatusInvestigating, incidentResolved24h] =
    await Promise.all([
      prisma.release.groupBy({ by: ["priority"], where: releaseWhere, _count: true }),
      prisma.monitoringAlert.groupBy({
        by: ["severity"],
        where: { status: "Active" },
        _count: true,
      }),
      prisma.monitoringAlert.count({ where: { status: "Acknowledged" } }),
      prisma.monitoringAlert.count({
        where: { status: "Resolved", timestamp: { gte: new Date(now.getTime() - DAY_MS) } },
      }),
      prisma.incident.count({
        where: { status: "Investigating" },
      }),
      prisma.incident.count({
        where: { status: "Resolved", timestamp: { gte: new Date(now.getTime() - DAY_MS) } },
      }),
    ]);

  const priorityBucket = (prefix: string) =>
    priorityCounts
      .filter((p) => p.priority.startsWith(prefix))
      .reduce((sum, p) => sum + p._count, 0);

  const pipelineDetail = {
    total: totalReleases,
    byStatus: [
      { name: "Blocked", value: countByStatus("Blocked"), color: "#f43f5e", href: "/releases?status=Blocked" },
      { name: "Pending CAB", value: countByStatus("Pending CAB"), color: "#8b5cf6", href: "/releases?status=Pending+CAB" },
      { name: "Testing", value: countByStatus("Testing"), color: "#0ea5e9", href: "/releases?status=Testing" },
      { name: "Approved", value: countByStatus("Approved"), color: "#10b981", href: "/releases?status=Approved" },
      { name: "Planning", value: countByStatus("Planning"), color: "#f59e0b", href: "/releases?status=Planning" },
      { name: "Draft", value: countByStatus("Draft"), color: "#94a3b8", href: "/releases?status=Draft" },
    ],
    byPriority: [
      { name: "P1", value: priorityBucket("P1"), color: "#f43f5e", href: "/releases?priority=P1" },
      { name: "P2", value: priorityBucket("P2"), color: "#f59e0b", href: "/releases?priority=P2" },
      { name: "P3", value: priorityBucket("P3"), color: "#6366f1", href: "/releases?priority=P3" },
      { name: "P4", value: priorityBucket("P4"), color: "#94a3b8", href: "/releases?priority=P4" },
    ],
  };

  const warningAlerts =
    alertSeverityCounts.find((a) => a.severity === "Warning")?._count ?? 0;
  const infoAlerts = alertSeverityCounts.find((a) => a.severity === "Info")?._count ?? 0;

  const cabWeekEnd = new Date(now.getTime() + 7 * DAY_MS);
  const leaveTodayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const leaveTodayEnd = new Date(leaveTodayStart.getTime() + DAY_MS);
  const leaveWeekEnd = new Date(now.getTime() + 7 * DAY_MS);

  const [
    cabMeetingsNext7,
    staffOnLeaveToday,
    staffOnLeaveWeek,
    releasesThisWeek,
    rollbackReady,
    rollbackAtRisk,
    checklistAgg,
    freezeQuarter,
    freezeYear,
    freezeAudit,
    freezeHoliday,
    totalFrozenReleases,
    releasesThisMonth,
  ] = await Promise.all([
    prisma.release.count({ where: { cabDate: { gte: now, lte: cabWeekEnd } } }),
    prisma.leaveRecord.count({
      where: { leaveStart: { lte: leaveTodayEnd }, leaveEnd: { gte: leaveTodayStart } },
    }),
    prisma.leaveRecord.count({
      where: { leaveStart: { lte: leaveWeekEnd }, leaveEnd: { gte: now } },
    }),
    prisma.release.count({
      where: {
        releaseDate: {
          gte: new Date(now.getTime() - 6 * DAY_MS),
          lte: new Date(now.getTime() + DAY_MS),
        },
      },
    }),
    prisma.release.count({ where: { rollbackPlan: "Ready", ...releaseWhere } }),
    prisma.release.count({ where: { rollbackPlan: "At Risk", ...releaseWhere } }),
    prisma.release.aggregate({
      where: { goLiveChecklistPercent: { not: null }, ...releaseWhere },
      _avg: { goLiveChecklistPercent: true },
    }),
    prisma.release.count({ where: { changeFreeze: "Quarter-End Freeze", ...releaseWhere } }),
    prisma.release.count({ where: { changeFreeze: "Year-End Freeze", ...releaseWhere } }),
    prisma.release.count({ where: { changeFreeze: "Audit Freeze", ...releaseWhere } }),
    prisma.release.count({ where: { changeFreeze: "Holiday Freeze", ...releaseWhere } }),
    prisma.release.count({ where: { changeFreeze: { not: null }, ...releaseWhere } }),
    prisma.release.count({
      where: {
        releaseDate: {
          gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          lte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
        },
      },
    }),
  ]);

  const weekRangeStart = new Date(now);
  weekRangeStart.setUTCDate(weekRangeStart.getUTCDate() - 6);
  weekRangeStart.setUTCHours(0, 0, 0, 0);

  const summary = {
    totalReleases,
    activeIncidents: activeIncidentsTotal,
    activeAlerts: totalAlertsActive,
    appsDownProd,
  };

  const conflictsRisks = {
    activeConflicts,
    riskDistribution,
  };

  const envBookings = {
    conflicts: envConflictBookings,
    activeBookings: totalBookings,
  };

  const dependencies = { blocked: blockedDeps, total: totalDeps };

  const cabApprovals = {
    cabMeetingsNext7,
    pendingApprovals,
  };

  const resourceAvailability = {
    leaveToday: staffOnLeaveToday,
    leaveNext7Days: staffOnLeaveWeek,
  };

  const alertsDetail = {
    critical: criticalAlertsActive,
    warning: warningAlerts,
    info: infoAlerts,
    acknowledged: alertAcknowledged,
    resolved24h: alertResolved24h,
    total: totalAlertsActive,
  };

  const incidentsDetail = {
    p1: p1Active,
    p2: p2Active,
    p3: p3Active,
    investigating: incidentStatusInvestigating,
    resolved24h: incidentResolved24h,
    total: activeIncidentsTotal,
  };

  const changeFreeze = {
    types: [
      { name: "Quarter-End", value: freezeQuarter, href: "/releases?freeze=Quarter-End+Freeze" },
      { name: "Year-End", value: freezeYear, href: "/releases?freeze=Year-End+Freeze" },
      { name: "Audit", value: freezeAudit, href: "/releases?freeze=Audit+Freeze" },
      { name: "Holiday", value: freezeHoliday, href: "/releases?freeze=Holiday+Freeze" },
    ],
    totalFrozenReleases,
  };

  const quickStats = {
    releasesThisWeek,
    releasesThisMonth,
    rollbackReady,
    rollbackAtRisk,
    avgGoLiveChecklistPct: Math.round(checklistAgg._avg.goLiveChecklistPercent ?? 0),
  };

  // --- Overall Health ---
  const health = [
    {
      label: "Release Pipeline",
      status: blockedReleases > 0 ? "Critical" : "Healthy",
      value: blockedReleases,
      metricLabel: blockedReleases === 1 ? "blocked release" : "blocked releases",
      href: "/releases?status=Blocked",
    },
    {
      label: "Environment Health",
      status: envConflictBookings > 0 ? "Critical" : "Healthy",
      value: envConflictBookings,
      metricLabel: envConflictBookings === 1 ? "booking conflict" : "booking conflicts",
      href: "/conflicts",
    },
    {
      label: "Incident Status",
      status: activeP1Incidents > 0 ? "Critical" : activeIncidentsTotal > 0 ? "Warning" : "Healthy",
      value: activeP1Incidents > 0 ? activeP1Incidents : activeIncidentsTotal,
      metricLabel: activeP1Incidents > 0 ? "P1 active" : "active incidents",
      href: activeP1Incidents > 0 ? "/incidents?severity=P1" : "/incidents",
    },
    {
      label: "Alert Status",
      status: criticalAlertsActive > 0 ? "Critical" : totalAlertsActive > 0 ? "Warning" : "Healthy",
      value: criticalAlertsActive > 0 ? criticalAlertsActive : totalAlertsActive,
      metricLabel: criticalAlertsActive > 0 ? "critical alerts" : "active alerts",
      href: "/monitoring-alerts?status=Active",
    },
  ];

  return {
    period,
    range: range ? { start: range.start.toISOString(), end: range.end.toISOString() } : null,
    generatedAt: now.toISOString(),
    hero: { blockedReleases, activeP1Incidents, appsDownProd },
    summary,
    briefing,
    topIssues,
    pipeline,
    pipelineDetail,
    ops,
    conflictsRisks,
    envBookings,
    dependencies,
    cabApprovals,
    resourceAvailability,
    alertsDetail,
    incidentsDetail,
    availability,
    incidentTrend,
    riskDistribution,
    releaseTrend,
    maintenance,
    maintenanceTotal,
    maintenanceChart,
    changeFreeze,
    quickStats,
    health,
  };
}
