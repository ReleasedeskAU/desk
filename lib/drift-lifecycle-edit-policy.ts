/**
 * Field-edit policy for drifts by lifecycle status.
 */
import type {
  DriftEditMode,
  DriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config";
import { resolveDriftLifecycleStatusRef } from "@/lib/drift-lifecycle-transition";

const LIMITED_ALLOWED = new Set([
  "status",
  "overrideReason",
  "remediationAction",
  "etaToFix",
  "impactOnRelease",
  "notes",
  "baselineNotes",
  "assignedTo",
]);

const READ_ONLY_ALLOWED = new Set(["status", "overrideReason", "remediationAction"]);

/**
 * Resolve edit mode for the current drift status.
 */
export function resolveDriftEditMode(
  config: DriftLifecycleConfig,
  status: string
): DriftEditMode {
  return resolveDriftLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isDriftFieldEditable(mode: DriftEditMode, field: string): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current drift status.
 */
export function deniedDriftEditFields(
  config: DriftLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: DriftEditMode; denied: string[] } {
  const mode = resolveDriftEditMode(config, currentStatus);
  const denied = proposedKeys.filter((key) => !isDriftFieldEditable(mode, key));
  return { mode, denied };
}
