/**
 * PATCH /api/releases/[id] status-change enforcement.
 *
 * Resolves the release's pinned (or latest-unpinned) lifecycle config, loads
 * gate facts, and runs validateReleaseTransition. Non-status patches skip this.
 */
import { prisma } from "@/lib/prisma";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import type { LifecycleConfigPinKind } from "@/lib/release-lifecycle-config-version";
import {
  emptyLifecycleGateFacts,
  validateReleaseTransition,
  type ReleaseLifecycleGateFacts,
  type TransitionResult,
} from "@/lib/release-lifecycle-transition";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { mandatorySignoffsComplete } from "@/lib/signoff-lifecycle-transition";

const OPEN_BLOCKER_STATUSES_EXCLUDED = [
  "Resolved",
  "Closed",
  "Done",
  "Cancelled",
  "Canceled",
  "Mitigated",
] as const;
/** Hard deps that satisfy VR-18 — includes lifecycle Met/Waived/Removed + legacy Clear/Resolved. */
const HARD_DEP_CLEAR = [
  "Met",
  "Waived",
  "Removed",
  "Clear",
  "Resolved",
] as const;

export type ReleaseStatusPatchRelease = {
  id: string;
  releaseCode: string;
  status: string;
  owner: string;
  releaseSize: string | null;
  priority: string;
  releaseDate: Date;
  rollbackPlan: string | null;
  notes?: string | null;
  goLiveChecklistPercent: number | null;
  lifecycleConfigVersionId: string | null;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
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

function signoffsLookComplete(release: ReleaseStatusPatchRelease): boolean {
  // Config-driven: mandatory types must be Approved / Approved with Conditions
  // (legacy Yes/Done aliases resolve via the sign-off lifecycle).
  return mandatorySignoffsComplete(createDefaultSignoffLifecycleConfig(), {
    devSignoff: release.devSignoff,
    testSignoff: release.testSignoff,
    uatSignoff: release.uatSignoff,
    securityClearance: release.securityClearance,
  });
}

/**
 * Load checklist facts for gate evaluation from related tables.
 * @param release - Release row being patched
 */
export async function loadReleaseLifecycleGateFacts(
  release: ReleaseStatusPatchRelease
): Promise<ReleaseLifecycleGateFacts> {
  const [openBlockerCount, bookings, hardDeps] = await Promise.all([
    prisma.blocker.count({
      where: {
        releaseCode: release.releaseCode,
        status: { notIn: [...OPEN_BLOCKER_STATUSES_EXCLUDED] },
      },
    }),
    prisma.envBooking.findMany({
      where: { releaseId: release.id },
      select: {
        status: true,
        purpose: true,
        environment: { select: { name: true, type: true } },
      },
    }),
    prisma.releaseDependency.findMany({
      where: { releaseId: release.id, dependencyType: "Hard" },
      select: { status: true },
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

  const hardDependenciesMet =
    hardDeps.length === 0 ||
    hardDeps.every((d) =>
      HARD_DEP_CLEAR.some(
        (ok) =>
          (d.status ?? "").localeCompare(ok, undefined, { sensitivity: "accent" }) ===
          0
      )
    );

  return emptyLifecycleGateFacts({
    owner: release.owner,
    releaseSize: release.releaseSize,
    priority: release.priority,
    releaseDate: release.releaseDate,
    rollbackPlan: release.rollbackPlan,
    notes: release.notes,
    goLiveChecklistPercent: release.goLiveChecklistPercent,
    openBlockerCount,
    hasUatBooking,
    hasDeployBooking: explicitDeploy || anyActive, // partial: any active booking counts
    hardDependenciesMet,
    signoffsComplete: signoffsLookComplete(release),
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
  const gateFacts = await loadGateFacts(args.release);
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
