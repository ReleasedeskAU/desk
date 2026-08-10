/**
 * Migration 2/2 — Release.approvalStatus cleanup (live DB).
 *
 * Lifecycle words incorrectly stored in approvalStatus are remapped to the
 * approved Approval Status vocabulary. Separate from Release.status migration.
 *
 * Mappings (Aug 3/4 approval):
 *   Draft | Planning | Testing → Not Submitted
 *   CAB Submitted → Pending
 *   CAB Approved → unchanged
 *   On Hold → On Hold (kept; not Deferred)
 *
 * Usage:
 *   npx tsx scripts/migrate-release-approval-status.ts --dry-run
 *   npx tsx scripts/migrate-release-approval-status.ts --apply
 */
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();

const APPROVAL_MAP: Readonly<Record<string, string>> = {
  Draft: "Not Submitted",
  Planning: "Not Submitted",
  Testing: "Not Submitted",
  "CAB Submitted": "Pending",
};

const ACTOR = "migration:release-approval-status";
const ACTION = "approval_status_migration";

/** Values that are already valid and must not be rewritten. */
const KEEP_AS_IS = new Set([
  "Not Submitted",
  "Pending",
  "On Hold",
  "CAB Approved",
  "CAB Approved with Conditions",
  "Deferred",
  "Rejected",
  "Withdrawn",
  "",
]);

function wantsApply(): boolean {
  return process.argv.includes("--apply");
}

async function main() {
  const apply = wantsApply() && !process.argv.includes("--dry-run");
  const mode = apply ? "APPLY" : "DRY-RUN";
  console.log(`[${mode}] Release.approvalStatus cleanup`);

  const before = await prisma.release.groupBy({
    by: ["approvalStatus"],
    _count: { _all: true },
    orderBy: { approvalStatus: "asc" },
  });
  console.log("Before distribution:");
  for (const row of before) {
    console.log(`  ${row.approvalStatus ?? "(null)"}: ${row._count._all}`);
  }

  const all = await prisma.release.findMany({
    select: {
      id: true,
      releaseCode: true,
      approvalStatus: true,
      name: true,
    },
    orderBy: { releaseCode: "asc" },
  });

  const plan: { id: string; releaseCode: string; name: string; from: string; to: string }[] =
    [];
  const unknown: { releaseCode: string; approvalStatus: string }[] = [];

  for (const row of all) {
    const current = (row.approvalStatus ?? "").trim();
    if (!current || KEEP_AS_IS.has(current)) continue;
    const next = APPROVAL_MAP[current];
    if (next) {
      plan.push({
        id: row.id,
        releaseCode: row.releaseCode,
        name: row.name,
        from: current,
        to: next,
      });
    } else {
      unknown.push({ releaseCode: row.releaseCode, approvalStatus: current });
    }
  }

  console.log(`\nRows to remap: ${plan.length}`);
  const byPair = new Map<string, number>();
  for (const item of plan) {
    const key = `${item.from} → ${item.to}`;
    byPair.set(key, (byPair.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...byPair.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
  if (plan.length && plan.length <= 20) {
    for (const item of plan) {
      console.log(`    ${item.releaseCode}: ${item.from} → ${item.to}`);
    }
  } else if (plan.length) {
    console.log(`  (sample) ${plan.slice(0, 5).map((p) => p.releaseCode).join(", ")} …`);
  }

  if (unknown.length) {
    console.log(`\nUNKNOWN approvalStatus values (not remapped): ${unknown.length}`);
    for (const item of unknown.slice(0, 20)) {
      console.log(`  ${item.releaseCode}: ${item.approvalStatus}`);
    }
    throw new Error(
      "Aborting: unknown approvalStatus values need an explicit mapping decision"
    );
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    return;
  }

  if (plan.length === 0) {
    console.log("Nothing to apply.");
    return;
  }

  let updated = 0;
  for (const item of plan) {
    await prisma.$transaction(async (tx) => {
      const result = await tx.release.updateMany({
        where: { id: item.id, approvalStatus: item.from },
        data: { approvalStatus: item.to },
      });
      if (result.count !== 1) return;
      await tx.releaseAuditEvent.create({
        data: {
          releaseId: item.id,
          action: ACTION,
          actor: ACTOR,
          detail: `Approval Status migration: ${item.from} → ${item.to}`,
        },
      });
      updated += 1;
    });
  }

  const after = await prisma.release.groupBy({
    by: ["approvalStatus"],
    _count: { _all: true },
    orderBy: { approvalStatus: "asc" },
  });
  console.log(`\nUpdated ${updated} row(s). After distribution:`);
  for (const row of after) {
    console.log(`  ${row.approvalStatus ?? "(null)"}: ${row._count._all}`);
  }

  const polluted = await prisma.release.count({
    where: { approvalStatus: { in: Object.keys(APPROVAL_MAP) } },
  });
  if (polluted > 0) {
    throw new Error(
      `Migration incomplete: ${polluted} lifecycle-word approvalStatus row(s) remain`
    );
  }
  console.log("OK — no Draft/Planning/Testing/CAB Submitted left in approvalStatus.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
