/**
 * Category B event-triggered lifecycle automations (AV-04, AV-05, AV-14, AV-26, CASC-02).
 * Wired from entity write paths after committed mutations — not from gate evaluation alone.
 */
import { prisma } from "@/lib/prisma";
import { createAutoMonitoringAlert } from "@/lib/alert-repeat-suppress";
import { loadBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config-db";
import { loadIncidentLifecycleConfig } from "@/lib/incident-lifecycle-config-db";
import {
  findScheduleConflictFindings,
  raiseConflictFindings,
} from "@/lib/conflict-detectors";
import { loadDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config-db";
import {
  resolveDependencyRollbackCascade,
  validateDependencyTransition,
} from "@/lib/dependency-lifecycle-transition";
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
 * AV-26 — when a release enters the rollback milestone, reopen deps flagged
 * “reopen on predecessor rollback” into the rollback-warning status (system-only).
 * Creates a MonitoringAlert per affected downstream release application when possible.
 * @param rolledBackReleaseId - Predecessor that rolled back
 * @param clerkUserId - Caller whose dependency config to read
 */
export async function cascadeDependenciesAtRiskOnRollback(
  rolledBackReleaseId: string,
  clerkUserId: string
): Promise<CascadeHookResult> {
  const { config } = await loadDependencyLifecycleConfig(clerkUserId);
  const plan = resolveDependencyRollbackCascade(config);
  if (!plan.ok) {
    return { count: 0, roleFault: plan.fault };
  }

  const deps = await prisma.releaseDependency.findMany({
    where: {
      dependsOnReleaseId: rolledBackReleaseId,
      OR: [
        { status: statusInOrNone(plan.sourceValues) },
        { statusKey: statusInOrNone(plan.sourceValues) },
      ],
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
  const destLabel = plan.dest.label;
  const destKey = plan.dest.key;
  for (const dep of deps) {
    // Security: reopen is system-only — never expose via user PATCH without this flag.
    const transition = validateDependencyTransition({
      config,
      fromStatus: dep.status ?? plan.sourceValues[0] ?? destLabel,
      toStatus: destLabel,
      facts: { notes: dep.notes },
      isSystemTransition: true,
    });
    if (!transition.allowed) continue;

    await prisma.releaseDependency.update({
      where: { id: dep.id },
      data: {
        status: transition.canonicalStatus,
        statusKey: destKey,
        notes: dep.notes?.trim()
          ? dep.notes
          : `AV-26: predecessor ${dep.dependsOnRelease.releaseCode} rolled back`,
      },
    });
    updated += 1;

    const appId = dep.release.applications[0]?.applicationId;
    if (appId) {
      const fromLabel = dep.status?.trim() || plan.sourceValues[0] || "met";
      await createAutoMonitoringAlert({
        clerkUserId,
        baseAlertCode: `AV26-${dep.dependencyCode ?? dep.id}`,
        applicationId: appId,
        alertType: "Escalation",
        alertSource: "Dependency",
        severity: "High",
        metric: "dependency_rollback",
        threshold: fromLabel,
        currentValue: destLabel,
        environmentName: "n/a",
        assignedTo: dep.release.owner || null,
      });
    }
  }
  if (updated > 0) {
    console.warn("[lifecycle-hook] AV-26 dependencies flagged after rollback", {
      rolledBackReleaseId,
      updated,
    });
  }
  return { count: updated };
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
    select: { releaseCode: true },
  });
  if (!release) return { count: 0 };

  const findings = await findScheduleConflictFindings({
    clerkUserId,
    releaseId,
    releaseDate,
  });
  const raised = await raiseConflictFindings({
    clerkUserId,
    release1Code: release.releaseCode,
    findings,
    raisedBy: "System (AV-05)",
    automation: "AV-05",
  });
  if (raised.count > 0) {
    console.warn("[lifecycle-hook] AV-05 schedule conflicts created", {
      releaseCode: release.releaseCode,
      created: raised.count,
    });
  }
  return raised;
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
  const result = await createAutoMonitoringAlert({
    baseAlertCode: `DRIFT-ESC-${args.driftCode}`,
    applicationId: args.applicationId,
    departmentName: args.departmentName,
    alertType: "Escalation",
    alertSource: "System",
    severity: args.severity || "High",
    metric: "config_drift_escalated",
    threshold: "Escalated",
    currentValue: "Escalated",
    environmentName: args.environmentName,
  });
  if (result === "suppressed") return false;
  console.warn("[lifecycle-hook] AV-14 drift escalation alert", {
    driftCode: args.driftCode,
    alertCode: `DRIFT-ESC-${args.driftCode}`,
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
