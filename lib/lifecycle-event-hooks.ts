/**
 * Category B event-triggered lifecycle automations (AV-04, AV-05, AV-14, AV-26, CASC-02).
 * Wired from entity write paths after committed mutations — not from gate evaluation alone.
 */
import { prisma } from "@/lib/prisma";
import { createDefaultConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config";
import { createDefaultDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config";
import { validateDependencyTransition } from "@/lib/dependency-lifecycle-transition";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  emptyLifecycleGateFacts,
  resolveLifecycleStatusRef,
  validateReleaseTransition,
} from "@/lib/release-lifecycle-transition";
import { loadPreviousReleaseStatus } from "@/lib/release-lifecycle-status-patch";
import { sameUtcDeployDay } from "@/lib/lifecycle-automations/time";
import {
  isDriftEscalatedStatus,
  orderedReleaseCodes,
} from "@/lib/lifecycle-event-hook-helpers";

export { isDriftEscalatedStatus, orderedReleaseCodes };

const OPEN_BLOCKER_EXCLUDED = [
  "Resolved",
  "Closed",
  "Done",
  "Cancelled",
  "Canceled",
  "Mitigated",
] as const;

const TERMINAL_RELEASE_KEYS = new Set([
  "deployed",
  "closed",
  "cancelled",
]);

/**
 * AV-04 — when a release becomes Deployed, mark Pending/At Risk deps that point at it as Met.
 * @param deployedReleaseId - Release that just landed on Deployed
 * @returns Count of dependency rows updated
 */
export async function cascadeDependenciesMetOnDeploy(
  deployedReleaseId: string
): Promise<number> {
  const config = createDefaultDependencyLifecycleConfig();
  const metLabel =
    config.statuses.find((s) => s.key === "met")?.label ?? "Met";
  const openLabels = config.statuses
    .filter((s) => s.key === "pending" || s.key === "at_risk")
    .map((s) => s.label);

  const deps = await prisma.releaseDependency.findMany({
    where: {
      dependsOnReleaseId: deployedReleaseId,
      OR: [
        { status: { in: openLabels } },
        { status: null },
        { status: "" },
      ],
    },
    select: { id: true, status: true, notes: true },
  });

  let updated = 0;
  for (const dep of deps) {
    const fromStatus = dep.status?.trim() || "Pending";
    const transition = validateDependencyTransition({
      config,
      fromStatus,
      toStatus: metLabel,
      facts: { notes: dep.notes },
    });
    if (!transition.allowed) continue;
    await prisma.releaseDependency.update({
      where: { id: dep.id },
      data: { status: transition.canonicalStatus },
    });
    updated += 1;
  }
  if (updated > 0) {
    console.warn("[lifecycle-hook] AV-04 dependencies marked Met", {
      deployedReleaseId,
      updated,
    });
  }
  return updated;
}

/**
 * AV-26 — when a release rolls back, flip Met deps that depend on it to At Risk (system-only).
 * Creates a MonitoringAlert per affected downstream release application when possible.
 * @param rolledBackReleaseId - Predecessor that rolled back
 */
export async function cascadeDependenciesAtRiskOnRollback(
  rolledBackReleaseId: string
): Promise<number> {
  const config = createDefaultDependencyLifecycleConfig();
  const metLabel =
    config.statuses.find((s) => s.key === "met")?.label ?? "Met";
  const atRiskLabel =
    config.statuses.find((s) => s.key === "at_risk")?.label ?? "At Risk";

  const deps = await prisma.releaseDependency.findMany({
    where: {
      dependsOnReleaseId: rolledBackReleaseId,
      status: metLabel,
    },
    select: {
      id: true,
      status: true,
      notes: true,
      dependencyCode: true,
      release: {
        select: {
          id: true,
          releaseCode: true,
          owner: true,
          applications: {
            take: 1,
            select: { applicationId: true, application: { select: { name: true } } },
          },
        },
      },
      dependsOnRelease: { select: { releaseCode: true } },
    },
  });

  let updated = 0;
  const now = new Date();
  for (const dep of deps) {
    // Security: Met→At Risk is system-only — never expose via user PATCH without this flag.
    const transition = validateDependencyTransition({
      config,
      fromStatus: dep.status ?? metLabel,
      toStatus: atRiskLabel,
      facts: { notes: dep.notes },
      isSystemTransition: true,
    });
    if (!transition.allowed) continue;

    await prisma.releaseDependency.update({
      where: { id: dep.id },
      data: {
        status: transition.canonicalStatus,
        notes: dep.notes?.trim()
          ? dep.notes
          : `AV-26: predecessor ${dep.dependsOnRelease.releaseCode} rolled back`,
      },
    });
    updated += 1;

    const appId = dep.release.applications[0]?.applicationId;
    if (appId) {
      const alertCode = `AV26-${dep.dependencyCode ?? dep.id}`;
      const existing = await prisma.monitoringAlert.findUnique({
        where: { alertCode },
        select: { id: true },
      });
      if (!existing) {
        const maxOrder = await prisma.monitoringAlert.aggregate({
          _max: { sourceOrder: true },
        });
        await prisma.monitoringAlert.create({
          data: {
            alertCode,
            timestamp: now,
            applicationId: appId,
            alertType: "Escalation",
            severity: "High",
            metric: "dependency_rollback",
            threshold: "Met",
            currentValue: "At Risk",
            status: "Pending",
            environmentName: "n/a",
            assignedTo: dep.release.owner || null,
            sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
          },
        });
      }
    }
  }
  if (updated > 0) {
    console.warn("[lifecycle-hook] AV-26 dependencies flagged At Risk", {
      rolledBackReleaseId,
      updated,
    });
  }
  return updated;
}

/**
 * AV-05 — create Schedule EnvironmentConflict rows when releaseDate overlaps another release.
 * Idempotent for the unordered release pair while an open conflict already exists.
 *
 * @param releaseId - Release whose deploy date was saved
 * @param releaseDate - New deploy/end date
 */
export async function detectScheduleConflictsOnDeployDate(
  releaseId: string,
  releaseDate: Date | null | undefined
): Promise<number> {
  if (!releaseDate || Number.isNaN(releaseDate.getTime())) return 0;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      releaseCode: true,
      status: true,
      department: { select: { name: true } },
      applications: {
        select: {
          applicationId: true,
          application: { select: { name: true } },
        },
      },
    },
  });
  if (!release) return 0;

  const config = createDefaultReleaseLifecycleConfig();
  const selfKey = resolveLifecycleStatusRef(config, release.status)?.key;
  if (selfKey && TERMINAL_RELEASE_KEYS.has(selfKey)) return 0;

  const appIds = release.applications.map((a) => a.applicationId);
  if (appIds.length === 0) return 0;

  const others = await prisma.release.findMany({
    where: {
      id: { not: releaseId },
      releaseDate: {
        gte: new Date(
          Date.UTC(
            releaseDate.getUTCFullYear(),
            releaseDate.getUTCMonth(),
            releaseDate.getUTCDate()
          )
        ),
        lt: new Date(
          Date.UTC(
            releaseDate.getUTCFullYear(),
            releaseDate.getUTCMonth(),
            releaseDate.getUTCDate() + 1
          )
        ),
      },
      applications: { some: { applicationId: { in: appIds } } },
    },
    select: {
      id: true,
      releaseCode: true,
      status: true,
      releaseDate: true,
      applications: {
        where: { applicationId: { in: appIds } },
        select: { application: { select: { name: true } } },
      },
    },
    take: 50,
  });

  const conflictConfig = createDefaultConflictLifecycleConfig();
  const detectedLabel =
    conflictConfig.statuses.find((s) => s.key === "detected")?.label ??
    "Detected";
  const scheduleType =
    conflictConfig.types.find((t) => t.key === "schedule")?.label ?? "Schedule";

  let created = 0;
  for (const other of others) {
    if (!sameUtcDeployDay(releaseDate, other.releaseDate)) continue;
    const otherKey = resolveLifecycleStatusRef(config, other.status)?.key;
    if (otherKey && TERMINAL_RELEASE_KEYS.has(otherKey)) continue;

    const [r1, r2] = orderedReleaseCodes(
      release.releaseCode,
      other.releaseCode
    );
    const existing = await prisma.environmentConflict.findFirst({
      where: {
        release1Code: r1,
        release2Code: r2,
        status: { in: ["Detected", "Under Review"] },
      },
      select: { id: true },
    });
    if (existing) continue;

    const appName =
      other.applications[0]?.application.name ??
      release.applications[0]?.application.name ??
      "Unknown";

    const codes = await prisma.environmentConflict.findMany({
      select: { conflictCode: true, sourceOrder: true },
    });
    const nextNum =
      codes.reduce((max, row) => {
        const match = row.conflictCode.match(/^CNF-(\d+)$/i);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
    const conflictCode = `CNF-${String(nextNum).padStart(4, "0")}`;
    const nextOrder =
      codes.reduce((max, row) => Math.max(max, row.sourceOrder ?? 0), 0) + 1;

    await prisma.environmentConflict.create({
      data: {
        conflictCode,
        status: detectedLabel,
        priority: "Medium",
        release1Code: r1,
        release2Code: r2,
        applicationName: appName,
        departmentName: release.department?.name ?? "",
        conflictingEnvironment: "Deploy window",
        environmentConflictType: scheduleType,
        notes: "AV-05: auto-detected same deploy day + shared application",
        sourceOrder: nextOrder,
      },
    });
    created += 1;
  }
  if (created > 0) {
    console.warn("[lifecycle-hook] AV-05 schedule conflicts created", {
      releaseCode: release.releaseCode,
      created,
    });
  }
  return created;
}

/**
 * AV-14 — create MonitoringAlert when Drift moves to Escalated.
 * Idempotent via alertCode `DRIFT-ESC-{driftCode}`.
 */
export async function createMonitoringAlertOnDriftEscalated(args: {
  driftCode: string;
  applicationId: string;
  departmentName: string | null;
  environmentName: string;
  severity: string;
}): Promise<boolean> {
  const alertCode = `DRIFT-ESC-${args.driftCode}`;
  const existing = await prisma.monitoringAlert.findUnique({
    where: { alertCode },
    select: { id: true },
  });
  if (existing) return false;

  const maxOrder = await prisma.monitoringAlert.aggregate({
    _max: { sourceOrder: true },
  });
  await prisma.monitoringAlert.create({
    data: {
      alertCode,
      timestamp: new Date(),
      applicationId: args.applicationId,
      departmentName: args.departmentName,
      alertType: "Escalation",
      severity: args.severity || "High",
      metric: "config_drift_escalated",
      threshold: "Escalated",
      currentValue: "Escalated",
      status: "Pending",
      environmentName: args.environmentName,
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
  });
  console.warn("[lifecycle-hook] AV-14 drift escalation alert", {
    driftCode: args.driftCode,
    alertCode,
  });
  return true;
}

/**
 * CASC-02 — when a blocker becomes Resolved, auto-return Blocked release to previous status
 * if no other open blockers remain. Trigger is Resolved only (not Closed).
 *
 * @param releaseCode - Denormalized Blocker.releaseCode
 */
export async function cascadeUnblockReleaseOnBlockerResolved(
  releaseCode: string
): Promise<boolean> {
  const release = await prisma.release.findUnique({
    where: { releaseCode },
    select: {
      id: true,
      releaseCode: true,
      status: true,
      owner: true,
      releaseSize: true,
      priority: true,
      releaseDate: true,
      rollbackPlan: true,
      notes: true,
      goLiveChecklistPercent: true,
      lifecycleConfigVersionId: true,
      devSignoff: true,
      testSignoff: true,
      uatSignoff: true,
      securityClearance: true,
    },
  });
  if (!release) return false;

  const config = createDefaultReleaseLifecycleConfig();
  const statusKey = resolveLifecycleStatusRef(config, release.status)?.key;
  if (statusKey !== "blocked") return false;

  const openCount = await prisma.blocker.count({
    where: {
      releaseCode,
      status: { notIn: [...OPEN_BLOCKER_EXCLUDED] },
    },
  });
  if (openCount > 0) return false;

  const previousStatus = await loadPreviousReleaseStatus(
    release.id,
    release.status
  );
  if (!previousStatus) {
    console.warn("[lifecycle-hook] CASC-02 skipped — no previous status", {
      releaseCode,
    });
    return false;
  }

  const gateFacts = emptyLifecycleGateFacts({
    owner: release.owner,
    releaseSize: release.releaseSize,
    priority: release.priority,
    releaseDate: release.releaseDate,
    rollbackPlan: release.rollbackPlan,
    notes: release.notes,
    goLiveChecklistPercent: release.goLiveChecklistPercent,
    openBlockerCount: 0,
    hardDependenciesMet: true,
    signoffsComplete: true,
  });

  const transition = validateReleaseTransition({
    config,
    fromStatus: release.status,
    toStatus: previousStatus,
    previousStatus,
    overrideReason: "CASC-02: auto-unblock after blocker Resolved",
    gateFacts,
  });
  if (!transition.allowed) {
    console.warn("[lifecycle-hook] CASC-02 transition denied", {
      releaseCode,
      reason: transition.reason,
    });
    return false;
  }

  await prisma.release.update({
    where: { id: release.id },
    data: { status: transition.canonicalStatus },
  });
  await prisma.releaseAuditEvent.create({
    data: {
      releaseId: release.id,
      actor: "system",
      action: "status_change",
      detail: `Status changed to ${transition.canonicalStatus}`,
    },
  });
  console.warn("[lifecycle-hook] CASC-02 auto-unblocked release", {
    releaseCode,
    to: transition.canonicalStatus,
  });
  return true;
}
