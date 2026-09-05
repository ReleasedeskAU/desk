import { NextResponse } from "next/server";
import { zodErrorResponse } from "@/lib/api-errors";
import { askAgentNdjsonResponse } from "@/lib/staffless/ask-http";
import { askBodySchema } from "@/lib/staffless/ask-schema";
import { authorizeAskTest } from "@/lib/staffless/ask-test-auth";

/**
 * Temporary Ask test stream. Clerk is skipped in middleware; this handler
 * requires ASK_TEST_ENABLED=true and a matching ASK_TEST_TOKEN bearer.
 * No request-volume cap. Disable and rotate the token after external testing.
 */
export async function POST(req: Request) {
  const gate = authorizeAskTest(req.headers.get("authorization"));
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = askBodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  return askAgentNdjsonResponse({
    message: parsed.data.message,
    history: parsed.data.history ?? [],
    sessionId: parsed.data.sessionId,
  });
}
