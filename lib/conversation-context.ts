import { NAV_SECTIONS } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { loadReleaseLifecycleConfig } from "@/lib/release-lifecycle-config-db";
import { attentionStatusLabels } from "@/lib/release-lifecycle-status-ui";
import { countByStatus } from "@/lib/unified-releases";
import { getLiveState } from "@/lib/release-state-repo";

/**
 * Build chat/copilot portfolio context for the session user.
 * @param sessionName - Display name.
 * @param currentPath - Optional UI path.
 * @param clerkUserId - Optional; drives lifecycle-aware attention statuses.
 */
export async function buildConversationContext(
  sessionName: string,
  currentPath?: string,
  clerkUserId?: string | null
) {
  let attentionLabels = ["Blocked", "Rolled Back"];
  let lifecycleConfig = null;
  if (clerkUserId) {
    try {
      lifecycleConfig = (await loadReleaseLifecycleConfig(clerkUserId)).config;
      attentionLabels = attentionStatusLabels(lifecycleConfig);
    } catch {
      /* keep fallback */
    }
  }
  if (attentionLabels.length === 0) attentionLabels = ["__none__"];

  const [
    releases,
    releaseTotal,
    p1Issues,
    pendingApprovals,
    conflictReleases,
    conflictBookings,
    riskCount,
    driftCount,
    departments,
    mappingSummary,
    connectors,
    liveState,
    upcomingReleases,
  ] = await Promise.all([
    prisma.release.findMany({
      where: { status: { in: attentionLabels } },
      include: { department: true },
      orderBy: { releaseDate: "asc" },
      take: 12,
    }),
    prisma.release.count(),
    prisma.p1Issue.findMany({
      where: { status: { notIn: ["Closed", "Done", "Resolved"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.approval.count({ where: { decision: "Pending" } }),
    prisma.release.count({ where: { conflictFlag: true } }),
    prisma.envBooking.count({ where: { conflictFlag: true } }),
    prisma.risk.count(),
    prisma.drift.count(),
    prisma.department.findMany({ select: { id: true, name: true, head: true } }),
    prisma.systemMappingEdge.count(),
    prisma.connector.findMany({
      orderBy: { name: "asc" },
      take: 8,
      select: { name: true, lastSyncedAt: true },
    }),
    getLiveState(),
    prisma.release.findMany({
      where: { releaseDate: { gte: new Date(), lte: new Date(Date.now() + 14 * 86400000) } },
      include: { department: true },
      orderBy: { releaseDate: "asc" },
      take: 10,
    }),
  ]);

  const allForCounts = await prisma.release.findMany({ select: { status: true } });
  const statusBuckets = countByStatus(allForCounts, lifecycleConfig);
  const statusBreakdown = await prisma.release.groupBy({ by: ["status"], _count: true });

  return {
    mode: "conversation",
    application: "Sentinel Release Desk",
    currentPath: currentPath ?? "/",
    sessionName,
    navigation: NAV_SECTIONS.map((s) => ({
      section: s.title ?? "Menu",
      pages: s.items.map((i) => ({ label: i.label, path: i.href })),
    })),
    portfolio: {
      totalReleases: releaseTotal,
      statusBuckets,
      statusBreakdown: Object.fromEntries(statusBreakdown.map((r) => [r.status, r._count])),
      departments: departments.length,
      pendingApprovals,
      openRisks: riskCount,
      environmentDrifts: driftCount,
      conflictReleases,
      conflictBookings,
      systemMappingEdges: mappingSummary,
    },
    attentionReleases: releases.map((r) => ({
      code: r.releaseCode,
      name: r.name,
      status: r.status,
      owner: r.owner,
      department: r.department.name,
      releaseDate: r.releaseDate.toISOString().slice(0, 10),
      href: `/releases/${r.id}`,
    })),
    openP1Issues: p1Issues.map((p) => ({
      id: p.externalId,
      title: p.title,
      application: p.application,
      releaseCode: p.releaseCode,
      status: p.status,
    })),
    upcomingReleases: upcomingReleases.map((r) => ({
      code: r.releaseCode,
      name: r.name,
      status: r.status,
      owner: r.owner,
      department: r.department.name,
      releaseDate: r.releaseDate.toISOString().slice(0, 10),
    })),
    connectors: connectors.map((c) => ({
      name: c.name,
      lastSynced: c.lastSyncedAt?.toISOString() ?? new Date(0).toISOString(),
    })),
    liveState: {
      decisions: Object.entries(liveState.decisions).map(([releaseId, d]) => ({
        releaseId,
        decision: d.decision,
        decidedBy: d.decidedBy,
      })),
      deploymentCount: Object.keys(liveState.deployments).length,
      unreadNotifications: liveState.notifications.filter((n) => !n.read).length,
    },
    capabilities: [
      "Answer questions about releases, bookings, risks, approvals, conflicts, and system mapping",
      "Suggest concrete next steps for release managers",
      "Use search_web for external standards, CVEs, or industry practices when needed",
      "Use lookup_release for detailed release records by release code (e.g. REL-0042)",
    ],
  };
}

export async function lookupReleaseByCode(code: string) {
  const release = await prisma.release.findFirst({
    where: { releaseCode: { equals: code, mode: "insensitive" } },
    include: {
      department: true,
      applications: { include: { application: true } },
      dependsOn: { include: { dependsOnRelease: true } },
      dependedBy: { include: { release: true } },
      bookings: { include: { application: true, environment: true } },
      risks: true,
      auditEvents: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!release) return null;

  return {
    releaseCode: release.releaseCode,
    name: release.name,
    status: release.status,
    owner: release.owner,
    department: release.department.name,
    priority: release.priority,
    releaseDate: release.releaseDate.toISOString().slice(0, 10),
    decision: release.decision,
    conflictFlag: release.conflictFlag,
    readinessPercent: release.readinessPercent,
    goLiveChecklistPercent: release.goLiveChecklistPercent,
    approvalStatus: release.approvalStatus,
    releaseHealth: release.releaseHealth,
    rollbackPlan: release.rollbackPlan,
    devSignoff: release.devSignoff,
    testSignoff: release.testSignoff,
    uatSignoff: release.uatSignoff,
    securityClearance: release.securityClearance,
    applications: release.applications.map((a) => a.application.name),
    dependencies: release.dependsOn.map((d) => ({
      code: d.dependsOnRelease.releaseCode,
      type: d.dependencyType,
      status: d.dependsOnRelease.status,
    })),
    downstream: release.dependedBy.map((d) => d.release.releaseCode),
    bookings: release.bookings.map((b) => ({
      app: b.application.name,
      env: b.environment?.name ?? "Unassigned",
      from: b.fromDate.toISOString().slice(0, 10),
      to: b.toDate.toISOString().slice(0, 10),
      conflict: b.conflictFlag,
    })),
    risks: release.risks.map((r) => ({
      code: r.riskCode,
      description: r.description,
      score: r.riskScore,
      status: r.status,
    })),
    recentAudit: release.auditEvents.map((e) => ({ action: e.action, at: e.createdAt.toISOString() })),
  };
}
