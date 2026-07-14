import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { ZodError } from "zod";

/**
 * Maps thrown errors to safe client responses.
 * Logs the real message server-side; never returns stack traces or internal details in production.
 */
export function jsonError(
  err: unknown,
  opts: {
    publicMessage: string;
    status?: number;
    logLabel: string;
  }
): NextResponse {
  const status = opts.status ?? 500;
  const detail = err instanceof Error ? err.message : String(err);
  logger.error(opts.logLabel, { detail: detail.slice(0, 500) });

  if (process.env.NODE_ENV !== "production" && err instanceof Error) {
    return NextResponse.json({ error: opts.publicMessage, detail: err.message }, { status });
  }
  return NextResponse.json({ error: opts.publicMessage }, { status });
}

/** 400 response for Zod validation failures — field messages only, no stack. */
export function zodErrorResponse(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Validation failed",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    },
    { status: 400 }
  );
}
