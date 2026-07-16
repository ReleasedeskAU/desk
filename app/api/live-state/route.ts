import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { getLiveState } from "@/lib/release-state-repo";
import { emptyReleaseStore } from "@/lib/release-store";

export const dynamic = "force-dynamic";

/**
 * Live release-store snapshot for the client poller.
 * Never 500 on transient Neon/Clerk/parse failures — return empty/stale store
 * so the UI keeps retrying without crashing the session.
 */
export async function GET() {
  try {
    const { error } = await requireRole("readonly");
    if (error) return error;

    const state = await getLiveState();
    return NextResponse.json(state);
  } catch (err) {
    // Empty Clerk/API bodies during slow Turbopack compiles surface as
    // "Unexpected end of JSON input" — treat as soft failure for this poller.
    console.warn("[api/live-state] falling back to empty store:", err);
    return NextResponse.json(emptyReleaseStore());
  }
}
