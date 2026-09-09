/**
 * Client-safe create-approval error mapping. Do not import server create I/O here.
 */
import { buildFormSaveAlert, type FormAlert } from "@/lib/form-save-alert";

/**
 * Alert the create modal can show. Always has a non-empty message so failures
 * cannot look like a no-op when the dialog is actually visible.
 */
export function approvalCreateClientAlert(
  data: unknown,
  fallback: string
): FormAlert {
  const alert = buildFormSaveAlert(data, fallback, { entityLabel: "approval" });
  const body =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const issues = Array.isArray(body?.issues)
    ? body.issues
        .map((issue) => {
          if (
            issue &&
            typeof issue === "object" &&
            typeof (issue as { message?: unknown }).message === "string"
          ) {
            return (issue as { message: string }).message.trim();
          }
          return "";
        })
        .filter(Boolean)
    : [];
  const message = alert.message.trim() || fallback.trim() || "Failed to create approval";
  return {
    ...alert,
    message,
    details: issues.length ? issues : alert.details,
  };
}
