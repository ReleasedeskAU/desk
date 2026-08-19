/**
 * Dual acknowledgment for the Confirmed dependency status.
 *
 * Sheet: both release managers (this release’s owner and the upstream
 * release’s owner) must acknowledge before Confirmed → In Progress.
 * Each side is stored separately — never a single boolean.
 */

export type DependencyAckSide = "source" | "target";

export type DependencyAckState = {
  sourceAcknowledgedAt: Date | string | null | undefined;
  sourceAcknowledgedByUserId: string | null | undefined;
  targetAcknowledgedAt: Date | string | null | undefined;
  targetAcknowledgedByUserId: string | null | undefined;
};

/**
 * True when that side already has an acknowledgment recorded.
 * @param state - Stored ack columns
 * @param side - Source (this release) or target (upstream)
 */
export function isDependencySideAcknowledged(
  state: DependencyAckState,
  side: DependencyAckSide
): boolean {
  if (side === "source") {
    return Boolean(
      state.sourceAcknowledgedByUserId?.trim() || state.sourceAcknowledgedAt
    );
  }
  return Boolean(
    state.targetAcknowledgedByUserId?.trim() || state.targetAcknowledgedAt
  );
}

/**
 * True when both parties have recorded an acknowledgment.
 * @param state - Stored ack columns
 */
export function bothDependencyPartiesAcknowledged(
  state: DependencyAckState
): boolean {
  return (
    isDependencySideAcknowledged(state, "source") &&
    isDependencySideAcknowledged(state, "target")
  );
}

/**
 * Which owner User id must record `side`.
 * @param sourceOwnerId - releaseOwnerId of the waiting release
 * @param targetOwnerId - releaseOwnerId of the upstream release
 */
export function ownerIdForDependencyAckSide(
  sourceOwnerId: string | null | undefined,
  targetOwnerId: string | null | undefined,
  side: DependencyAckSide
): string | null {
  const raw = side === "source" ? sourceOwnerId : targetOwnerId;
  const trimmed = String(raw ?? "").trim();
  return trimmed || null;
}
