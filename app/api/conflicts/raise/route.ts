import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { zodErrorResponse } from "@/lib/api-errors";
import { z } from "zod";
import { raiseAndNotifyConflicts } from "@/lib/conflict-detectors";
import type { ConflictFinding } from "@/lib/conflict-finding-types";
import { prisma } from "@/lib/prisma";

const findingSchema = z
  .object({
    typeKey: z.string().trim().min(1).max(40),
    release2Code: z.string().trim().min(1).max(64),
    applicationName: z.string().trim().min(1).max(200),
    departmentName: z.string().trim().max(120),
    conflictingEnvironment: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000),
    conflictPeriod: z.string().trim().max(120),
    summary: z.string().trim().max(400),
  })
  .strict();

const raiseConflictsSchema = z
  .object({
    release1Code: z.string().trim().min(1).max(64),
    findings: z.array(findingSchema).min(1).max(20),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

/**
 * Option B — raise detected conflicts for Release Manager review.
 * Does not accept a client-supplied Conflict ID.
 */
export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const parsed = raiseConflictsSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const extra = parsed.data.notes?.trim() ?? "";
  const findings: ConflictFinding[] = parsed.data.findings.map((finding) => ({
    ...finding,
    notes: extra ? `${finding.notes} — ${extra}` : finding.notes,
  }));

  const linked = await prisma.release.findFirst({
    where: { releaseCode: parsed.data.release1Code },
    select: { id: true },
  });
  const raised = await raiseAndNotifyConflicts({
    clerkUserId: user!.id,
    release1Code: parsed.data.release1Code,
    releaseId: linked?.id,
    findings,
    raisedBy: user!.name,
    automation: "CNF-REQ-CHOICE",
  });
  if (raised.roleFault) {
    return NextResponse.json(
      { error: raised.roleFault.message, code: raised.roleFault.code },
      { status: 422 }
    );
  }

  return NextResponse.json({
    raised: raised.count,
    message:
      raised.count > 0
        ? `Raised ${raised.count} conflict${raised.count === 1 ? "" : "s"} for Release Manager review.`
        : "Those conflicts were already on the queue.",
  });
}
