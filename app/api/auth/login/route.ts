import { NextResponse } from "next/server";

/**
 * Legacy pre-Clerk login is disabled.
 * Authentication is Clerk-only; this endpoint must not mint unsigned session cookies.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Gone",
      message: "Legacy session login is disabled. Use Clerk sign-in at /sign-in.",
    },
    { status: 410 }
  );
}
