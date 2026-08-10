/**
 * Field-edit policy for a single sign-off type's current decision.
 */
import type {
  SignoffEditMode,
  SignoffLifecycleConfig,
} from "@/lib/signoff-lifecycle-config";
import { resolveSignoffLifecycleStatusRef } from "@/lib/signoff-lifecycle-transition";

/**
 * Resolve edit mode for the current sign-off decision value.
 */
export function resolveSignoffEditMode(
  config: SignoffLifecycleConfig,
  status: string | null | undefined
): SignoffEditMode {
  return resolveSignoffLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether the sign-off value itself may change under the given mode.
 * Transition engine still decides legality of the target status.
 */
export function isSignoffValueEditable(mode: SignoffEditMode): boolean {
  // Status changes are always submitted through the transition engine —
  // immutable/terminal blocks are enforced there. Field-level "immutable"
  // means other release metadata cannot ride along; the value change itself
  // is validated by validateSignoffTransition (which rejects terminal exits).
  return mode !== "immutable";
}

/**
 * Whether changing a sign-off field is denied because the current value is
 * terminal/immutable (no exit path).
 */
export function isSignoffChangeDeniedByEditPolicy(
  config: SignoffLifecycleConfig,
  currentStatus: string | null | undefined
): boolean {
  const mode = resolveSignoffEditMode(config, currentStatus);
  const resolved = resolveSignoffLifecycleStatusRef(config, currentStatus);
  // Allow same-status no-ops and AV-style paths only via transition engine.
  // Deny when current is terminal+immutable (all rendered decisions).
  return mode === "immutable" && Boolean(resolved?.terminal);
}
