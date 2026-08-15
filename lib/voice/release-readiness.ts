/**
 * Release readiness verdict for voice — professional release-manager framing.
 * Pure helpers so summaries can say why a release is blocked vs ready.
 */

export type ReleaseReadinessInput = {
  releaseCode: string;
  name: string;
  status: string;
  owner?: string | null;
  department?: string | null;
  priority?: string | null;
  releaseDate?: string | null;
  decision?: string | null;
  conflictFlag?: boolean | null;
  readinessPercent?: number | null;
  goLiveChecklistPercent?: number | null;
  approvalStatus?: string | null;
  releaseHealth?: string | null;
  rollbackPlan?: string | null;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
  openBlockers?: Array<{
    blockerCode?: string | null;
    blockerDescription?: string | null;
    severity?: string | null;
    status?: string | null;
  }>;
  conflictBookings?: number;
  openRisks?: Array<{ code?: string | null; score?: number | null; status?: string | null }>;
  pendingApprovals?: number;
  dependenciesBlocked?: string[];
};

export type ReleaseReadinessVerdict = "ready" | "blocked" | "at_risk" | "in_progress" | "unknown";

export type ReleaseReadinessAssessment = {
  verdict: ReleaseReadinessVerdict;
  /** One-line headline for speech. */
  headline: string;
  /** Reasons that block or put the release at risk. */
  blockingFactors: string[];
  /** Positive readiness signals. */
  readySignals: string[];
  /** Full spoken paragraph for get_summary. */
  spokenSummary: string;
};

function clip(text: string, max = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isPositiveSignoff(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(yes|y|done|complete|completed|approved|signed|pass|passed|ok|ready)$/i.test(
    value.trim()
  );
}

function isNegativeSignoff(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(no|n|pending|missing|fail|failed|blocked|not ready|open)$/i.test(value.trim());
}

/**
 * Assess whether a release is ready, blocked, or at risk from structured facts.
 * @param input - Release + related open items (blockers, risks, bookings).
 */
export function assessReleaseReadiness(
  input: ReleaseReadinessInput
): ReleaseReadinessAssessment {
  const blockingFactors: string[] = [];
  const readySignals: string[] = [];

  const status = (input.status ?? "").trim();
  const statusLower = status.toLowerCase();

  if (/blocked/i.test(status)) {
    blockingFactors.push(`Status is ${status}`);
  } else if (/at\s*risk/i.test(status)) {
    blockingFactors.push(`Status is ${status}`);
  } else if (/shipped|done|closed|complete|deployed/i.test(status)) {
    readySignals.push(`Status is ${status} (already past go-live)`);
  } else if (status) {
    readySignals.push(`Current status: ${status}`);
  }

  const openBlockers = (input.openBlockers ?? []).filter(
    (b) => !/resolved|closed|done/i.test(b.status ?? "")
  );
  if (openBlockers.length) {
    const top = openBlockers
      .slice(0, 3)
      .map((b) => {
        const code = b.blockerCode ?? "blocker";
        const sev = b.severity ? ` (${b.severity})` : "";
        const desc = b.blockerDescription ? ` — ${clip(b.blockerDescription)}` : "";
        return `${code}${sev}${desc}`;
      })
      .join("; ");
    blockingFactors.push(
      `${openBlockers.length} open blocker${openBlockers.length === 1 ? "" : "s"}: ${top}`
    );
  } else {
    readySignals.push("No open blockers on record");
  }

  if (input.conflictFlag) {
    blockingFactors.push("Release conflict flag is set");
  }
  if ((input.conflictBookings ?? 0) > 0) {
    blockingFactors.push(
      `${input.conflictBookings} environment booking(s) flagged with conflicts`
    );
  }

  const hotRisks = (input.openRisks ?? []).filter((r) => {
    if (/closed|mitigated|accepted|resolved/i.test(r.status ?? "")) return false;
    return (r.score ?? 0) >= 12;
  });
  if (hotRisks.length) {
    blockingFactors.push(
      `Elevated open risks: ${hotRisks
        .slice(0, 3)
        .map((r) => `${r.code ?? "risk"} score ${r.score}`)
        .join(", ")}`
    );
  }

  if ((input.pendingApprovals ?? 0) > 0) {
    blockingFactors.push(`${input.pendingApprovals} pending approval(s)`);
  } else if (input.approvalStatus) {
    if (/approved|complete/i.test(input.approvalStatus)) {
      readySignals.push(`Approval status: ${input.approvalStatus}`);
    } else if (/pending|rejected|denied/i.test(input.approvalStatus)) {
      blockingFactors.push(`Approval status: ${input.approvalStatus}`);
    }
  }

  if (input.decision && /reject|hold|defer/i.test(input.decision)) {
    blockingFactors.push(`CAB decision: ${input.decision}`);
  } else if (input.decision && /approve|go/i.test(input.decision)) {
    readySignals.push(`CAB decision: ${input.decision}`);
  }

  const missingSignoffs: string[] = [];
  const okSignoffs: string[] = [];
  const signoffPairs: Array<[string, string | null | undefined]> = [
    ["Tech Review", input.devSignoff],
    ["QA Sign-Off — Test Phase", input.testSignoff],
    ["QA Sign-Off — UAT Phase", input.uatSignoff],
    ["Security Review", input.securityClearance],
  ];
  for (const [label, value] of signoffPairs) {
    if (isNegativeSignoff(value) || !value) {
      if (value === "" || value == null) {
        // Unknown — don't invent missing unless other signals show go-live focus
        continue;
      }
      missingSignoffs.push(`${label} (${value})`);
    } else if (isPositiveSignoff(value)) {
      okSignoffs.push(label);
    }
  }
  if (missingSignoffs.length) {
    blockingFactors.push(`Sign-offs not ready: ${missingSignoffs.join(", ")}`);
  } else if (okSignoffs.length >= 3) {
    readySignals.push(`Sign-offs in place: ${okSignoffs.join(", ")}`);
  }

  if (input.rollbackPlan && /missing|no|none|n\/a|pending/i.test(input.rollbackPlan)) {
    blockingFactors.push(`Rollback plan: ${input.rollbackPlan}`);
  } else if (input.rollbackPlan && /yes|ready|complete|documented/i.test(input.rollbackPlan)) {
    readySignals.push("Rollback plan documented");
  }

  if (typeof input.readinessPercent === "number") {
    if (input.readinessPercent < 70) {
      blockingFactors.push(`Readiness only ${Math.round(input.readinessPercent)}%`);
    } else {
      readySignals.push(`Readiness ${Math.round(input.readinessPercent)}%`);
    }
  }
  if (typeof input.goLiveChecklistPercent === "number") {
    if (input.goLiveChecklistPercent < 80) {
      blockingFactors.push(
        `Go-live checklist ${Math.round(input.goLiveChecklistPercent)}% complete`
      );
    } else {
      readySignals.push(
        `Go-live checklist ${Math.round(input.goLiveChecklistPercent)}% complete`
      );
    }
  }

  if (input.releaseHealth && /red|critical|poor|unhealthy/i.test(input.releaseHealth)) {
    blockingFactors.push(`Release health: ${input.releaseHealth}`);
  } else if (input.releaseHealth && /green|good|healthy/i.test(input.releaseHealth)) {
    readySignals.push(`Release health: ${input.releaseHealth}`);
  }

  if (input.dependenciesBlocked?.length) {
    blockingFactors.push(
      `Upstream dependencies not clear: ${input.dependenciesBlocked.slice(0, 4).join(", ")}`
    );
  }

  let verdict: ReleaseReadinessVerdict = "unknown";
  if (/shipped|done|closed|complete|deployed/i.test(statusLower)) {
    verdict = "ready";
  } else if (
    /blocked/i.test(statusLower) ||
    openBlockers.length > 0 ||
    input.conflictFlag ||
    (input.pendingApprovals ?? 0) > 0 && /blocked/i.test(statusLower)
  ) {
    // Open blockers or explicit Blocked status → blocked
    if (openBlockers.length > 0 || /blocked/i.test(statusLower) || input.conflictFlag) {
      verdict = "blocked";
    } else {
      verdict = "at_risk";
    }
  } else if (
    blockingFactors.length >= 2 ||
    /at\s*risk/i.test(statusLower) ||
    hotRisks.length > 0 ||
    (typeof input.readinessPercent === "number" && input.readinessPercent < 70)
  ) {
    verdict = "at_risk";
  } else if (
    blockingFactors.length === 0 ||
    (blockingFactors.length <= 1 && readySignals.length >= 2 && !openBlockers.length)
  ) {
    verdict =
      /progress|planned|scheduled|ready|approved/i.test(statusLower) && !openBlockers.length
        ? readySignals.length >= 2 && blockingFactors.length === 0
          ? "ready"
          : "in_progress"
        : blockingFactors.length === 0
          ? "ready"
          : "at_risk";
  } else {
    verdict = "in_progress";
  }

  // Refine: any open blocker always means blocked for RM speech.
  if (openBlockers.length > 0 || /blocked/i.test(statusLower)) {
    verdict = "blocked";
  }

  const code = input.releaseCode;
  const name = input.name;
  let headline: string;
  switch (verdict) {
    case "blocked":
      headline = `${code} (${name}) is BLOCKED — not ready for go-live.`;
      break;
    case "at_risk":
      headline = `${code} (${name}) is AT RISK — needs attention before go-live.`;
      break;
    case "ready":
      headline = `${code} (${name}) looks READY for go-live based on current signals.`;
      break;
    case "in_progress":
      headline = `${code} (${name}) is IN PROGRESS — not fully ready yet.`;
      break;
    default:
      headline = `${code} (${name}) — readiness is unclear from available signals.`;
  }

  const whyBlocked =
    blockingFactors.length > 0
      ? `Why: ${blockingFactors.slice(0, 4).join(". ")}.`
      : null;
  const whyReady =
    readySignals.length > 0
      ? `Supporting signals: ${readySignals.slice(0, 4).join("; ")}.`
      : null;

  const meta = [
    input.department ? `Department ${input.department}` : null,
    input.owner ? `owned by ${input.owner}` : null,
    input.releaseDate ? `target ${input.releaseDate}` : null,
    input.priority ? `priority ${input.priority}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const spokenSummary = [
    headline,
    meta ? `${meta}.` : null,
    whyBlocked,
    whyReady,
    "I can open the release, its blockers, or apply list filters if you want to dig in.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    verdict,
    headline,
    blockingFactors,
    readySignals,
    spokenSummary,
  };
}
