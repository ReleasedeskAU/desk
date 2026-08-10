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
 * @param data - Parsed JSON body from the failed save response (may be null).
 * @param fallbackMessage - Message when the body has no usable `error` string.
 */
export function buildReleaseFormSaveAlert(
  data: unknown,
  fallbackMessage: string
): FormAlert {
  return buildFormSaveAlert(data, fallbackMessage, { entityLabel: "release" });
}
