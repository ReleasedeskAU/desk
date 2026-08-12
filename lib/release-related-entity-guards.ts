/**
 * Cross-entity guards driven by parent Release status (Related Entity Lock Rules).
 *
 * - VR-36: freeze dependency graph add/remove once Release ≥ Ready
 * - §3-06: lock environment booking mutations while Release is Deploying
 * - CASC-13: withdraw open Approvals when Release becomes Cancelled
 *
 * These are separate from per-entity lifecycle terminal locks and from Agent 1
 * field locks — do not combine those systems here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createDefaultReleaseLifecycleConfig,
  type ReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";

/** Status keys at or beyond Ready on the enterprise mainline (VR-36). */
const READY_OR_BEYOND_KEYS = new Set([
  "ready_to_deploy",
  "deploying",
  "deployed",
  "closed",
]);

/** Status keys at or beyond Deploying (VR-35 — no new blockers). */
const DEPLOYING_OR_BEYOND_KEYS = new Set([
  "deploying",
  "deployed",
  "closed",
]);

export type RelatedEntityGuardDenial = {
  ok: false;
  response: NextResponse;
};

export type RelatedEntityGuardOk = { ok: true };

/**
 * Resolve whether a release status label/key is at or beyond Ready to deploy.
 * Uses lifecycle config keys when resolvable; falls back to known Ready+ keys.
 *
 * @param status - Release.status label or key
 * @param config - Optional lifecycle config (defaults to enterprise default)
 */
export function isReleaseAtOrBeyondReady(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  const resolved = resolveLifecycleStatusRef(config, status);
  if (resolved) return READY_OR_BEYOND_KEYS.has(resolved.key);
  const normalized = status.trim().toLowerCase().replace(/\s+/g, "_");
  return READY_OR_BEYOND_KEYS.has(normalized);
}

/**
 * True when the release is in Deploying (§3-06).
 * @param status - Release.status label or key
 * @param config - Optional lifecycle config
 */
export function isReleaseDeploying(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  const resolved = resolveLifecycleStatusRef(config, status);
  if (resolved) return resolved.key === "deploying";
  return /^deploying$/i.test(status.trim());
}

/**
 * True when the release is Deploying or later on the mainline (VR-35).
 * @param status - Release.status label or key
 * @param config - Optional lifecycle config
 */
export function isReleaseAtOrBeyondDeploying(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  const resolved = resolveLifecycleStatusRef(config, status);
  if (resolved) return DEPLOYING_OR_BEYOND_KEYS.has(resolved.key);
  const normalized = status.trim().toLowerCase().replace(/\s+/g, "_");
  return DEPLOYING_OR_BEYOND_KEYS.has(normalized);
}

/**
 * VR-35 — deny creating a new Blocker once the parent release is Deploying or later.
 * @param releaseStatus - Parent release status
 */
export function guardBlockerCreateWhileDeployingOrLater(
  releaseStatus: string
): RelatedEntityGuardOk | RelatedEntityGuardDenial {
  if (!isReleaseAtOrBeyondDeploying(releaseStatus)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Blockers can’t be created now. This release is Deploying or further along. Resolve issues through the existing deploy process, or move the release back earlier if a new blocker must be raised.",
        code: "VR35_BLOCKER_CREATE_LOCKED",
      },
      { status: 409 }
    ),
  };
}

/**
 * True when the release is Cancelled (CASC-13 trigger).
 * @param status - Release.status label or key
 * @param config - Optional lifecycle config
 */
export function isReleaseCancelled(
  status: string,
  config: ReleaseLifecycleConfig = createDefaultReleaseLifecycleConfig()
): boolean {
  const resolved = resolveLifecycleStatusRef(config, status);
  if (resolved) return resolved.key === "cancelled";
  return /^cancell?ed$/i.test(status.trim());
}

/**
 * VR-36 — deny dependency create / delete / endpoint rewiring when parent ≥ Ready.
 * @param releaseStatus - Parent release status
 * @returns Guard result with a 409 response when frozen
 */
export function guardDependencyGraphMutation(
  releaseStatus: string
): RelatedEntityGuardOk | RelatedEntityGuardDenial {
  if (!isReleaseAtOrBeyondReady(releaseStatus)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Dependencies can’t be changed now. This release is Ready to deploy or further along, so the dependency list is locked. Move the release back earlier in the workflow if dependencies must change.",
        code: "VR36_DEPENDENCY_GRAPH_FROZEN",
      },
      { status: 409 }
    ),
  };
}

/**
 * §3-06 — deny env booking create/update/delete while parent is Deploying.
 * @param releaseStatus - Linked (or target) release status
 */
export function guardEnvBookingMutationWhileDeploying(
  releaseStatus: string
): RelatedEntityGuardOk | RelatedEntityGuardDenial {
  if (!isReleaseDeploying(releaseStatus)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          "Environment bookings can’t be changed while this release is Deploying. Wait until Deploying finishes, or change status only if your process allows.",
        code: "S306_ENV_BOOKING_LOCKED",
      },
      { status: 409 }
    ),
  };
}

/** Non-terminal approval decisions that CASC-13 withdraws. */
const CASC13_OPEN_DECISIONS = ["Pending", "Deferred"] as const;

/**
 * CASC-13 — set open Approvals on a release to Withdrawn when the release is Cancelled.
 * Leaves already-terminal decisions (Approved/Rejected/Expired/Withdrawn) unchanged.
 *
 * @param releaseId - Release primary key
 * @returns Count of approvals updated
 */
export async function cascadeWithdrawApprovalsOnReleaseCancelled(
  releaseId: string
): Promise<number> {
  // Security: only touch non-terminal decisions; never rewrite Approved/Rejected history.
  const open = await prisma.approval.findMany({
    where: {
      releaseId,
      decision: { in: [...CASC13_OPEN_DECISIONS] },
    },
    select: { id: true, comments: true },
  });
  if (open.length === 0) return 0;

  const now = new Date();
  const cascNote = "CASC-13: withdrawn because parent release was cancelled";
  await prisma.$transaction(
    open.map((row) =>
      prisma.approval.update({
        where: { id: row.id },
        data: {
          decision: "Withdrawn",
          decisionDate: now,
          // Preserve existing comments; only stamp CASC-13 when empty.
          ...(row.comments?.trim()
            ? {}
            : { comments: cascNote }),
        },
      })
    )
  );
  return open.length;
}
