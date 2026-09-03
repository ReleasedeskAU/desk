import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";

/** Existing-connector test: StaffLess AI has no separate test call. */
export async function POST() {
  const { error } = await requireRole("editor");
  if (error) return error;
  return NextResponse.json({
    ok: true,
    message: "StaffLess AI will verify this connector on the next Sync Now.",
  });
}
