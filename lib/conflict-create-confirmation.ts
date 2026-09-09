/**
 * Create-modal outcome for POST /api/conflicts (RD-134).
 * Confirmation is shown only after a successful save; failures stay on the form error.
 */

export const CONFLICT_CREATE_FAILED_MESSAGE =
  "Failed to create conflict. Check the form and try again.";

export type ConflictCreateRequestResult = {
  ok: boolean;
  status?: number;
  data?: { error?: string } | null;
};

export type ConflictCreateUiOutcome =
  | { showConfirmation: true }
  | { showConfirmation: false; errorMessage: string };

/**
 * Maps a create-conflict fetch result to the modal UI.
 * @param result - safeFetchJson result from POST /api/conflicts
 * @returns Confirmation flag, or the existing client-safe error (never a success popup)
 */
export function conflictCreateUiOutcome(
  result: ConflictCreateRequestResult
): ConflictCreateUiOutcome {
  if (!result.ok || (result.status ?? 0) >= 300) {
    const apiError =
      result.ok && result.data?.error?.trim() ? result.data.error.trim() : null;
    return {
      showConfirmation: false,
      errorMessage: apiError ?? CONFLICT_CREATE_FAILED_MESSAGE,
    };
  }
  return { showConfirmation: true };
}
