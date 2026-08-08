/**
 * Release-manager read helpers for voice tools (bundle, attention, calendar, compare).
 * Server-only Prisma access — called from /api/copilot/voice/manager.
 */
import { prisma } from "@/lib/prisma";
import { lookupReleaseByCode } from "@/lib/conversation-context";
import { assessReleaseReadiness } from "@/lib/voice/release-readiness";
import {
  buildDbAttentionItem,
  sortAttentionItems,
} from "@/lib/needs-attention";
import { periodRange, type Period } from "@/lib/unified-releases";

const OPEN_BLOCKER = {
  notIn: ["Resolved", "Closed", "Done", "Cancelled", "Canceled", "Mitigated"],
};
const PENDING_DECISION = { equals: "Pending", mode: "insensitive" as const };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Full release bundle: readiness + open blockers + conflicts + pending approvals.
 * @param releaseCode - Business code or id segment (REL-0001).
 */
export async function buildReleaseBundle(releaseCode: string) {
  const detail = await lookupReleaseByCode(releaseCode.trim());
  if (!detail) return null;

  const [blockers, conflicts, pendingApprovals, pendingApprovalRows] =
    await Promise.all([
      prisma.blocker.findMany({
        where: {
          releaseCode: detail.releaseCode,
          status: OPEN_BLOCKER,
        },
        orderBy: { sourceOrder: "asc" },
        take: 12,
        select: {
          blockerCode: true,
          blockerDescription: true,
          severity: true,
          status: true,
          assignedTo: true,
        },
      }),
      prisma.environmentConflict.findMany({
        where: {
          OR: [
            { release1Code: detail.releaseCode },
            { release2Code: detail.releaseCode },
          ],
          status: { notIn: ["Resolved", "Closed", "Cancelled"] },
        },
        orderBy: { sourceOrder: "asc" },
        take: 12,
        select: {
          conflictCode: true,
          status: true,
          priority: true,
          release1Code: true,
          release2Code: true,
          applicationName: true,
        },
      }),
      prisma.approval.count({
        where: {
          release: { releaseCode: detail.releaseCode },
          decision: PENDING_DECISION,
        },
      }),
      prisma.approval.findMany({
        where: {
          release: { releaseCode: detail.releaseCode },
          decision: PENDING_DECISION,
        },
        take: 8,
        select: {
          approvalCode: true,
          approvalType: true,
          decision: true,
        },
      }),
    ]);

  const conflictBookings = detail.bookings.filter((b) => b.conflict).length;
  const dependenciesBlocked = detail.dependencies
    .filter((d) => /blocked|at\s*risk/i.test(d.status))
    .map((d) => d.code);

  const assessment = assessReleaseReadiness({
    releaseCode: detail.releaseCode,
    name: detail.name,
    status: detail.status,
    owner: detail.owner,
    department: detail.department,
    priority: detail.priority,
    releaseDate: detail.releaseDate,
    decision: detail.decision,
    conflictFlag: detail.conflictFlag,
    readinessPercent: detail.readinessPercent,
    goLiveChecklistPercent: detail.goLiveChecklistPercent,
    approvalStatus: detail.approvalStatus,
    releaseHealth: detail.releaseHealth,
    rollbackPlan: detail.rollbackPlan,
    devSignoff: detail.devSignoff,
    testSignoff: detail.testSignoff,
    uatSignoff: detail.uatSignoff,
    securityClearance: detail.securityClearance,
    openBlockers: blockers,
    conflictBookings,
    openRisks: detail.risks,
    pendingApprovals,
    dependenciesBlocked,
  });

  return {
    releaseCode: detail.releaseCode,
    name: detail.name,
    path: `/releases/${detail.releaseCode}`,
    verdict: assessment.verdict,
    spokenSummary: assessment.spokenSummary,
    blockingFactors: assessment.blockingFactors,
    readySignals: assessment.readySignals,
    blockers: blockers.map((b) => ({
      code: b.blockerCode,
      severity: b.severity,
      status: b.status,
      summary: b.blockerDescription.slice(0, 120),
      path: `/blockers/${b.blockerCode}`,
    })),
    conflicts: conflicts.map((c) => ({
      code: c.conflictCode,
      status: c.status,
      priority: c.priority,
      application: c.applicationName,
      releases: `${c.release1Code} / ${c.release2Code}`,
      path: `/conflicts/${c.conflictCode}`,
    })),
    pendingApprovals: pendingApprovalRows.map((a) => ({
      code: a.approvalCode,
      type: a.approvalType,
      decision: a.decision,
      path: `/approvals/${a.approvalCode}`,
    })),
    pendingApprovalCount: pendingApprovals,
  };
}

/**
 * Morning-style attention brief: at-risk/blocked releases + critical blockers + escalated conflicts.
 */
export async function buildAttentionBrief(period: Period = "month") {
  // Period follows product calendar buckets (month | quarter | year).
  const { start, end } = periodRange(period);

  const [attentionRows, criticalBlockers, escalatedConflicts, pendingApprovals] =
    await Promise.all([
      prisma.release.findMany({
        where: {
          releaseDate: { gte: start, lte: end },
          status: { in: ["Blocked", "At Risk"] },
        },
        include: {
          department: true,
          auditEvents: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { releaseDate: "asc" },
        take: 20,
      }),
      prisma.blocker.findMany({
        where: {
          severity: { contains: "Critical", mode: "insensitive" },
          status: OPEN_BLOCKER,
        },
        orderBy: { sourceOrder: "asc" },
        take: 12,
        select: {
          blockerCode: true,
          releaseCode: true,
          severity: true,
          status: true,
          blockerDescription: true,
        },
      }),
      prisma.environmentConflict.findMany({
        where: {
          OR: [
            { status: { contains: "Escalat", mode: "insensitive" } },
            { priority: { contains: "P1", mode: "insensitive" } },
          ],
        },
        orderBy: { sourceOrder: "asc" },
        take: 12,
        select: {
          conflictCode: true,
          status: true,
          priority: true,
          release1Code: true,
          release2Code: true,
          applicationName: true,
        },
      }),
      prisma.approval.findMany({
        where: { decision: PENDING_DECISION },
        take: 12,
        orderBy: { submittedDate: "desc" },
        select: {
          approvalCode: true,
          approvalType: true,
          release: { select: { releaseCode: true, name: true } },
        },
      }),
    ]);

  const attention = sortAttentionItems(attentionRows.map(buildDbAttentionItem)).slice(
    0,
    15
  );

  return {
    period,
    range: { start: isoDate(start), end: isoDate(end) },
    attentionReleases: attention.map((i) => ({
      code: i.code,
      name: i.name,
      status: i.status,
      reason: i.reason,
      path: i.href,
    })),
    criticalBlockers: criticalBlockers.map((b) => ({
      code: b.blockerCode,
      releaseCode: b.releaseCode,
      severity: b.severity,
      status: b.status,
      summary: b.blockerDescription.slice(0, 100),
      path: `/blockers/${b.blockerCode}`,
    })),
    escalatedConflicts: escalatedConflicts.map((c) => ({
      code: c.conflictCode,
      status: c.status,
      priority: c.priority,
      application: c.applicationName,
      path: `/conflicts/${c.conflictCode}`,
    })),
    pendingApprovals: pendingApprovals.map((a) => ({
      code: a.approvalCode,
      type: a.approvalType,
      releaseCode: a.release.releaseCode,
      releaseName: a.release.name,
      path: `/approvals/${a.approvalCode}`,
    })),
    counts: {
      attentionReleases: attention.length,
      criticalBlockers: criticalBlockers.length,
      escalatedConflicts: escalatedConflicts.length,
      pendingApprovals: pendingApprovals.length,
    },
  };
}

/**
 * Releases shipping (or CAB) inside a date window.
 */
export async function buildCalendarWindow(input: {
  from: string;
  to: string;
  field?: "releaseDate" | "cabDate";
}) {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid from/to date — use YYYY-MM-DD");
  }
  if (from > to) throw new Error("from must be on or before to");
  // Cap window at 62 days to keep voice answers short.
  const maxMs = 62 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    throw new Error("Date window too large (max 62 days)");
  }

  const field = input.field === "cabDate" ? "cabDate" : "releaseDate";
  const rows = await prisma.release.findMany({
    where: {
      [field]: { gte: from, lte: to },
    },
    orderBy: { [field]: "asc" },
    take: 30,
    select: {
      releaseCode: true,
      name: true,
      status: true,
      priority: true,
      releaseDate: true,
      cabDate: true,
      department: { select: { name: true } },
    },
  });

  return {
    field,
    from: isoDate(from),
    to: isoDate(to),
    count: rows.length,
    releases: rows.map((r) => ({
      code: r.releaseCode,
      name: r.name,
      status: r.status,
      priority: r.priority,
      department: r.department.name,
      releaseDate: isoDate(r.releaseDate),
      cabDate: r.cabDate ? isoDate(r.cabDate) : null,
      path: `/releases/${r.releaseCode}`,
    })),
  };
}

/**
 * Side-by-side readiness for 2–3 releases.
 */
export async function compareReleaseBundles(codes: string[]) {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))].slice(
    0,
    3
  );
  if (unique.length < 2) {
    throw new Error("Provide at least 2 release codes to compare");
  }
  type Bundle = NonNullable<Awaited<ReturnType<typeof buildReleaseBundle>>>;
  const bundles: Bundle[] = [];
  for (const code of unique) {
    const b = await buildReleaseBundle(code);
    if (b) bundles.push(b);
  }
  return {
    requested: unique,
    found: bundles.map((b) => b.releaseCode),
    missing: unique.filter((c) => !bundles.some((b) => b.releaseCode === c)),
    releases: bundles.map((b) => ({
      code: b.releaseCode,
      name: b.name,
      verdict: b.verdict,
      blockingFactors: b.blockingFactors,
      blockerCount: b.blockers.length,
      conflictCount: b.conflicts.length,
      pendingApprovalCount: b.pendingApprovalCount,
      path: b.path,
      spokenSummary: b.spokenSummary,
    })),
  };
}
