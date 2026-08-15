/**
 * Shared hold/proceed rule for conflict Option A / Option B.
 * Detectors run against the proposed value; the write happens only after
 * Option B (or when nothing conflicted).
 */

/**
 * True when a date/booking write must wait for the Option A / Option B choice.
 * Happy path (no findings) never holds. Option B (`proceedWithRaise`) never holds.
 * @param findings - Detector output for the proposed value
 * @param proceedWithRaise - True when the user already chose Raise for RM review
 */
export function shouldHoldWriteForConflictChoice(
  findings: readonly unknown[],
  proceedWithRaise: boolean
): boolean {
  return findings.length > 0 && proceedWithRaise !== true;
}

/**
 * Plain-English 409 body when a write is held for the choice dialog.
 * @param findings - Detector output shown in the dialog
 */
export function conflictChoiceHoldBody(findings: unknown[]) {
  return {
    error:
      "This overlaps another booking, a maintenance window, or a freeze period. Change your dates or raise it for Release Manager review — nothing has been saved yet.",
    pendingConflicts: findings,
    requiresConfirmation: true,
  };
}
