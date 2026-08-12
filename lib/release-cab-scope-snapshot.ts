/**
 * CAB scope snapshot helpers for scope_unchanged_since_cab (VR-21 Ready entry).
 *
 * Snapshot is written when a release enters CAB Approved and cleared on revert
 * to Pending CAB. Ready-entry compares Size / Priority / Scope Description.
 */

export type CabScopeSnapshot = {
  releaseSize: string | null;
  priority: string | null;
  scopeDescription: string | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Build a snapshot object from current release scope fields.
 * @param release - Size / Priority / Scope Description source
 */
export function buildCabScopeSnapshot(release: {
  releaseSize?: string | null;
  priority?: string | null;
  scopeDescription?: string | null;
}): CabScopeSnapshot {
  return {
    releaseSize: release.releaseSize?.trim() ? release.releaseSize.trim() : null,
    priority: release.priority?.trim() ? release.priority.trim() : null,
    scopeDescription: release.scopeDescription?.trim()
      ? release.scopeDescription.trim()
      : null,
  };
}

/**
 * Parse a stored JSON snapshot into a typed object, or null if unusable.
 * @param raw - Prisma Json value
 */
export function parseCabScopeSnapshot(raw: unknown): CabScopeSnapshot | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  return {
    releaseSize:
      typeof obj.releaseSize === "string"
        ? obj.releaseSize
        : obj.releaseSize == null
          ? null
          : String(obj.releaseSize),
    priority:
      typeof obj.priority === "string"
        ? obj.priority
        : obj.priority == null
          ? null
          : String(obj.priority),
    scopeDescription:
      typeof obj.scopeDescription === "string"
        ? obj.scopeDescription
        : obj.scopeDescription == null
          ? null
          : String(obj.scopeDescription),
  };
}

/**
 * Compare current scope fields to the CAB approval snapshot.
 * @returns null when unchanged / comparable; otherwise a user-facing reason
 */
export function cabScopeChangedSinceSnapshot(
  snapshot: CabScopeSnapshot | null,
  current: {
    releaseSize?: string | null;
    priority?: string | null;
    scopeDescription?: string | null;
  }
): string | null {
  if (!snapshot) {
    return "Scope-unchanged-since-CAB cannot be verified (no CAB scope snapshot)";
  }
  const changed: string[] = [];
  if (norm(snapshot.releaseSize) !== norm(current.releaseSize)) {
    changed.push("Size");
  }
  if (norm(snapshot.priority) !== norm(current.priority)) {
    changed.push("Priority");
  }
  if (norm(snapshot.scopeDescription) !== norm(current.scopeDescription)) {
    changed.push("Scope Description");
  }
  if (changed.length === 0) return null;
  return `Scope changed since CAB approval (${changed.join(", ")}) — revert via Pending CAB (VR-21) or restore CAB-approved values`;
}
