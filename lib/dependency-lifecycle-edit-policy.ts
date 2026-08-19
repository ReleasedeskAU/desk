/**
 * Field-edit policy for dependencies by lifecycle status.
 */
import type {
  DependencyEditMode,
  DependencyLifecycleConfig,
} from "@/lib/dependency-lifecycle-config";
import { resolveDependencyLifecycleStatusRef } from "@/lib/dependency-lifecycle-transition";

const LIMITED_ALLOWED = new Set(["status", "overrideReason", "notes", "acknowledgeSide"]);
const READ_ONLY_ALLOWED = new Set(["status", "overrideReason", "notes", "acknowledgeSide"]);

/**
 * Resolve edit mode for the current dependency status.
 */
export function resolveDependencyEditMode(
  config: DependencyLifecycleConfig,
  status: string
): DependencyEditMode {
  return resolveDependencyLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isDependencyFieldEditable(
  mode: DependencyEditMode,
  field: string
): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current dependency status.
 */
export function deniedDependencyEditFields(
  config: DependencyLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: DependencyEditMode; denied: string[] } {
  const mode = resolveDependencyEditMode(config, currentStatus);
  const denied = proposedKeys.filter(
    (key) => !isDependencyFieldEditable(mode, key)
  );
  return { mode, denied };
}
