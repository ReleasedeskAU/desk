/**
 * Shared popup alert payload for create/edit save failures (lifecycle, validation, API).
 */

export type FormAlert = {
  title: string;
  message: string;
  details?: string[];
  /** error = blocking failure (default); notice = successful save with important side effect. */
  variant?: "error" | "notice";
};

const LIFECYCLE_CODES = new Set([
  "UNKNOWN_STATUS",
  "ILLEGAL_TRANSITION",
  "TRANSITION_BLOCKED",
  "TRANSITION_NEEDS_OVERRIDE",
  "CONDITIONS_REQUIRED",
  "EDIT_POLICY_DENIED",
  "FIELD_LOCK_DENIED",
]);

/**
 * Build a user-facing alert from a failed save API body.
 * @param data - Parsed JSON error body (may be null).
 * @param fallbackMessage - Used when body has no `error` string.
 * @param options.entityLabel - Optional noun for non-lifecycle titles (e.g. "blocker").
 * @returns Title, message, and optional unmet-gate detail bullets.
 */
export function buildFormSaveAlert(
  data: unknown,
  fallbackMessage: string,
  options?: { entityLabel?: string }
): FormAlert {
  const body =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const message =
    body && typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : fallbackMessage;
  const code = body && typeof body.code === "string" ? body.code : "";
  const transition =
    body?.transition && typeof body.transition === "object"
      ? (body.transition as { unmetReasons?: unknown })
      : null;
  const unmetFromTransition = Array.isArray(transition?.unmetReasons)
    ? transition.unmetReasons.filter(
        (r): r is string => typeof r === "string" && r.trim().length > 0
      )
    : [];
  const unmetFromBody = Array.isArray(body?.unmetReasons)
    ? body.unmetReasons.filter(
        (r): r is string => typeof r === "string" && r.trim().length > 0
      )
    : [];
  const details = unmetFromTransition.length
    ? unmetFromTransition
    : unmetFromBody.length
      ? unmetFromBody
      : undefined;

  const isFieldLock = code === "FIELD_LOCK_DENIED" || /field lock/i.test(message);
  const isLifecycle =
    !isFieldLock &&
    (LIFECYCLE_CODES.has(code) ||
      /lifecycle|transition|not allowed|edit policy/i.test(message));

  const entity = options?.entityLabel?.trim() || "record";
  return {
    title: isFieldLock
      ? "This field is locked"
      : isLifecycle
        ? "Status change blocked"
        : `Could not save ${entity}`,
    message,
    details: details?.length ? details : undefined,
  };
}
