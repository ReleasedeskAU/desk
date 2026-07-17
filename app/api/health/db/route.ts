import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { probeDatabase } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Authenticated DB connectivity probe for production diagnosis.
 * Never returns connection strings, passwords, or full error stacks.
 */
export async function GET() {
  // Authenticated probe only — never expose connection strings.
  const { error } = await requireRole("readonly");
  if (error) return error;

  const result = await probeDatabase();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
