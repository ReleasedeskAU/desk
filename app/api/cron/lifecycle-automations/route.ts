/**
 * Vercel Cron dispatcher for Category A lifecycle automations.
 *
 * Auth: Bearer CRON_SECRET (deny-by-default). No Clerk session.
 * Schedule: daily only (Hobby plan) — see vercel.json crons entry.
 *
 * Integration note: receives no user PII; mutates operational entity statuses
 * / creates MonitoringAlert rows using enterprise default thresholds.
 */
import { NextResponse } from "next/server";
import { runLifecycleAutomations } from "@/lib/lifecycle-automations/run";

export const runtime = "nodejs";
/** Hobby max is 10s; keep declared duration honest for the platform. */
export const maxDuration = 10;

/**
 * Validate cron auth. Accepts Authorization: Bearer <CRON_SECRET>.
 * Fail closed when CRON_SECRET is unset or mismatched.
 */
function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Security: deny when secret is missing — never allow open cron in any env.
  if (!secret || !secret.trim()) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  return match[1] === secret;
}

async function handle(req: Request): Promise<NextResponse> {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runLifecycleAutomations(new Date());
    if (!result.ok) {
      console.error("[lifecycle-cron] run completed with role faults", {
        checks: result.checks
          .filter((c) => c.roleFaults.length > 0)
          .map((c) => ({ check: c.check, roleFaults: c.roleFaults })),
      });
    }
    console.warn("[lifecycle-cron] run complete", {
      ok: result.ok,
      anyTruncated: result.anyTruncated,
      checks: result.checks.map((c) => ({
        check: c.check,
        mutated: c.mutated,
        truncated: c.truncated,
        errors: c.errors,
        roleFaults: c.roleFaults,
      })),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.warn("[lifecycle-cron] dispatcher failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Lifecycle automations failed" },
      { status: 500 }
    );
  }
}

/** Vercel Cron invokes GET by default. */
export async function GET(req: Request) {
  return handle(req);
}

/** Allow manual POST with the same Bearer secret (local/dev). */
export async function POST(req: Request) {
  return handle(req);
}
