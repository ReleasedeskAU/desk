/**
 * Field-edit policy for blockers by lifecycle status.
 */
import type { BlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { resolveBlockerLifecycleStatusRef } from "@/lib/blocker-lifecycle-transition";
import type { BlockerEditMode } from "@/lib/blocker-lifecycle-config";

const LIMITED_ALLOWED = new Set([
  "status",
  "overrideReason",
  "resolutionNotes",
  "rootCause",
  "actualResolutionDate",
  "assignedTo",
  "escalationLevel",
]);

const READ_ONLY_ALLOWED = new Set(["status", "overrideReason"]);

/**
 * Resolve edit mode for the current blocker status.
 */
export function resolveBlockerEditMode(
  config: BlockerLifecycleConfig,
  status: string
): BlockerEditMode {
  return resolveBlockerLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isBlockerFieldEditable(mode: BlockerEditMode, field: string): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current blocker status.
 */
export function deniedBlockerEditFields(
  config: BlockerLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: BlockerEditMode; denied: string[] } {
  const mode = resolveBlockerEditMode(config, currentStatus);
  const denied = proposedKeys.filter((key) => !isBlockerFieldEditable(mode, key));
  return { mode, denied };
}
