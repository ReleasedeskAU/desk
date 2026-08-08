/**
 * Field-edit policy for incidents by lifecycle status.
 */
import type {
  IncidentEditMode,
  IncidentLifecycleConfig,
} from "@/lib/incident-lifecycle-config";
import { resolveIncidentLifecycleStatusRef } from "@/lib/incident-lifecycle-transition";

const LIMITED_ALLOWED = new Set([
  "status",
  "overrideReason",
  "assignedTo",
  "relatedReleaseCode",
  "impact",
]);

const READ_ONLY_ALLOWED = new Set(["status", "overrideReason"]);

/**
 * Resolve edit mode for the current incident status.
 */
export function resolveIncidentEditMode(
  config: IncidentLifecycleConfig,
  status: string
): IncidentEditMode {
  return resolveIncidentLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isIncidentFieldEditable(
  mode: IncidentEditMode,
  field: string
): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current incident status.
 */
export function deniedIncidentEditFields(
  config: IncidentLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: IncidentEditMode; denied: string[] } {
  const mode = resolveIncidentEditMode(config, currentStatus);
  const denied = proposedKeys.filter((key) => !isIncidentFieldEditable(mode, key));
  return { mode, denied };
}
