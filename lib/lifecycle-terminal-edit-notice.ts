/**
 * Edit-form UX when the current lifecycle status/decision is final.
 * Flag-driven when `isTerminal` is known; otherwise empty legal-next is the signal.
 */

export type LifecycleTerminalEditNoun = "status" | "decision";

/**
 * Whether Edit should show the final-status notice (empty next dropdown is expected).
 *
 * @param args.currentLabel - Current status or decision label.
 * @param args.legalNextCount - Count of legal next steps shown beside current.
 * @param args.isTerminal - Lifecycle `terminal` flag when resolved from config.
 * @returns True when the user cannot move forward or back from this step.
 */
export function shouldShowTerminalLifecycleEditNotice(args: {
  currentLabel: string | null | undefined;
  legalNextCount: number;
  isTerminal?: boolean | null;
}): boolean {
  const label = (args.currentLabel ?? "").trim();
  if (!label) return false;
  // Prefer the lifecycle terminal flag; empty legal-next is the Edit dropdown signal.
  if (args.isTerminal === true) return true;
  return args.legalNextCount === 0;
}

/**
 * Plain-English notice for a final status/decision in Edit.
 *
 * @param statusLabel - Current status or decision display label.
 * @param noun - "status" (releases/blockers/incidents) or "decision" (approvals).
 * @returns User-facing message; empty when label is blank.
 */
export function lifecycleTerminalEditNoticeText(
  statusLabel: string | null | undefined,
  noun: LifecycleTerminalEditNoun = "status"
): string {
  const label = (statusLabel ?? "").trim();
  if (!label) return "";
  if (noun === "decision") {
    return `${label} is a final decision — you can’t move forward or back from here. Other fields can still be updated if the edit rules allow.`;
  }
  return `${label} is a final status — you can’t move forward or back from here. Other fields can still be updated if the edit rules allow.`;
}
