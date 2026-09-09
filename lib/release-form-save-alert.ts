/**
 * Release-specific wrapper around the shared form-save alert builder.
 */
import {
  buildFormSaveAlert,
  type FormAlert,
} from "@/lib/form-save-alert";

/** @deprecated Prefer FormAlert — kept for existing release form imports. */
export type ReleaseFormAlert = FormAlert;

/**
 * Builds a user-facing alert from a release save API error body.
 * Name denials at pending CAB keep a field-focused title so the dialog does
 * not read as a status-transition failure (RD-141).
 *
 * @param data - Parsed JSON body from the failed save response (may be null).
 * @param fallbackMessage - Message when the body has no usable `error` string.
 */
export function buildReleaseFormSaveAlert(
  data: unknown,
  fallbackMessage: string
): FormAlert {
  const alert = buildFormSaveAlert(data, fallbackMessage, {
    entityLabel: "release",
  });
  const body =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const code = body && typeof body.code === "string" ? body.code : "";
  const field = body && typeof body.field === "string" ? body.field : "";
  if (code === "EDIT_POLICY_DENIED" && field === "name") {
    return { ...alert, title: "Release name can’t be changed" };
  }
  return alert;
}
