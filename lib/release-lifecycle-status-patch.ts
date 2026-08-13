/**
 * PATCH /api/releases/[id] status-change enforcement.
 *
 * Resolves the release's pinned (or latest-unpinned) lifecycle config, loads
 * gate facts, and runs validateReleaseTransition. Non-status patches skip this.
 */
import { prisma } from "@/lib/prisma";
import { loadBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config-db";
import type { BlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { loadConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config-db";
import type { ConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config";
import { loadDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config-db";
import { loadIncidentLifecycleConfig } from "@/lib/incident-lifecycle-config-db";
import type { IncidentLifecycleConfig } from "@/lib/incident-lifecycle-config";
import { dependencyStatusSatisfiesHardGate } from "@/lib/dependency-lifecycle-transition";
import { enabledStatusMatchValues } from "@/lib/lifecycle-status-roles";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import type { LifecycleConfigPinKind } from "@/lib/release-lifecycle-config-version";
import {
  emptyLifecycleGateFacts,
  validateReleaseTransition,
  type ReleaseLifecycleGateFacts,
  type TransitionResult,
} from "@/lib/release-lifecycle-transition";
import { loadSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config-db";
import {
  mandatorySignoffsComplete,
  signoffStatusCountsAsComplete,
} from "@/lib/signoff-lifecycle-transition";
import { parseCabScopeSnapshot } from "@/lib/release-cab-scope-snapshot";
import { RISK_HIGH_SCORE_THRESHOLD } from "@/lib/risk-lifecycle-config";

export type ReleaseStatusPatchRelease = {
  id: string;
  releaseCode: string;
  status: string;
  name: string;
  owner: string;
  releaseSize: string | null;
  priority: string;
  startDate?: Date | null;
  releaseDate: Date;
  rollbackPlan: string | null;
  notes?: string | null;
  changeFreeze?: string | null;
  goLiveChecklistPercent: number | null;
  lifecycleConfigVersionId: string | null;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
  dressRehearsal?: string | null;
  opsSignoff?: string | null;
  scopeDescription?: string | null;
  postImplementationReviewCompleted?: boolean | null;
  cabScopeSnapshot?: unknown;
};

export type ReleaseStatusEnforcementOk = {
  ok: true;
  canonicalStatus: string;
  result: Extract<TransitionResult, { allowed: true }>;
  configPin: LifecycleConfigPinKind;
  versionId: string | null;
};

export type ReleaseStatusEnforcementDenied = {
  ok: false;
  httpStatus: 409 | 422;
  body: {
    error: string;
    code: Exclude<Extract<TransitionResult, { allowed: false }>["code"], never>;
    transition: Extract<TransitionResult, { allowed: false }>;
    configPin: LifecycleConfigPinKind;
    versionId: string | null;
  };
};

export type ReleaseStatusEnforcementResult =
  | ReleaseStatusEnforcementOk
  | ReleaseStatusEnforcementDenied;

function signoffsLookComplete(
  release: ReleaseStatusPatchRelease,
  signoffConfig: Parameters<typeof mandatorySignoffsComplete>[0]
): boolean {
  // Config-driven: mandatory types must be Approved / Approved with Conditions
  // (legacy Yes/Done aliases resolve via the sign-off lifecycle).
  return mandatorySignoffsComplete(signoffConfig, {
    devSignoff: release.devSignoff,
    testSignoff: release.testSignoff,
    uatSignoff: release.uatSignoff,
    securityClearance: release.securityClearance,
  });
}

/** Raw synced Work Item statuses treated as complete for VR-29 (no local lifecycle). */
const TERMINAL_WORK_ITEM_STATUSES = [
  "Done",
  "Closed",
  "Resolved",
  "Cancelled",
  "Canceled",
  "Complete",
  "Completed",
] as const;

export type ReleaseGateFactStatusLists = {
  blockingBlockerStatuses: string[];
  blockingIncidentStatuses: string[];
  openIncidentStatuses: string[];
  openConflictStatuses: string[];
};

/**
 * Prisma `status in` lists from live related-entity configs (not default keys).
 * @param configs - Caller’s blocker / incident / conflict graphs.
 */
export function releaseGateFactStatusLists(configs: {
  blocker: BlockerLifecycleConfig;
  incident: IncidentLifecycleConfig;
  conflict: ConflictLifecycleConfig;
}): ReleaseGateFactStatusLists {
  return {
    blockingBlockerStatuses: enabledStatusMatchValues(
      configs.blocker.statuses,
      (s) => s.blocksReleaseReady
    ),
    blockingIncidentStatuses: enabledStatusMatchValues(
      configs.incident.statuses,
      (s) => s.blocksLinkedRelease
    ),
    openIncidentStatuses: enabledStatusMatchValues(
      configs.incident.statuses,
      (s) => !s.terminal
    ),
    openConflictStatuses: enabledStatusMatchValues(
      configs.conflict.statuses,
      (s) => !s.terminal
    ),
  };
}

function statusInOrNone(values: string[]): { in: string[] } {
  // Empty `in: []` is engine-dependent; a sentinel matches no real row.
  return { in: values.length > 0 ? values : ["__lifecycle_no_match__"] };
}

/**
 * Load checklist facts for gate evaluation from related tables.
 * Related-entity counts use the caller’s live lifecycle flags (Wave 1).
 * @param release - Release row being patched
 * @param clerkUserId - Caller whose blocker/incident/dependency/conflict config to read
 */
export async function loadReleaseLifecycleGateFacts(
  release: ReleaseStatusPatchRelease,
  clerkUserId: string
): Promise<ReleaseLifecycleGateFacts> {
  const now = new Date();
  const [blockerLoaded, incidentLoaded, dependencyLoaded, conflictLoaded, signoffLoaded] =
    await Promise.all([
      loadBlockerLifecycleConfig(clerkUserId),
      loadIncidentLifecycleConfig(clerkUserId),
      loadDependencyLifecycleConfig(clerkUserId),
      loadConflictLifecycleConfig(clerkUserId),
      loadSignoffLifecycleConfig(clerkUserId),
    ]);
  const signoffConfig = signoffLoaded.config;
  const statusLists = releaseGateFactStatusLists({
    blocker: blockerLoaded.config,
    incident: incidentLoaded.config,
    conflict: conflictLoaded.config,
  });
  const [
    openBlockerCount,
    blockingIncidentCount,
    openIncidentCount,
    openEnvironmentConflictCount,
    applicationCount,
    incompleteWorkItemCount,
    bookings,
    hardDeps,
    deploymentState,
    highRisks,
  ] = await Promise.all([
    prisma.blocker.count({
      where: {
        releaseCode: release.releaseCode,
        status: statusInOrNone(statusLists.blockingBlockerStatuses),
      },
    }),
    // AV-06: incidents whose live status is marked “blocks linked release”.
    prisma.incident.count({
      where: {
        relatedReleaseCode: release.releaseCode,
        status: statusInOrNone(statusLists.blockingIncidentStatuses),
      },
    }),
    // VR-33: any non-terminal linked incident blocks Close (`terminal` on the live graph).
    prisma.incident.count({
      where: {
        relatedReleaseCode: release.releaseCode,
        status: statusInOrNone(statusLists.openIncidentStatuses),
      },
    }),
    // VR-32: non-terminal conflicts involving this release code.
    prisma.environmentConflict.count({
      where: {
        status: statusInOrNone(statusLists.openConflictStatuses),
        OR: [
          { release1Code: release.releaseCode },
          { release2Code: release.releaseCode },
        ],
      },
    }),
    prisma.releaseApplication.count({ where: { releaseId: release.id } }),
    // VR-29: raw synced Work Item status (no local lifecycle).
    prisma.workItem.count({
      where: {
        releaseCode: release.releaseCode,
        status: { notIn: [...TERMINAL_WORK_ITEM_STATUSES] },
      },
    }),
    prisma.envBooking.findMany({
      where: { releaseId: release.id },
      select: {
        status: true,
        purpose: true,
        toDate: true,
        environment: { select: { name: true, type: true } },
      },
    }),
    prisma.releaseDependency.findMany({
      where: { releaseId: release.id, dependencyType: "Hard" },
      select: { status: true },
    }),
    prisma.deploymentState.findUnique({
      where: { releaseId: release.id },
      select: { phase: true },
    }),
    // VR-27: High-score risks without a mitigation plan block Ready.
    // Only score, status, and mitigation text for this release — no extra PII.
    prisma.risk.findMany({
      where: {
        releaseId: release.id,
        riskScore: { gte: RISK_HIGH_SCORE_THRESHOLD },
      },
      select: { mitigationStrategy: true, status: true },
    }),
  ]);

  const activeBooking = (status: string | null | undefined) =>
    status == null || !/^(cancelled|canceled|rejected)$/i.test(status);

  const bookingText = (b: (typeof bookings)[number]) =>
    `${b.purpose ?? ""} ${b.environment?.name ?? ""} ${b.environment?.type ?? ""}`;

  const hasUatBooking = bookings.some(
    (b) => activeBooking(b.status) && /uat/i.test(bookingText(b))
  );

  // Prefer explicit prod/deploy naming; fall back to any active booking (partial reliability).
  const explicitDeploy = bookings.some(
    (b) =>
      activeBooking(b.status) && /prod|production|deploy/i.test(bookingText(b))
  );
  const anyActive = bookings.some((b) => activeBooking(b.status));

  // AV-08: still BOOKED but past toDate — booking window has expired.
  const expiredEnvBookingCount = bookings.filter(
    (b) =>
      /^booked$/i.test(b.status ?? "") &&
      b.toDate instanceof Date &&
      !Number.isNaN(b.toDate.getTime()) &&
      b.toDate.getTime() < now.getTime()
  ).length;

  const hardDependenciesMet =
    hardDeps.length === 0 ||
    hardDeps.every((d) =>
      dependencyStatusSatisfiesHardGate(dependencyLoaded.config, d.status)
    );

  // Wave 2+: no risk role for “does not block Ready”; Closed/Accepted/Mitigated stay label-based.
  const unmitigatedHighRiskCount = highRisks.filter(
    (risk) =>
      !/^(closed|accepted|mitigated)$/i.test(risk.status ?? "") &&
      !risk.mitigationStrategy?.trim()
  ).length;

  return emptyLifecycleGateFacts({
    owner: release.owner,
    releaseSize: release.releaseSize,
    priority: release.priority,
    name: release.name,
    applicationCount,
    startDate: release.startDate,
    releaseDate: release.releaseDate,
    rollbackPlan: release.rollbackPlan,
    notes: release.notes,
    goLiveChecklistPercent: release.goLiveChecklistPercent,
    openBlockerCount,
    blockingIncidentCount,
    openIncidentCount,
    openEnvironmentConflictCount,
    expiredEnvBookingCount,
    // VR-05: non-empty changeFreeze string means an active freeze is recorded.
    changeFreezeActive: Boolean(release.changeFreeze?.trim()),
    deploymentOutcomeConfirmed: /^verified$/i.test(deploymentState?.phase ?? ""),
    testSignoffComplete: signoffStatusCountsAsComplete(
      signoffConfig,
      release.testSignoff
    ),
    dressRehearsalComplete: signoffStatusCountsAsComplete(
      signoffConfig,
      release.dressRehearsal
    ),
    opsSignoffComplete: signoffStatusCountsAsComplete(
      signoffConfig,
      release.opsSignoff
    ),
    unmitigatedHighRiskCount,
    incompleteWorkItemCount,
    pirComplete: Boolean(release.postImplementationReviewCompleted),
    scopeDescription: release.scopeDescription,
    cabScopeSnapshot: parseCabScopeSnapshot(release.cabScopeSnapshot),
    hasUatBooking,
    hasDeployBooking: explicitDeploy || anyActive, // partial: any active booking counts
    hardDependenciesMet,
    signoffsComplete: signoffsLookComplete(release, signoffConfig),
    fields: {
      owner: release.owner,
      releaseSize: release.releaseSize,
      priority: release.priority,
      releaseDate: release.releaseDate,
      rollbackPlan: release.rollbackPlan,
    },
  });
}

/**
 * Derive previous status from the newest status_change audit event, if any.
 */
export async function loadPreviousReleaseStatus(
  releaseId: string,
  currentStatus: string
): Promise<string | null> {
  const events = await prisma.releaseAuditEvent.findMany({
    where: { releaseId, action: "status_change" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { detail: true },
  });
  for (const event of events) {
    const match = event.detail?.match(/^Status changed to (.+)$/);
    const value = match?.[1]?.trim();
    if (value && value !== currentStatus) return value;
  }
  return null;
}

function denialHttpStatus(
  code: Extract<TransitionResult, { allowed: false }>["code"]
): 409 | 422 {
  return code === "TRANSITION_BLOCKED" ? 409 : 422;
}

export type EnforceReleaseStatusChangeDeps = {
  resolveConfig?: typeof resolveLifecycleConfigForRelease;
  loadGateFacts?: typeof loadReleaseLifecycleGateFacts;
  loadPreviousStatus?: typeof loadPreviousReleaseStatus;
};

/**
 * Enforce a requested status change for PATCH. Call only when status is present
 * and differs from the stored value.
 *
 * @param deps - Optional overrides for unit tests (same path as the API route)
 * @throws when config/facts loading fails (caller maps to 500)
 */
export async function enforceReleaseStatusChange(
  args: {
    clerkUserId: string;
    release: ReleaseStatusPatchRelease;
    requestedStatus: string;
    overrideReason?: string | null;
    previousStatusHint?: string | null;
  },
  deps: EnforceReleaseStatusChangeDeps = {}
): Promise<ReleaseStatusEnforcementResult> {
  const resolveConfig =
    deps.resolveConfig ?? resolveLifecycleConfigForRelease;
  const loadGateFacts = deps.loadGateFacts ?? loadReleaseLifecycleGateFacts;
  const loadPreviousStatus =
    deps.loadPreviousStatus ?? loadPreviousReleaseStatus;

  const resolved = await resolveConfig(
    args.clerkUserId,
    args.release.lifecycleConfigVersionId
  );
  const gateFacts = await loadGateFacts(args.release, args.clerkUserId);
  const previousStatus =
    args.previousStatusHint?.trim() ||
    (await loadPreviousStatus(args.release.id, args.release.status));

  const result = validateReleaseTransition({
    config: resolved.config,
    fromStatus: args.release.status,
    toStatus: args.requestedStatus,
    previousStatus,
    overrideReason: args.overrideReason,
    gateFacts,
  });

  if (!result.allowed) {
    return {
      ok: false,
      httpStatus: denialHttpStatus(result.code),
      body: {
        error: result.reason,
        code: result.code,
        transition: result,
        configPin: resolved.configPin,
        versionId: resolved.versionId,
      },
    };
  }

  return {
    ok: true,
    canonicalStatus: result.canonicalStatus,
    result,
    configPin: resolved.configPin,
    versionId: resolved.versionId,
  };
}

/**
 * Shape the NextResponse payload for a denied status change (shared with tests).
 */
export function statusEnforcementDeniedResponse(
  denial: ReleaseStatusEnforcementDenied
): { status: 409 | 422; body: ReleaseStatusEnforcementDenied["body"] } {
  return { status: denial.httpStatus, body: denial.body };
}
