/**
 * Parallel Prisma reads for the Command Dashboard.
 * One Promise.all so Neon RTT is paid once, not per sequential wave.
 */
import type { Prisma } from "@releasedesk/database";
import {
  bookingOverlapFilter,
  leaveOverlapFilter,
  submittedDateFilter,
  timestampFilter,
  type DashboardPeriod,
} from "@/lib/dashboard-period";
import { prisma } from "@/lib/prisma";
import type { RiskEngineConfig } from "@/lib/risk-engine-config";

type DateRange = { start: Date; end: Date } | null;

export type DashboardFactInput = {
  attentionLabels: string[];
  pendingCabLabel: string;
  releaseWhere: Prisma.ReleaseWhereInput;
  releaseIssueWhere: Prisma.ReleaseWhereInput;
  range: DateRange;
  now: Date;
  period: DashboardPeriod;
  riskConfig: RiskEngineConfig;
  trendRange: { start: Date; end: Date };
  releaseTrendRange: { start: Date; end: Date };
  maintRange: { start: Date; end: Date };
  todayStart: Date;
  todayEnd: Date;
  cabWeekEnd: Date;
  leaveTodayStart: Date;
  leaveTodayEnd: Date;
  leaveWeekEnd: Date;
};

/**
 * Fan-out dashboard aggregates in a single round.
 * @param input - Period filters and lifecycle labels already resolved by the caller.
 * @returns Raw Prisma rows/counts; caller builds the JSON payload.
 * @throws Prisma/DB errors to the caller.
 */
export async function loadDashboardFacts(input: DashboardFactInput) {
  const {
    attentionLabels,
    pendingCabLabel,
    releaseWhere,
    releaseIssueWhere,
    range,
    now,
    period,
    riskConfig,
    trendRange,
    releaseTrendRange,
    maintRange,
    todayStart,
    todayEnd,
    cabWeekEnd,
    leaveTodayStart,
    leaveTodayEnd,
    leaveWeekEnd,
  } = input;

  const releaseIncludeDept = { department: true } as const;
  const maintScheduledRange =
    period === "today"
      ? { gte: todayStart, lte: todayEnd }
      : { gte: maintRange.start, lte: maintRange.end };

  const [
    blockedReleases,
    appsDownProd,
    totalReleases,
    releaseStatusCounts,
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
    blockedList,
    severeRelease,
    pendingCabRelease,
    oldestPendingApproval,
    downProdApp,
    appStatusCounts,
    appStatusProd,
    incidentsInWindow,
    risks,
    releasesInTrend,
    scheduledToday,
    dbRefresh,
    vendorMaint,
    fullOutage,
    activeConflicts,
    priorityCounts,
    alertSeverityCounts,
    alertAcknowledged,
    alertResolved24h,
    incidentStatusInvestigating,
    incidentResolved24h,
    cabMeetingsNext7,
    staffOnLeaveToday,
    staffOnLeaveWeek,
    releasesThisWeek,
    rollbackReady,
    rollbackAtRisk,
    checklistAgg,
    freezeGroups,
    releasesThisMonth,
  ] = await Promise.all([
    attentionLabels.length
      ? prisma.release.count({
          where: { status: { in: attentionLabels }, ...releaseWhere },
        })
      : Promise.resolve(0),
    prisma.applicationStatus.count({
      where: { status: "Down", environmentName: "Prod" },
    }),
    prisma.release.count({ where: releaseWhere }),
    prisma.release.groupBy({ by: ["status"], where: releaseWhere, _count: true }),
    prisma.incident.groupBy({
      by: ["severity"],
      where: { status: { notIn: ["Resolved"] }, ...timestampFilter(range) },
      _count: true,
    }),
    prisma.monitoringAlert.count({
      where: {
        severity: "Critical",
        status: { in: ["Active", "Pending"] },
        ...timestampFilter(range),
      },
    }),
    prisma.monitoringAlert.count({
      where: { status: { in: ["Active", "Pending"] }, ...timestampFilter(range) },
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
    prisma.release.findMany({
      where: releaseIssueWhere,
      include: releaseIncludeDept,
      orderBy: { releaseDate: "asc" },
      take: 2,
    }),
    riskConfig.weightedRiskEnabled
      ? prisma.release.findFirst({
          where: {
            weightedRiskScore: { not: null, gte: riskConfig.weightedBandCutoffs.high },
            ...releaseWhere,
          },
          include: releaseIncludeDept,
          orderBy: { weightedRiskScore: "desc" },
        })
      : Promise.resolve(null),
    prisma.release.findFirst({
      where: { status: pendingCabLabel, ...releaseWhere },
      include: releaseIncludeDept,
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
      where: { status: "Down", environmentName: "Prod" },
      include: { application: { include: { department: true } } },
      orderBy: { lastCheck: "desc" },
    }),
    prisma.applicationStatus.groupBy({ by: ["status"], _count: true }),
    prisma.applicationStatus.groupBy({
      by: ["status"],
      where: { environmentName: "Prod" },
      _count: true,
    }),
    prisma.incident.findMany({
      where: { timestamp: { gte: trendRange.start, lte: trendRange.end } },
      select: { timestamp: true },
    }),
    prisma.risk.findMany({
      where: range ? { release: releaseWhere } : undefined,
      select: { riskScore: true },
    }),
    prisma.release.findMany({
      where: {
        releaseDate: { gte: releaseTrendRange.start, lte: releaseTrendRange.end },
      },
      select: { releaseDate: true },
    }),
    prisma.plannedMaintenance.count({
      where: { scheduledDate: maintScheduledRange },
    }),
    prisma.plannedMaintenance.count({
      where: {
        type: "DB Refresh",
        scheduledDate: { gte: maintRange.start, lte: maintRange.end },
      },
    }),
    prisma.plannedMaintenance.count({
      where: {
        type: "Vendor Maintenance",
        scheduledDate: { gte: maintRange.start, lte: maintRange.end },
      },
    }),
    prisma.plannedMaintenance.count({
      where: {
        impact: "Full Outage",
        scheduledDate: { gte: maintRange.start, lte: maintRange.end },
      },
    }),
    prisma.release.count({ where: { conflictFlag: true, ...releaseWhere } }),
    prisma.release.groupBy({ by: ["priority"], where: releaseWhere, _count: true }),
    prisma.monitoringAlert.groupBy({
      by: ["severity"],
      where: { status: { in: ["Active", "Pending"] } },
      _count: true,
    }),
    prisma.monitoringAlert.count({ where: { status: "Acknowledged" } }),
    prisma.monitoringAlert.count({
      where: {
        status: { in: ["Resolved", "Actioned"] },
        timestamp: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.incident.count({ where: { status: "Investigating" } }),
    prisma.incident.count({
      where: {
        status: "Resolved",
        timestamp: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    }),
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
          gte: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
          lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.release.count({ where: { rollbackPlan: "Ready", ...releaseWhere } }),
    prisma.release.count({ where: { rollbackPlan: "At Risk", ...releaseWhere } }),
    prisma.release.aggregate({
      where: { goLiveChecklistPercent: { not: null }, ...releaseWhere },
      _avg: { goLiveChecklistPercent: true },
    }),
    prisma.release.groupBy({
      by: ["changeFreeze"],
      where: releaseWhere,
      _count: true,
    }),
    prisma.release.count({
      where: {
        releaseDate: {
          gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          lte: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
          ),
        },
      },
    }),
  ]);

  const freezeCount = (label: string) =>
    freezeGroups.find((row) => row.changeFreeze === label)?._count ?? 0;

  return {
    blockedReleases,
    activeP1Incidents:
      incidentSeverityCounts.find((row) => row.severity === "P1")?._count ?? 0,
    appsDownProd,
    totalReleases,
    releaseStatusCounts,
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
    blockedList,
    severeRelease,
    pendingCabRelease,
    oldestPendingApproval,
    downProdApp,
    appStatusCounts,
    appStatusProd,
    incidentsInWindow,
    risks,
    releasesInTrend,
    scheduledToday,
    dbRefresh,
    vendorMaint,
    fullOutage,
    activeConflicts,
    priorityCounts,
    alertSeverityCounts,
    alertAcknowledged,
    alertResolved24h,
    incidentStatusInvestigating,
    incidentResolved24h,
    cabMeetingsNext7,
    staffOnLeaveToday,
    staffOnLeaveWeek,
    releasesThisWeek,
    rollbackReady,
    rollbackAtRisk,
    checklistAgg,
    freezeQuarter: freezeCount("Quarter-End Freeze"),
    freezeYear: freezeCount("Year-End Freeze"),
    freezeAudit: freezeCount("Audit Freeze"),
    freezeHoliday: freezeCount("Holiday Freeze"),
    totalFrozenReleases: freezeGroups
      .filter((row) => row.changeFreeze != null)
      .reduce((sum, row) => sum + row._count, 0),
    releasesThisMonth,
  };
}
