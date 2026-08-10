/**
 * Field-edit policy for risks by lifecycle status.
 */
import type {
  RiskEditMode,
  RiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";
import { resolveRiskLifecycleStatusRef } from "@/lib/risk-lifecycle-transition";

const LIMITED_ALLOWED = new Set([
  "status",
  "overrideReason",
  "notes",
  "mitigationStrategy",
  "affectedArea",
  "riskOwnerId",
]);

const READ_ONLY_ALLOWED = new Set(["status", "overrideReason", "notes"]);

/**
 * Resolve edit mode for the current risk status.
 */
export function resolveRiskEditMode(
  config: RiskLifecycleConfig,
  status: string
): RiskEditMode {
  return resolveRiskLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isRiskFieldEditable(mode: RiskEditMode, field: string): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current risk status.
 */
export function deniedRiskEditFields(
  config: RiskLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: RiskEditMode; denied: string[] } {
  const mode = resolveRiskEditMode(config, currentStatus);
  const denied = proposedKeys.filter((key) => !isRiskFieldEditable(mode, key));
  return { mode, denied };
}
