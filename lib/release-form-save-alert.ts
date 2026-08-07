/** Popup alert shown above the edit/create form (lifecycle blocks, save failures). */
export type ReleaseFormAlert = {
  title: string;
  message: string;
  details?: string[];
};

/**
 * Builds a user-facing alert from a release save API error body.
 * Lifecycle denials get a clearer title; unmet gate reasons become detail bullets.
 *
 * @param data - Parsed JSON body from the failed save response (may be null).
 * @param fallbackMessage - Message when the body has no usable `error` string.
 * @returns Title, message, and optional unmet-gate details for the popup.
 */
export function buildReleaseFormSaveAlert(
  data: unknown,
  fallbackMessage: string
): ReleaseFormAlert {
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
  const details = Array.isArray(transition?.unmetReasons)
    ? transition.unmetReasons.filter(
        (r): r is string => typeof r === "string" && r.trim().length > 0
      )
    : undefined;

  const lifecycleCodes = new Set([
    "UNKNOWN_STATUS",
    "ILLEGAL_TRANSITION",
    "TRANSITION_BLOCKED",
    "TRANSITION_NEEDS_OVERRIDE",
  ]);
  const isLifecycle =
    lifecycleCodes.has(code) ||
    /lifecycle|transition|not allowed/i.test(message);

  return {
    title: isLifecycle ? "Status change blocked" : "Could not save release",
    message,
    details: details?.length ? details : undefined,
  };
}
