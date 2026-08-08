/**
 * Field-edit policy for monitoring alerts by lifecycle status.
 */
import type {
  AlertEditMode,
  AlertLifecycleConfig,
} from "@/lib/alert-lifecycle-config";
import { resolveAlertLifecycleStatusRef } from "@/lib/alert-lifecycle-transition";

/** Acknowledged: limited — status moves + assignee / reason only. */
const LIMITED_ALLOWED = new Set([
  "status",
  "overrideReason",
  "assignedTo",
]);

const READ_ONLY_ALLOWED = new Set(["status", "overrideReason", "assignedTo"]);

/**
 * Resolve edit mode for the current alert status.
 */
export function resolveAlertEditMode(
  config: AlertLifecycleConfig,
  status: string
): AlertEditMode {
  return resolveAlertLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isAlertFieldEditable(mode: AlertEditMode, field: string): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current alert status.
 */
export function deniedAlertEditFields(
  config: AlertLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: AlertEditMode; denied: string[] } {
  const mode = resolveAlertEditMode(config, currentStatus);
  const denied = proposedKeys.filter((key) => !isAlertFieldEditable(mode, key));
  return { mode, denied };
}
