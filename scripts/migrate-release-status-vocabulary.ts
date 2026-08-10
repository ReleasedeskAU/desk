/**
 * Migration 1/2 — Release.status vocabulary (live DB).
 *
 * Remaps non-canonical Release.status values (Aug 3 audit + current live check):
 *   Approved → CAB Approved
 *   Complete / Completed → Deployed
 *   In Progress → Planning
 *   Scheduled → Planning (approved default mapping; present on live DB)
 *
 * Does NOT touch approvalStatus (separate script).
 * Writes one ReleaseAuditEvent per changed row; does not rewrite history.
 *
 * Usage:
 *   npx tsx scripts/migrate-release-status-vocabulary.ts --dry-run
 *   npx tsx scripts/migrate-release-status-vocabulary.ts --apply
 */
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();

const STATUS_MAP: Readonly<Record<string, string>> = {
  Approved: "CAB Approved",
  Complete: "Deployed",
  Completed: "Deployed",
  "In Progress": "Planning",
  Scheduled: "Planning",
};

const ACTOR = "migration:release-status-vocabulary";
const ACTION = "status_migration";

function wantsApply(): boolean {
  return process.argv.includes("--apply");
}

function wantsDryRun(): boolean {
  return process.argv.includes("--dry-run") || !wantsApply();
}

async function main() {
  const apply = wantsApply() && !process.argv.includes("--dry-run");
  const mode = apply ? "APPLY" : "DRY-RUN";
  console.log(`[${mode}] Release.status vocabulary migration`);

  const before = await prisma.release.groupBy({
    by: ["status"],
    _count: { _all: true },
    orderBy: { status: "asc" },
  });
  console.log("Before distribution:");
  for (const row of before) {
    console.log(`  ${row.status}: ${row._count._all}`);
  }

  const candidates = await prisma.release.findMany({
    where: { status: { in: Object.keys(STATUS_MAP) } },
    select: { id: true, releaseCode: true, status: true, name: true },
    orderBy: { releaseCode: "asc" },
  });

  console.log(`\nRows to remap: ${candidates.length}`);
  for (const row of candidates) {
    const next = STATUS_MAP[row.status];
    console.log(`  ${row.releaseCode}  ${row.status} → ${next}  (${row.name})`);
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    return;
  }

  if (candidates.length === 0) {
    console.log("Nothing to apply.");
    return;
  }

  let updated = 0;
  for (const row of candidates) {
    const next = STATUS_MAP[row.status];
    if (!next) continue;
    await prisma.$transaction(async (tx) => {
      const result = await tx.release.updateMany({
        where: { id: row.id, status: row.status },
        data: { status: next },
      });
      if (result.count !== 1) return;
      await tx.releaseAuditEvent.create({
        data: {
          releaseId: row.id,
          action: ACTION,
          actor: ACTOR,
          detail: `Status vocabulary migration: ${row.status} → ${next}`,
        },
      });
      updated += 1;
    });
  }

  const after = await prisma.release.groupBy({
    by: ["status"],
    _count: { _all: true },
    orderBy: { status: "asc" },
  });
  console.log(`\nUpdated ${updated} row(s). After distribution:`);
  for (const row of after) {
    console.log(`  ${row.status}: ${row._count._all}`);
  }

  const leftover = await prisma.release.count({
    where: { status: { in: Object.keys(STATUS_MAP) } },
  });
  if (leftover > 0) {
    throw new Error(`Migration incomplete: ${leftover} legacy status row(s) remain`);
  }
  console.log("OK — no Approved/Complete/In Progress statuses remain.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
