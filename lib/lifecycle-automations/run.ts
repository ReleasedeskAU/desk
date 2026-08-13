/**
 * Category A dispatcher — runs all time-based lifecycle checks once per invocation.
 *
 * Hobby constraints:
 * - Schedule is daily only (`0 2 * * *` in vercel.json).
 * - Each check caps work at LIFECYCLE_CRON_BATCH_SIZE; truncated=true means
 *   more candidates remain for the next daily run (idempotent, not silent loss).
 */
import {
  runAv02RiskEscalations,
  runAv03BlockerStaleAlerts,
  runAv22ApprovalExpiry,
  runSignoffSlaExpiry,
  type CheckRunSummary,
} from "@/lib/lifecycle-automations/checks";
import { LIFECYCLE_CRON_BATCH_SIZE } from "@/lib/lifecycle-automations/scope-policy";

export type LifecycleCronRunResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  /** Owner-linked Clerk settings when available; else enterprise defaults. */
  scopePolicy: "owner_or_fallback_default";
  batchSize: number;
  checks: CheckRunSummary[];
  anyTruncated: boolean;
};

/**
 * Run AV-02, AV-03, AV-22, and sign-off SLA in sequence.
 * AV-13 is intentionally not invoked (deferred — see docs/lifecycle-backlog.md).
 *
 * @param now - Optional clock for tests
 */
export async function runLifecycleAutomations(
  now: Date = new Date()
): Promise<LifecycleCronRunResult> {
  const startedAt = now.toISOString();
  // Sequential: fail-soft per check; one slow check must not abort siblings via Promise.all.
  const checks: CheckRunSummary[] = [];
  for (const runner of [
    runAv02RiskEscalations,
    runAv03BlockerStaleAlerts,
    runAv22ApprovalExpiry,
    runSignoffSlaExpiry,
  ] as const) {
    try {
      checks.push(await runner(now, LIFECYCLE_CRON_BATCH_SIZE));
    } catch (err) {
      const name = runner.name || "unknown";
      console.warn("[lifecycle-cron] check threw", {
        check: name,
        message: err instanceof Error ? err.message : "unknown",
      });
      checks.push({
        check: name,
        examined: 0,
        mutated: 0,
        skipped: 0,
        truncated: false,
        errors: 1,
        ownerScoped: 0,
        fallbackScoped: 0,
        roleFaults: [],
      });
    }
  }

  return {
    ok: checks.every((c) => c.roleFaults.length === 0),
    startedAt,
    finishedAt: new Date().toISOString(),
    scopePolicy: "owner_or_fallback_default",
    batchSize: LIFECYCLE_CRON_BATCH_SIZE,
    checks,
    anyTruncated: checks.some((c) => c.truncated),
  };
}
