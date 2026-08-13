/**
 * Category B event-triggered lifecycle automations (AV-04, AV-05, AV-14, AV-26, CASC-02).
 * Wired from entity write paths after committed mutations — not from gate evaluation alone.
 */
import { prisma } from "@/lib/prisma";
import { loadBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config-db";
import { loadIncidentLifecycleConfig } from "@/lib/incident-lifecycle-config-db";
import { loadConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config-db";
import { createDefaultDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config";
import { loadDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config-db";
import { validateDependencyTransition } from "@/lib/dependency-lifecycle-transition";
import {
  enabledStatusMatchValues,
  reportLifecycleRoleFault,
  resolveExclusiveRole,
  type LifecycleRoleFault,
} from "@/lib/lifecycle-status-roles";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
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

export type CascadeHookResult = {
  count: number;
  roleFault?: LifecycleRoleFault;
};

function statusInOrNone(values: string[]): { in: string[] } {
  return { in: values.length > 0 ? values : ["__lifecycle_no_match__"] };
}

function skipFinishedRelease(status: {
  terminal: boolean;
  deployedMilestone: boolean;
}): boolean {
  return status.terminal || status.deployedMilestone;
}

/**
 * AV-04 — when a release enters the Deployed milestone, mark open deps that
 * point at it as the first legal “counts as met” status (sort order).
 * @param deployedReleaseId - Release that just landed on the Deployed milestone
 * @param clerkUserId - Caller whose dependency config to read
 */
export async function cascadeDependenciesMetOnDeploy(
  deployedReleaseId: string,
  clerkUserId: string
): Promise<CascadeHookResult> {
  const { config } = await loadDependencyLifecycleConfig(clerkUserId);
  const metStatuses = config.statuses
    .filter((s) => s.enabled && s.satisfiesHardGate)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (metStatuses.length === 0) {
    const resolved = resolveExclusiveRole(
      config.statuses,
      (s) => s.satisfiesHardGate,
      "satisfiesHardGate",
      "AV-04"
    );
    const fault = resolved.ok
      ? undefined
      : resolved.fault;
    if (fault) reportLifecycleRoleFault(fault);
    return { count: 0, roleFault: fault };
  }
  const openValues = enabledStatusMatchValues(
    config.statuses,
    (s) => !s.satisfiesHardGate
  );
  const intake = config.statuses.find((s) => s.enabled && s.isIntake);
  const fallbackFrom = intake?.label ?? "Pending";

  const deps = await prisma.releaseDependency.findMany({
    where: {
      dependsOnReleaseId: deployedReleaseId,
      OR: [
        { status: statusInOrNone(openValues) },
        { status: null },
        { status: "" },
      ],
    },
    select: { id: true, status: true, notes: true },
  });

  let updated = 0;
  for (const dep of deps) {
    const fromStatus = dep.status?.trim() || fallbackFrom;
    const dest = metStatuses.find((to) =>
      validateDependencyTransition({
        config,
        fromStatus,
        toStatus: to.label,
        facts: { notes: dep.notes },
      }).allowed
    );
    if (!dest) continue;
    const transition = validateDependencyTransition({
      config,
      fromStatus,
      toStatus: dest.label,
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
  return { count: updated };
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
  releaseDate: Date | null | undefined,
  clerkUserId: string
): Promise<CascadeHookResult> {
  if (!releaseDate || Number.isNaN(releaseDate.getTime())) return { count: 0 };

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      releaseCode: true,
      status: true,
      lifecycleConfigVersionId: true,
      department: { select: { name: true } },
      applications: {
        select: {
          applicationId: true,
          application: { select: { name: true } },
        },
      },
    },
  });
  if (!release) return { count: 0 };

  const { config } = await resolveLifecycleConfigForRelease(
    clerkUserId,
    release.lifecycleConfigVersionId
  );
  const self = resolveLifecycleStatusRef(config, release.status);
  if (self && skipFinishedRelease(self)) return { count: 0 };

  const appIds = release.applications.map((a) => a.applicationId);
  if (appIds.length === 0) return { count: 0 };

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

  const { config: conflictConfig } = await loadConflictLifecycleConfig(clerkUserId);
  const intake = resolveExclusiveRole(
    conflictConfig.statuses,
    (s) => s.isIntake,
    "isIntake",
    "AV-05"
  );
  if (!intake.ok) {
    reportLifecycleRoleFault(intake.fault);
    return { count: 0, roleFault: intake.fault };
  }
  const detectedLabel = intake.status.label;
  const openConflictValues = enabledStatusMatchValues(
    conflictConfig.statuses,
    (s) => !s.terminal
  );
  const scheduleType =
    conflictConfig.types.find((t) => t.key === "schedule")?.label ?? "Schedule";

  let created = 0;
  for (const other of others) {
    if (!sameUtcDeployDay(releaseDate, other.releaseDate)) continue;
    const otherStatus = resolveLifecycleStatusRef(config, other.status);
    if (otherStatus && skipFinishedRelease(otherStatus)) continue;

    const [r1, r2] = orderedReleaseCodes(
      release.releaseCode,
      other.releaseCode
    );
    const existing = await prisma.environmentConflict.findFirst({
      where: {
        release1Code: r1,
        release2Code: r2,
        status: statusInOrNone(openConflictValues),
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
  return { count: created };
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
 * CASC-02 — when a blocker enters the unblock-parent status, auto-return an
 * interrupt (Blocked) release to its previous status if no other blockers
 * still marked “blocks Ready” remain.
 *
 * @param releaseCode - Denormalized Blocker.releaseCode
 */
export async function cascadeUnblockReleaseOnBlockerResolved(
  releaseCode: string,
  clerkUserId: string
): Promise<{ unblocked: boolean; roleFault?: LifecycleRoleFault }> {
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
  if (!release) return { unblocked: false };

  const { config } = await resolveLifecycleConfigForRelease(
    clerkUserId,
    release.lifecycleConfigVersionId
  );
  const current = resolveLifecycleStatusRef(config, release.status);
  // Wait-for-unblock is the interrupt kind (Blocked). Rolled Back is also
  // interrupt — the transition engine denies that path if the graph says so.
  if (!current || current.kind !== "interrupt") return { unblocked: false };

  const { config: blockerConfig } = await loadBlockerLifecycleConfig(clerkUserId);
  const blockingValues = enabledStatusMatchValues(
    blockerConfig.statuses,
    (s) => s.blocksReleaseReady
  );
  const openCount = await prisma.blocker.count({
    where: {
      releaseCode,
      status: statusInOrNone(blockingValues),
    },
  });
  if (openCount > 0) return { unblocked: false };

  const previousStatus = await loadPreviousReleaseStatus(
    release.id,
    release.status
  );
  if (!previousStatus) {
    console.warn("[lifecycle-hook] CASC-02 skipped — no previous status", {
      releaseCode,
    });
    return { unblocked: false };
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
    overrideReason: "CASC-02: auto-unblock after blocker entered the unblock status",
    gateFacts,
  });
  if (!transition.allowed) {
    console.warn("[lifecycle-hook] CASC-02 transition denied", {
      releaseCode,
      reason: transition.reason,
    });
    return { unblocked: false };
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
  return { unblocked: true };
}

/**
 * When an incident enters the unblock-parent status, auto-return a Blocked
 * release to its previous status if no other blocking incidents or blockers remain.
 *
 * @param releaseCode - Incident.relatedReleaseCode
 */
export async function cascadeUnblockReleaseOnIncidentResolved(
  releaseCode: string,
  clerkUserId: string
): Promise<{ unblocked: boolean; roleFault?: LifecycleRoleFault }> {
  const trimmed = releaseCode.trim();
  if (!trimmed) return { unblocked: false };

  const release = await prisma.release.findUnique({
    where: { releaseCode: trimmed },
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
  if (!release) return { unblocked: false };

  const { config } = await resolveLifecycleConfigForRelease(
    clerkUserId,
    release.lifecycleConfigVersionId
  );
  const current = resolveLifecycleStatusRef(config, release.status);
  if (!current || current.kind !== "interrupt") return { unblocked: false };

  const [{ config: incidentConfig }, { config: blockerConfig }] = await Promise.all([
    loadIncidentLifecycleConfig(clerkUserId),
    loadBlockerLifecycleConfig(clerkUserId),
  ]);
  const blockingIncidentValues = enabledStatusMatchValues(
    incidentConfig.statuses,
    (s) => s.blocksLinkedRelease
  );
  const blockingBlockerValues = enabledStatusMatchValues(
    blockerConfig.statuses,
    (s) => s.blocksReleaseReady
  );
  const [openIncidentCount, openBlockerCount] = await Promise.all([
    prisma.incident.count({
      where: {
        relatedReleaseCode: trimmed,
        status: statusInOrNone(blockingIncidentValues),
      },
    }),
    prisma.blocker.count({
      where: {
        releaseCode: trimmed,
        status: statusInOrNone(blockingBlockerValues),
      },
    }),
  ]);
  if (openIncidentCount > 0 || openBlockerCount > 0) return { unblocked: false };

  const previousStatus = await loadPreviousReleaseStatus(
    release.id,
    release.status
  );
  if (!previousStatus) {
    console.warn("[lifecycle-hook] incident unblock skipped — no previous status", {
      releaseCode: trimmed,
    });
    return { unblocked: false };
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
    blockingIncidentCount: 0,
    hardDependenciesMet: true,
    signoffsComplete: true,
  });

  const transition = validateReleaseTransition({
    config,
    fromStatus: release.status,
    toStatus: previousStatus,
    previousStatus,
    overrideReason: "Incident resolved: auto-unblock after incident entered the unblock status",
    gateFacts,
  });
  if (!transition.allowed) {
    console.warn("[lifecycle-hook] incident unblock transition denied", {
      releaseCode: trimmed,
      reason: transition.reason,
    });
    return { unblocked: false };
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
  console.warn("[lifecycle-hook] incident auto-unblocked release", {
    releaseCode: trimmed,
    to: transition.canonicalStatus,
  });
  return { unblocked: true };
}
