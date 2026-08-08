/**
 * Field-edit policy by release status (lifecycle “Editable?” column).
 * Status transitions stay in the transition engine; this gates non-status PATCH fields.
 */
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";

export type ReleaseEditMode = "full" | "limited" | "read_only" | "immutable";

/** Fields treated as scope / schedule — locked in limited and read_only modes. */
const SCOPE_AND_DATE_FIELDS = new Set([
  "name",
  "programProject",
  "releaseCode",
  "departmentId",
  "applicationIds",
  "dependsOnReleaseIds",
  "releaseDate",
  "cabDate",
  "startDate",
  "deploymentWindow",
  "testEnvRequired",
  "uatEnvRequired",
  "releaseSize",
  "priority",
  "impact",
  "owner",
  "releaseOwnerId",
]);

/** Fields still allowed under limited edit. */
const LIMITED_ALLOWED_FIELDS = new Set([
  "status",
  "overrideReason",
  "previousStatus",
  "notes",
  "blockers",
  "decision",
  "approvalStatus",
  "readinessPercent",
  "goLiveChecklistPercent",
  "conflictFlag",
  "conflictId",
  "dependencies",
  "vendorMaintenance",
  "changeFreeze",
  "regulatory",
  "rollbackPlan",
  // Sign-off checklist decisions (own lifecycle still enforces transitions).
  "devSignoff",
  "testSignoff",
  "uatSignoff",
  "securityClearance",
  "dressRehearsal",
  "trainingStatus",
  "supportBriefed",
]);

/**
 * Resolve edit mode for a release status label/key against the lifecycle config.
 *
 * @param config - Active lifecycle config for the caller.
 * @param status - Current release status (label or key).
 * @returns Edit mode; unknown statuses default to full (fail open for edits, status still enforced).
 */
export function resolveReleaseEditMode(
  config: ReleaseLifecycleConfig,
  status: string
): ReleaseEditMode {
  const resolved = resolveLifecycleStatusRef(config, status);
  const key = resolved?.key ?? status.trim().toLowerCase().replace(/\s+/g, "_");

  switch (key) {
    case "closed":
    case "cancelled":
      return "immutable";
    case "deploying":
    case "deployed":
      return "read_only";
    case "pending_cab":
    case "cab_approved":
    case "ready_to_deploy":
      return "limited";
    default:
      return "full";
  }
}

/**
 * Decide whether a PATCH field key may change under the given edit mode.
 * `status` / override hints are always allowed through (transition engine decides).
 *
 * @param mode - Edit mode for the current status.
 * @param field - Top-level body key being patched.
 * @returns true when the field may be written.
 */
export function isReleaseFieldEditable(mode: ReleaseEditMode, field: string): boolean {
  if (field === "status" || field === "overrideReason" || field === "previousStatus") {
    return true;
  }
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") {
    // Deploying/Deployed: dates and scope locked; allow operational notes only.
    return field === "notes" || field === "blockers" || field === "decision";
  }
  // limited
  if (SCOPE_AND_DATE_FIELDS.has(field)) return false;
  return LIMITED_ALLOWED_FIELDS.has(field);
}

/**
 * Filter a PATCH payload to fields allowed for the release's current status.
 *
 * @param config - Lifecycle config.
 * @param currentStatus - Release status before the patch.
 * @param proposedKeys - Keys present on the request body (excluding undefined).
 * @returns Denied field names (empty when fully allowed).
 */
export function deniedReleaseEditFields(
  config: ReleaseLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: ReleaseEditMode; denied: string[] } {
  const mode = resolveReleaseEditMode(config, currentStatus);
  const denied = proposedKeys.filter((key) => !isReleaseFieldEditable(mode, key));
  return { mode, denied };
}
