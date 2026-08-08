/**
 * Field-edit policy for conflicts by lifecycle status.
 */
import type {
  ConflictEditMode,
  ConflictLifecycleConfig,
} from "@/lib/conflict-lifecycle-config";
import { resolveConflictLifecycleStatusRef } from "@/lib/conflict-lifecycle-transition";

const LIMITED_ALLOWED = new Set(["status", "overrideReason", "notes", "assignedTo"]);
const READ_ONLY_ALLOWED = new Set(["status", "overrideReason", "notes"]);

/**
 * Resolve edit mode for the current conflict status.
 */
export function resolveConflictEditMode(
  config: ConflictLifecycleConfig,
  status: string
): ConflictEditMode {
  return resolveConflictLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isConflictFieldEditable(
  mode: ConflictEditMode,
  field: string
): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current conflict status.
 */
export function deniedConflictEditFields(
  config: ConflictLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: ConflictEditMode; denied: string[] } {
  const mode = resolveConflictEditMode(config, currentStatus);
  const denied = proposedKeys.filter(
    (key) => !isConflictFieldEditable(mode, key)
  );
  return { mode, denied };
}
