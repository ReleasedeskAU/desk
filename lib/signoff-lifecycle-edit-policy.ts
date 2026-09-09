/**
 * Field-edit policy for a single sign-off type's current decision.
 */
import { canEdit, type SessionUser } from "@/lib/auth/roles";
import type {
  SignoffEditMode,
  SignoffLifecycleConfig,
} from "@/lib/signoff-lifecycle-config";
import { isSignoffEditMode } from "@/lib/signoff-lifecycle-config";
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

/**
 * Whether the Sign-off list/detail may show Edit for this decision.
 * Fail closed when the status is unknown or `editMode` is missing — do not guess.
 * Rendered (immutable) decisions stay off; Pending / non-immutable stay on.
 *
 * @param config - Active sign-off lifecycle config.
 * @param status - Current decision label or key.
 * @returns true only when config explicitly marks the status editable.
 */
export function canOfferSignoffEditAction(
  config: SignoffLifecycleConfig,
  status: string | null | undefined
): boolean {
  const resolved = resolveSignoffLifecycleStatusRef(config, status);
  if (!resolved || !isSignoffEditMode(resolved.editMode)) return false;
  return isSignoffValueEditable(resolved.editMode);
}

/**
 * Role + lifecycle gate for offering Sign-off Edit. Default deny.
 *
 * @param args.user - Session user; editor+ required.
 * @param args.config - Lifecycle config; missing config hides Edit.
 * @param args.status - Current decision value.
 * @returns true when the Edit control may be shown.
 */
export function shouldOfferSignoffEdit(args: {
  user: SessionUser | null;
  config: SignoffLifecycleConfig | null;
  status: string | null | undefined;
}): boolean {
  if (!canEdit(args.user)) return false;
  if (!args.config) return false;
  return canOfferSignoffEditAction(args.config, args.status);
}
