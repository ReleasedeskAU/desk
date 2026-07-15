/**
 * Step 1 proof: Zod lock on primary IDs + real DB persist/restore for Conflict/Leave/Blocker.
 * Run: npx tsx scripts/verify-detail-step1.ts
 */
import { prisma } from "../lib/prisma";
import { patchConflictSchema } from "../lib/validation/conflict";
import { patchLeaveSchema } from "../lib/validation/leave";
import { patchBlockerSchema } from "../lib/validation/blocker";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  // --- Zod: primary IDs must be rejected ---
  assert(
    !patchConflictSchema.safeParse({ conflictCode: "CONF-HACK", notes: "x" }).success,
    "conflict schema must reject conflictCode"
  );
  assert(
    !patchLeaveSchema.safeParse({ leaveCode: "LV-HACK", leaveType: "Annual" }).success,
    "leave schema must reject leaveCode"
  );
  assert(
    !patchBlockerSchema.safeParse({ blockerCode: "BLK-HACK", status: "Open" }).success,
    "blocker schema must reject blockerCode"
  );
  assert(patchConflictSchema.safeParse({ notes: "ok" }).success, "conflict notes patch must pass");
  console.log("OK zod: primary IDs rejected; allowlisted fields accepted");

  const marker = `step1-proof-${Date.now()}`;

  // --- Conflict: notes before → after → restore ---
  const conflict = await prisma.environmentConflict.findFirst({ orderBy: { conflictCode: "asc" } });
  assert(conflict, "need at least one conflict row");
  const conflictBefore = conflict.notes;
  const conflictParsed = patchConflictSchema.parse({ notes: marker });
  await prisma.environmentConflict.update({
    where: { id: conflict.id },
    data: { notes: conflictParsed.notes ?? null },
  });
  const conflictMid = await prisma.environmentConflict.findUniqueOrThrow({ where: { id: conflict.id } });
  assert(conflictMid.notes === marker, "conflict notes did not persist");
  await prisma.environmentConflict.update({
    where: { id: conflict.id },
    data: { notes: conflictBefore },
  });
  console.log(
    `OK conflict ${conflict.conflictCode}: notes "${conflictBefore ?? "(null)"}" → "${marker}" → restored`
  );

  // --- Leave: riskImpact before → after → restore ---
  const leave = await prisma.leaveRecord.findFirst({ orderBy: { leaveCode: "asc" } });
  assert(leave, "need at least one leave row");
  const leaveBefore = leave.riskImpact;
  const leaveParsed = patchLeaveSchema.parse({ riskImpact: marker });
  await prisma.leaveRecord.update({
    where: { id: leave.id },
    data: { riskImpact: leaveParsed.riskImpact ?? null },
  });
  const leaveMid = await prisma.leaveRecord.findUniqueOrThrow({ where: { id: leave.id } });
  assert(leaveMid.riskImpact === marker, "leave riskImpact did not persist");
  await prisma.leaveRecord.update({
    where: { id: leave.id },
    data: { riskImpact: leaveBefore },
  });
  console.log(
    `OK leave ${leave.leaveCode}: riskImpact "${leaveBefore ?? "(null)"}" → "${marker}" → restored`
  );

  // --- Blocker: resolutionNotes before → after → restore ---
  const blocker = await prisma.blocker.findFirst({ orderBy: { blockerCode: "asc" } });
  assert(blocker, "need at least one blocker row");
  const blockerBefore = blocker.resolutionNotes;
  const blockerParsed = patchBlockerSchema.parse({ resolutionNotes: marker });
  await prisma.blocker.update({
    where: { id: blocker.id },
    data: { resolutionNotes: blockerParsed.resolutionNotes ?? null },
  });
  const blockerMid = await prisma.blocker.findUniqueOrThrow({ where: { id: blocker.id } });
  assert(blockerMid.resolutionNotes === marker, "blocker resolutionNotes did not persist");
  await prisma.blocker.update({
    where: { id: blocker.id },
    data: { resolutionNotes: blockerBefore },
  });
  console.log(
    `OK blocker ${blocker.blockerCode}: resolutionNotes "${blockerBefore ?? "(null)"}" → "${marker}" → restored`
  );

  console.log("Step 1 DB+Zod proof complete (HTTP PATCH still needs a signed-in browser session).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
