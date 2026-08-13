/**
 * Plain-English hover/tap copy for lifecycle status options that are blocked
 * or need an exception — used by Edit forms and status pickers.
 */

export type StatusOptionGateHint = {
  label: string;
  reason: string;
  passed: boolean;
  hard?: boolean;
  soft?: boolean;
};

/**
 * Build hover text for a legal-next status option.
 *
 * @param args.outcome - Option outcome from the lifecycle engine
 * @param args.gates - Gate evaluations for that next step (when available)
 * @returns Hint string, or undefined when no extra explanation is needed
 */
export function lifecycleStatusOptionHint(args: {
  outcome: "current" | "allowed" | "needs_override" | "blocked";
  gates?: readonly StatusOptionGateHint[];
}): string | undefined {
  if (args.outcome === "blocked") {
    const unmet =
      args.gates
        ?.filter((g) => !g.passed && g.hard)
        .map((g) => g.reason.trim() || g.label.trim())
        .filter(Boolean) ?? [];
    if (unmet.length === 0) {
      return "This step is blocked by required checks. Fix those checks first — an exception reason is not allowed.";
    }
    if (unmet.length === 1) {
      return `This step is blocked: ${unmet[0]}. Fix this check first — an exception reason is not allowed.`;
    }
    return `This step is blocked until these required checks pass:\n• ${unmet.join("\n• ")}\nAn exception reason is not allowed.`;
  }

  if (args.outcome === "needs_override") {
    const unmet =
      args.gates
        ?.filter((g) => !g.passed && (g.soft || !g.hard))
        .map((g) => g.reason.trim() || g.label.trim())
        .filter(Boolean) ?? [];
    if (unmet.length === 0) {
      return "Some checks aren’t met. You can continue after entering a short exception reason.";
    }
    if (unmet.length === 1) {
      return `Needs an exception reason: ${unmet[0]}`;
    }
    return `Needs an exception reason — unmet checks:\n• ${unmet.join("\n• ")}`;
  }

  return undefined;
}
